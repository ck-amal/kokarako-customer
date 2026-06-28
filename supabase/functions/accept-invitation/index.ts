import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Accepts a team invitation for a NEW user and creates their auth account
// pre-confirmed (email_confirm: true). The invite link was emailed to the
// address by `send-invitation`, so receiving + clicking it already proves the
// user owns that email — they don't need Supabase's separate email confirmation.
// This lets you keep "Confirm email" ON (which blocks fake self-signups like
// abc@abc.com) without breaking the invite flow.
//
// Deploy WITHOUT JWT verification — it's called by an anonymous (not-yet-signed-in)
// invited user and validates the invitation token itself:
//   supabase functions deploy accept-invitation --no-verify-jwt
//
// Handled outcomes return HTTP 200 with an { error, code } body so the client can
// read them via `data` (supabase-js only fills `data` on 2xx). Only unexpected
// failures return 500.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token, password, full_name } = await req.json()
    if (!token || !password) return json({ error: 'Missing token or password', code: 'BAD_REQUEST' })
    if (String(password).length < 8) return json({ error: 'Password must be at least 8 characters', code: 'WEAK_PASSWORD' })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Validate the invitation
    const { data: inv, error: invErr } = await admin
      .from('invitations')
      .select('id, organization_id, email, role, expires_at, accepted_at')
      .eq('token', token)
      .single()

    if (invErr || !inv) return json({ error: 'This invitation link is invalid.', code: 'INVALID' })
    if (inv.accepted_at) return json({ error: 'This invitation has already been used.', code: 'USED' })
    if (new Date(inv.expires_at) < new Date()) return json({ error: 'This invitation has expired.', code: 'EXPIRED' })

    // 2. Create the invited user — pre-confirmed (email comes from the invite, NOT user input)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || '' },
    })

    if (createErr) {
      const msg = String((createErr as { message?: string }).message || createErr)
      // Email already has an account → client should use the sign-in path instead
      if (/already|exist|registered|duplicate/i.test(msg)) return json({ error: 'Account already exists', code: 'ACCOUNT_EXISTS' })
      return json({ error: msg, code: 'CREATE_FAILED' })
    }

    const userId = created.user!.id

    // 3. Add them to the org (service role bypasses RLS); avoid a duplicate membership
    const { data: existing } = await admin
      .from('organization_users')
      .select('id')
      .eq('organization_id', inv.organization_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (!existing) {
      const { error: ouErr } = await admin.from('organization_users').insert({
        organization_id: inv.organization_id,
        user_id: userId,
        role: inv.role,
        is_active: true,
      })
      if (ouErr) return json({ error: ouErr.message, code: 'JOIN_FAILED' })
    }

    // 4. Mark the invitation accepted
    await admin.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id)

    return json({ success: true, user_id: userId })
  } catch (e) {
    return json({ error: String(e), code: 'SERVER_ERROR' }, 500)
  }
})
