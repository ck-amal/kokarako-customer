import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Verifies the Razorpay Checkout success response for a subscription and activates
// the org's plan — independent of webhooks (so the trial unlocks the moment the
// mandate is approved, without depending on the `subscription.authenticated` event
// which Razorpay doesn't expose as a subscribable webhook).
//
// For subscriptions, Razorpay signs `razorpay_payment_id | razorpay_subscription_id`
// with the key secret. Requires a valid user JWT (deploy WITH jwt verification).
// Secret: RAZORPAY_KEY_SECRET.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, organization_id } = await req.json()
    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature || !organization_id) {
      return json({ error: 'Missing verification fields' }, 400)
    }

    const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')
    const SUPA_URL   = Deno.env.get('SUPABASE_URL')!
    const ANON       = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!KEY_SECRET) return json({ error: 'Razorpay key not configured on the server.' }, 500)

    // 1. Caller must be an active owner of the org
    const userClient = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(SUPA_URL, SERVICE)
    const { data: membership } = await admin.from('organization_users')
      .select('id').eq('organization_id', organization_id).eq('user_id', user.id)
      .eq('role', 'owner').eq('is_active', true).maybeSingle()
    if (!membership) return json({ error: 'Only the owner can manage billing.' }, 403)

    // 2. Verify Razorpay's signature: HMAC(payment_id | subscription_id, secret)
    const expected = await hmacSha256Hex(KEY_SECRET, `${razorpay_payment_id}|${razorpay_subscription_id}`)
    if (expected !== razorpay_signature) return json({ error: 'Payment verification failed.' }, 400)

    // 3. The subscription must be the one we created for this org
    const { data: org } = await admin.from('organizations')
      .select('id, pending_plan, pending_billing_period, razorpay_subscription_id')
      .eq('id', organization_id).single()
    if (!org || org.razorpay_subscription_id !== razorpay_subscription_id) {
      return json({ error: 'Subscription does not match this organisation.' }, 400)
    }

    // 4. Activate the plan (trial starts now; first charge is deferred by Razorpay)
    await admin.from('organizations').update({
      subscription_status:    'active',
      subscription_plan:      org.pending_plan || undefined,
      billing_period:         org.pending_billing_period || 'monthly',
      pending_plan:           null,
      pending_billing_period: null,
    }).eq('id', org.id)

    return json({ success: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
