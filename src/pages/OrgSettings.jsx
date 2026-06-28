import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrencyRound } from '../utils/format'
import PlanCard from '../components/PlanCard'
import { subscribeToPlan } from '../lib/razorpay'
import { getSubscriptionState, formatSubDate } from '../lib/subscription'

// ─── Plan display helpers ─────────────────────────────────────────────────────
function planPriceLabel(plan) {
  const n = Number(plan?.price_monthly)
  return !n ? 'Free' : `${formatCurrencyRound(n)}/mo`
}
function planKeyLabel(key) {
  const k = key || 'free'
  return k.charAt(0).toUpperCase() + k.slice(1)
}
function limitLabel(max) {
  return max == null ? 'Unlimited' : max
}

export default function OrgSettings() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, organization, isOwner, canManageUsers, refreshOrg, signOut } = useAuth()

  const [form, setForm] = useState({
    name:          '',
    business_name: '',
    phone:         '',
    address:       '',
  })
  const [saving,        setSaving]        = useState(false)
  const [saveSuccess,   setSaveSuccess]   = useState(false)
  const [error,         setError]         = useState('')
  // Danger zone
  const [confirmName,   setConfirmName]   = useState('')
  const [deactivating,  setDeactivating]  = useState(false)
  const [dangerError,   setDangerError]   = useState('')
  // Subscription / plan
  const [plans,         setPlans]         = useState([])
  const [usage,         setUsage]         = useState({ farms: 0, users: 0 })
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planError,     setPlanError]     = useState('')
  const [billingByPlan, setBillingByPlan] = useState({}) // { key: 'monthly' | 'yearly' }
  const [busyPlan,      setBusyPlan]      = useState('')  // plan key being applied

  useEffect(() => {
    if (!canManageUsers) navigate('/dashboard')
  }, [canManageUsers])

  // All plans (active + inactive) so the org's current plan always resolves; the
  // change-plan modal filters to active ones. Plans table allows public SELECT.
  useEffect(() => {
    supabase
      .from('plans')
      .select('*')
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setPlans(data) })
  }, [])

  // Current usage — farms + active members — scoped to this org.
  useEffect(() => {
    if (!organization) return
    let cancelled = false
    ;(async () => {
      const [farmsRes, usersRes] = await Promise.all([
        supabase.from('farms')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organization.id),
        supabase.from('organization_users')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organization.id)
          .eq('is_active', true),
      ])
      if (!cancelled) setUsage({ farms: farmsRes.count || 0, users: usersRes.count || 0 })
    })()
    return () => { cancelled = true }
  }, [organization])

  const currentPlan = plans.find(p => p.key === (organization?.subscription_plan || 'free')) || null
  const activePlans = plans.filter(p => p.is_active)
  const sub = getSubscriptionState(organization)
  const isPaidPlan = currentPlan ? Number(currentPlan.price_monthly) > 0 : false

  function openPlanModal() {
    const cur = organization?.subscription_plan || 'free'
    setBillingByPlan({ [cur]: organization?.billing_period || 'monthly' })
    setPlanError('')
    setBusyPlan('')
    setShowPlanModal(true)
  }

  const billingFor = key => billingByPlan[key] || 'monthly'
  const setBilling = (key, period) => setBillingByPlan(b => ({ ...b, [key]: period }))

  async function choosePlan(plan) {
    if (busyPlan) return
    setBusyPlan(plan.key); setPlanError('')
    const billing = billingFor(plan.key)
    const isPaid = Number(plan.price_monthly) > 0
    try {
      if (isPaid) {
        // Paid → Razorpay subscription (autopay); webhook applies the plan on first charge.
        await subscribeToPlan({ supabase, organization, user, planKey: plan.key, billing })
      } else {
        const { data, error: rpcErr } = await supabase.rpc('change_organization_plan', {
          p_org_id: organization.id, p_user_id: user.id, p_plan_key: plan.key, p_billing_period: billing,
        })
        if (rpcErr)      throw new Error(rpcErr.message)
        if (data?.error) throw new Error(data.error)
      }
      await refreshOrg()
      setShowPlanModal(false)
    } catch (e) {
      if (e.message !== 'DISMISSED') setPlanError(e.message || String(e))
      setBusyPlan('')
    }
  }

  useEffect(() => {
    if (organization) {
      setForm({
        name:          organization.name          || '',
        business_name: organization.business_name || '',
        phone:         organization.phone         || '',
        address:       organization.address       || '',
      })
    }
  }, [organization])

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError(t('org.orgNameRequired')); return }
    setSaving(true); setError(''); setSaveSuccess(false)

    const { error: err } = await supabase
      .from('organizations')
      .update({
        name:          form.name.trim(),
        business_name: form.business_name.trim() || null,
        phone:         form.phone.trim()         || null,
        address:       form.address.trim()       || null,
      })
      .eq('id', organization.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    setSaveSuccess(true)
    await refreshOrg()
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  async function handleDeactivate() {
    if (confirmName !== organization.name) {
      setDangerError(t('org.orgNameMismatch')); return
    }
    setDeactivating(true); setDangerError('')

    const { error: err } = await supabase
      .from('organizations')
      .update({ is_active: false })
      .eq('id', organization.id)

    if (err) { setDangerError(err.message); setDeactivating(false); return }
    await signOut()
    navigate('/login')
  }

  if (!organization) return null

  return (
    <div className="space-y-6 max-w-2xl">

      <div>
        <h1 className="text-2xl font-bold text-gray-800">{t('org.orgSettings')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('org.manageBusinessDetails')}</p>
      </div>

      {/* Business Details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{t('org.businessDetails')}</h2>
        <form onSubmit={handleSave} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.organisationName')} *</label>
            <input required type="text" value={form.name} onChange={set('name')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.businessName')}</label>
            <input type="text" value={form.business_name} onChange={set('business_name')}
              placeholder={t('org.tradingName')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.phone')}</label>
            <input type="tel" value={form.phone} onChange={set('phone')}
              placeholder="+91 98765 43210"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.address')}</label>
            <textarea value={form.address} onChange={set('address')} rows={2}
              placeholder={t('org.farmAddress')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {saveSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {t('org.savedSuccessfully')}</p>}

          <button type="submit" disabled={saving}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white transition">
            {saving ? t('org.saving') : t('org.saveChanges')}
          </button>
        </form>
      </div>

      {/* Subscription */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{t('org.subscription')}</h2>
          {isOwner && (
            <button
              onClick={openPlanModal}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition"
            >
              Change plan
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold">
            {currentPlan ? currentPlan.name : planKeyLabel(organization.subscription_plan)} {t('org.plan_label')}
          </span>
          {currentPlan && <span className="text-sm font-medium text-gray-500">{planPriceLabel(currentPlan)}</span>}
        </div>

        {/* Billing status & renewal date — always shown so the section is informative */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm mb-4">
          {sub.hasSubscription ? (
            <>
              <span className="text-gray-500">{sub.ended ? 'Subscription ended on' : 'Renews on'}</span>
              <span className="font-semibold text-gray-800">{formatSubDate(sub.periodEnd)}</span>
              {organization.billing_period && (
                <span className="text-xs text-gray-400">· billed {organization.billing_period}</span>
              )}
            </>
          ) : isPaidPlan ? (
            <span className="text-gray-500">Renewal date will appear after your first billing charge.</span>
          ) : (
            <span className="text-gray-500">No active paid subscription.</span>
          )}
          {organization.subscription_status && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium capitalize">
              {organization.subscription_status}
            </span>
          )}
        </div>

        {/* Ending soon — amber heads-up */}
        {sub.endingSoon && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">
              ⏳ Your subscription ends in {sub.daysLeft} day{sub.daysLeft === 1 ? '' : 's'}.
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Renew before {formatSubDate(sub.periodEnd)} to avoid any interruption to your service.
            </p>
          </div>
        )}

        {/* Ended, in grace — red, with countdown to service stop */}
        {sub.inGrace && (
          <div className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">⚠️ Your subscription has ended.</p>
            <p className="text-xs text-red-600 mt-0.5">
              Service will stop in {sub.graceDaysLeft} day{sub.graceDaysLeft === 1 ? '' : 's'} if no payment is made.
              Renew now to keep your team’s access.
            </p>
            {isOwner && (
              <button onClick={openPlanModal}
                className="mt-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-1.5 text-sm font-semibold text-white transition">
                Renew now
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Farms</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">
              {usage.farms} <span className="text-sm font-normal text-gray-400">/ {limitLabel(currentPlan?.max_farms)}</span>
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Users</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">
              {usage.users} <span className="text-sm font-normal text-gray-400">/ {limitLabel(currentPlan?.max_users)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6">
        <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wider mb-4">{t('org.dangerZone')}</h2>
        <div className="space-y-3">
          <p className="text-sm text-gray-700 font-medium">{t('org.deactivateOrg')}</p>
          <p className="text-sm text-gray-500">
            {t('org.deactivateWarning')}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('org.typeToConfirm', { name: organization.name })}
            </label>
            <input type="text" value={confirmName} onChange={e => setConfirmName(e.target.value)}
              placeholder={t('org.orgNamePlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          {dangerError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{dangerError}</p>}
          <button
            onClick={handleDeactivate}
            disabled={deactivating || confirmName !== organization.name}
            className="rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 px-5 py-2 text-sm font-semibold text-white transition"
          >
            {deactivating ? t('org.deactivating') : t('org.deactivateButton')}
          </button>
        </div>
      </div>

      {/* Change-plan modal (owner only) — same cards as the onboarding Choose-plan page */}
      {showPlanModal && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-lg font-semibold text-gray-800">Change plan</h2>
              <button onClick={() => setShowPlanModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label="Close">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Pick the plan that fits your operation — each has its own monthly/yearly option. Downgrades are blocked while you're over the new plan's limits.
            </p>

            {planError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-5">{planError}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
              {activePlans.map(plan => {
                const isCurrent     = (organization.subscription_plan || 'free') === plan.key
                const isCurrentSame = isCurrent && billingFor(plan.key) === (organization.billing_period || 'monthly')
                return (
                  <PlanCard
                    key={plan.key}
                    plan={plan}
                    billing={billingFor(plan.key)}
                    onBilling={p => setBilling(plan.key, p)}
                    onChoose={() => choosePlan(plan)}
                    busy={busyPlan === plan.key}
                    disabled={!!busyPlan}
                    ctaDisabled={isCurrentSame}
                    current={isCurrent}
                    popular={plan.key === 'pro'}
                    showTrial={false}
                    ctaLabel={isCurrent ? (isCurrentSame ? 'Current plan' : 'Update billing') : undefined}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
