import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { invitation_id, app_url } = await req.json()

    if (!invitation_id || !app_url) {
      return new Response(JSON.stringify({ error: 'Missing invitation_id or app_url' }), { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: inv, error: invErr } = await supabase
      .from('invitations')
      .select('id, email, role, token, expires_at, organizations(name)')
      .eq('id', invitation_id)
      .single()

    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: 'Invitation not found' }), { status: 404, headers: corsHeaders })
    }

    const inviteLink = `${app_url}/invite/${inv.token}`
    const orgName = (inv.organizations as any)?.name || 'Poultry Manager'
    const role = inv.role.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    const expiresDate = new Date(inv.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers: corsHeaders })
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fefce8; margin: 0; padding: 40px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #f59e0b; padding: 32px; text-align: center;">
      <div style="font-size: 40px; margin-bottom: 8px;">🐔</div>
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">You're invited to join</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px; font-weight: 600;">${orgName}</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #374151; font-size: 15px; margin: 0 0 8px;">You've been invited as a <strong>${role}</strong> on Poultry Manager.</p>
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 28px;">This invitation expires on ${expiresDate}.</p>
      <a href="${inviteLink}" style="display: block; background: #f59e0b; color: white; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-weight: 700; font-size: 15px;">Accept Invitation</a>
      <p style="color: #9ca3af; font-size: 12px; margin: 20px 0 0; word-break: break-all;">Or copy this link: ${inviteLink}</p>
    </div>
  </div>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Poultry Manager <noreply@kokarako.com>',
        to: [inv.email],
        subject: `You're invited to join ${orgName} on Poultry Manager`,
        html: emailHtml,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return new Response(JSON.stringify({ error: errBody }), { status: 500, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
