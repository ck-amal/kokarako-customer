import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import PlanCard from '../components/PlanCard'
import { subscribeToPlan } from '../lib/razorpay'

export default function ChoosePlan() {
  const navigate = useNavigate()
  const { user, organization, refreshOrg } = useAuth()
  const [plans, setPlans]                 = useState([])
  const [billingByPlan, setBillingByPlan] = useState({}) // { key: 'monthly' | 'yearly' }
  const [busy, setBusy]                   = useState('')  // plan key being submitted
  const [error, setError]                 = useState('')

  useEffect(() => {
    supabase.from('plans').select('*').eq('is_active', true).order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setPlans(data) })
  }, [])

  const billingFor = key => billingByPlan[key] || 'monthly'
  const setBilling = (key, period) => setBillingByPlan(b => ({ ...b, [key]: period }))

  async function choose(plan) {
    if (busy) return
    setBusy(plan.key); setError('')
    const billing = billingFor(plan.key)
    const isPaid = Number(plan.price_monthly) > 0
    try {
      if (isPaid) {
        // Paid → Razorpay subscription (autopay). The webhook applies the plan
        // after the first successful charge.
        await subscribeToPlan({ supabase, organization, user, planKey: plan.key, billing })
      } else {
        // Free → apply immediately, no payment.
        const { data, error: rpcErr } = await supabase.rpc('change_organization_plan', {
          p_org_id: organization.id, p_user_id: user.id, p_plan_key: plan.key, p_billing_period: billing,
        })
        if (rpcErr)      throw new Error(rpcErr.message)
        if (data?.error) throw new Error(data.error)
      }
      await refreshOrg()
      navigate('/dashboard')
    } catch (e) {
      if (e.message !== 'DISMISSED') setError(e.message || String(e))
      setBusy('')
    }
  }

  return (
    <div className="min-h-screen bg-amber-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-500 shadow-lg mb-4">
            <span className="text-2xl">🚀</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Choose a plan for {organization?.name || 'your farm'}
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Start free or pick the plan that fits your operation. You can upgrade or switch billing anytime in Settings.
          </p>
        </div>

        {error && (
          <p className="max-w-md mx-auto mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {plans.map(plan => (
            <PlanCard
              key={plan.key}
              plan={plan}
              billing={billingFor(plan.key)}
              onBilling={p => setBilling(plan.key, p)}
              onChoose={() => choose(plan)}
              busy={busy === plan.key}
              disabled={!!busy}
              popular={plan.key === 'pro'}
            />
          ))}
        </div>

        {/* Skip */}
        <div className="text-center mt-8">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline">
            Skip for now — continue on the Free plan
          </button>
        </div>
      </div>
    </div>
  )
}
