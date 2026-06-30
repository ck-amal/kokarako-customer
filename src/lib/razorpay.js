// Razorpay Checkout helper for subscription (autopay) plans.
// The secret key stays server-side (edge function); the client only ever sees the
// public key_id + the subscription_id returned by `razorpay-create-subscription`.

let scriptPromise = null

export function loadRazorpay() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
  return scriptPromise
}

// Pulls the real reason out of a supabase.functions.invoke result. On a non-2xx
// response supabase-js only gives a generic "non-2xx status code" message — the
// actual error text is in the response body (error.context).
async function fnError(error, data) {
  if (data?.error) return data.error
  if (!error) return null
  try { const body = await error.context.json(); if (body?.error) return body.error } catch { /* not json */ }
  return error.message
}

// Creates the subscription server-side, then opens Razorpay Checkout for the
// customer to approve the mandate / make the first payment.
// Resolves on success; rejects with Error('DISMISSED') if the user closes Checkout.
export async function subscribeToPlan({ supabase, organization, user, planKey, billing }) {
  const { data, error } = await supabase.functions.invoke('razorpay-create-subscription', {
    body: { plan_key: planKey, billing_period: billing, organization_id: organization.id },
  })
  const createErr = await fnError(error, data)
  if (createErr) throw new Error(createErr)

  const ok = await loadRazorpay()
  if (!ok || !window.Razorpay) throw new Error('Could not load Razorpay Checkout. Check your connection.')

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key:             data.key_id,
      subscription_id: data.subscription_id,
      name:            organization?.name || 'Kokarako',
      description:     `${planKey} plan (${billing})`,
      prefill:         { email: user?.email || '' },
      theme:           { color: '#f59e0b' },
      handler: async (resp) => {
        // Verify the signature server-side + activate the plan (doesn't depend on webhooks)
        try {
          const { data: vData, error: vErr } = await supabase.functions.invoke('razorpay-verify-subscription', {
            body: {
              razorpay_payment_id:      resp.razorpay_payment_id,
              razorpay_subscription_id: resp.razorpay_subscription_id,
              razorpay_signature:       resp.razorpay_signature,
              organization_id:          organization.id,
            },
          })
          const vMsg = await fnError(vErr, vData)
          if (vMsg) throw new Error(vMsg)
          resolve(resp)
        } catch (e) { reject(e) }
      },
      modal:           { ondismiss: () => reject(new Error('DISMISSED')) },
    })
    rzp.on('payment.failed', (resp) => reject(new Error(resp?.error?.description || 'Payment failed')))
    rzp.open()
  })
}
