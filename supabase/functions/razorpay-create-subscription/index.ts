import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Creates a Razorpay Subscription for the caller's organisation, server-side
// (uses RAZORPAY_KEY_SECRET — never exposed to the client). The frontend opens
// Razorpay Checkout with the returned subscription_id; the mandate + first charge
// are confirmed via the razorpay-webhook function, which applies the plan.
//
// Requires a valid user JWT (deploy WITH jwt verification — default).
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (set via `supabase secrets set`).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const { plan_key, billing_period, organization_id } = await req.json()
    if (!plan_key || !organization_id) return json({ error: 'Missing plan_key or organization_id' }, 400)

    const KEY_ID      = Deno.env.get('RAZORPAY_KEY_ID')
    const KEY_SECRET  = Deno.env.get('RAZORPAY_KEY_SECRET')
    const SUPA_URL    = Deno.env.get('SUPABASE_URL')!
    const ANON        = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!KEY_ID || !KEY_SECRET) return json({ error: 'Razorpay keys not configured on the server.' }, 500)

    // 1. Identify the caller from their JWT
    const userClient = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(SUPA_URL, SERVICE)

    // 2. Caller must be an active owner of the org
    const { data: membership } = await admin.from('organization_users')
      .select('id').eq('organization_id', organization_id).eq('user_id', user.id)
      .eq('role', 'owner').eq('is_active', true).maybeSingle()
    if (!membership) return json({ error: 'Only the owner can manage billing.' }, 403)

    // 3. Resolve the Razorpay plan id for the chosen cycle
    const period = billing_period === 'yearly' ? 'yearly' : 'monthly'
    const { data: plan } = await admin.from('plans').select('*').eq('key', plan_key).maybeSingle()
    if (!plan) return json({ error: 'Plan not found' }, 404)
    const rzpPlanId = period === 'yearly' ? plan.razorpay_plan_id_yearly : plan.razorpay_plan_id_monthly
    if (!rzpPlanId) return json({ error: `This plan isn't set up for ${period} payments yet. Add its Razorpay plan id in the admin Plans page.` }, 400)

    const auth = 'Basic ' + btoa(`${KEY_ID}:${KEY_SECRET}`)

    // 4. Create the subscription (Checkout captures the customer + mandate).
    //    "3 months free trial": authorise autopay now, but defer the first charge
    //    by TRIAL_DAYS via start_at (set TRIAL_DAYS = 0 to charge immediately).
    const TRIAL_DAYS  = 90
    const total_count = period === 'yearly' ? 5 : 60 // cap cycles (≈5 yrs); Razorpay requires it
    const start_at    = Math.floor(Date.now() / 1000) + TRIAL_DAYS * 24 * 60 * 60
    const subRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: rzpPlanId,
        total_count,
        customer_notify: 1,
        ...(TRIAL_DAYS > 0 ? { start_at } : {}),
        notes: { organization_id, plan_key, billing_period: period, user_id: user.id },
      }),
    })
    const sub = await subRes.json()
    if (!subRes.ok) return json({ error: sub?.error?.description || 'Could not create the subscription.' }, 400)

    // 5. Record it as pending — the webhook applies the plan after the first charge
    await admin.from('organizations').update({
      razorpay_subscription_id: sub.id,
      subscription_status:      sub.status || 'created',
      pending_plan:             plan_key,
      pending_billing_period:   period,
    }).eq('id', organization_id)

    return json({ subscription_id: sub.id, key_id: KEY_ID })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
