import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Razorpay subscription webhook. Verifies the signature, dedupes by event id,
// and syncs the org's subscription_status / plan / current_period_end.
//
// Deploy WITHOUT jwt verification (Razorpay calls it directly):
//   supabase functions deploy razorpay-webhook --no-verify-jwt
// Secret: RAZORPAY_WEBHOOK_SECRET (the secret you set when creating the webhook
// in the Razorpay dashboard), set via `supabase secrets set`.

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  try {
    const raw = await req.text()
    const signature = req.headers.get('x-razorpay-signature') || ''
    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
    if (!secret) return new Response('webhook secret not configured', { status: 500 })

    // 1. Verify signature
    const expected = await hmacSha256Hex(secret, raw)
    if (expected !== signature) return new Response('invalid signature', { status: 400 })

    const event = JSON.parse(raw)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const sub   = event?.payload?.subscription?.entity
    const subId = sub?.id
    const eventId = req.headers.get('x-razorpay-event-id') || `${event?.event}:${subId}:${event?.created_at}`

    // 2. Idempotency — record the event; if it already exists, we've handled it
    const { error: dupErr } = await admin.from('subscription_events').insert({
      id: eventId, subscription_id: subId, event_type: event?.event, payload: event,
    })
    if (dupErr) return new Response('already processed', { status: 200 })

    // 3. Sync the org
    if (subId) {
      const { data: org } = await admin.from('organizations')
        .select('id, pending_plan, pending_billing_period')
        .eq('razorpay_subscription_id', subId).maybeSingle()

      if (org) {
        const update: Record<string, unknown> = { subscription_status: sub?.status }
        if (sub?.current_end) update.current_period_end = new Date(sub.current_end * 1000).toISOString()

        switch (event?.event) {
          case 'subscription.authenticated': // mandate approved → free trial starts, unlock the plan
          case 'subscription.activated':
          case 'subscription.charged':
            update.subscription_status = 'active'
            if (org.pending_plan) {
              update.subscription_plan       = org.pending_plan
              update.billing_period          = org.pending_billing_period || 'monthly'
              update.pending_plan            = null
              update.pending_billing_period  = null
            }
            break
          case 'subscription.cancelled':
          case 'subscription.completed':
          case 'subscription.expired':
            // Subscription ended → revert to the Free plan
            update.subscription_plan = 'free'
            break
          case 'subscription.halted':
          case 'subscription.pending':
            // Payment failing / retrying — keep status; app can warn/restrict
            break
        }
        await admin.from('organizations').update(update).eq('id', org.id)
      }
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    return new Response('error: ' + String(e), { status: 500 })
  }
})
