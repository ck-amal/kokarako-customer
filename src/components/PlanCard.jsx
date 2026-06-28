import { formatCurrencyRound } from '../utils/format'

// Features every plan includes — the differentiators (farms/users) are shown
// separately and emphasised at the top of the list.
const COMMON_FEATURES = [
  'Batch & flock tracking',
  'Sales, procurement & expenses',
  'P&L, FCR & growing-fee reports',
  'Mobile app access',
]

export function yearlyOf(plan) {
  const m = Number(plan?.price_monthly) || 0
  return Number(plan?.price_yearly) > 0 ? Number(plan.price_yearly) : m * 10
}
export function savingsPct(plan) {
  const m = Number(plan?.price_monthly) || 0
  if (!m) return 0
  return Math.round((1 - yearlyOf(plan) / (m * 12)) * 100)
}

function Check({ muted = false }) {
  return (
    <svg className={`h-4 w-4 mt-0.5 shrink-0 ${muted ? 'text-amber-300' : 'text-amber-500'}`} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.42 0L3.3 9.7a1 1 0 011.4-1.42l3.29 3.3 6.8-6.8a1 1 0 011.42 0z" clipRule="evenodd" />
    </svg>
  )
}

// Shared subscription-plan card. Used by the onboarding Choose-plan page and the
// Org Settings change-plan modal so both stay visually identical.
export default function PlanCard({
  plan,
  billing = 'monthly',      // 'monthly' | 'yearly'
  onBilling,                // (period) => void
  onChoose,                 // () => void
  busy = false,             // this card is submitting
  disabled = false,         // interactions disabled (something submitting)
  ctaDisabled = false,      // disable only the CTA (e.g. it's already the current plan+period)
  current = false,          // org's current plan
  popular = false,          // highlight as recommended
  showTrial = true,         // show the "3 months free trial" badge (onboarding only)
  ctaLabel,                 // override the button label
}) {
  const free   = !(Number(plan?.price_monthly) > 0)
  const period = billing
  const m      = Number(plan.price_monthly) || 0
  const y      = yearlyOf(plan)
  const save   = savingsPct(plan)
  const priceMain = free ? 'Free' : period === 'yearly' ? formatCurrencyRound(y) : formatCurrencyRound(m)
  const priceUnit = free ? '' : period === 'yearly' ? '/yr' : '/mo'
  const farms = plan.max_farms == null ? 'Unlimited farms' : `${plan.max_farms} farm${plan.max_farms === 1 ? '' : 's'}`
  const users = plan.max_users == null ? 'Unlimited team members' : `${plan.max_users} team member${plan.max_users === 1 ? '' : 's'}`
  const defaultLabel = free ? 'Start with Free' : `Choose ${plan.name}`

  return (
    <div className={`relative flex flex-col rounded-2xl bg-white p-5 shadow-sm transition ${
      popular ? 'border-2 border-amber-400 ring-2 ring-amber-100 shadow-md'
      : current ? 'border-2 border-amber-500'
      : 'border border-gray-200 hover:border-amber-300'}`}>

      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-500 px-3 py-0.5 text-[11px] font-bold tracking-wide text-white shadow">MOST POPULAR</span>
      )}
      {current && !popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gray-800 px-3 py-0.5 text-[11px] font-bold tracking-wide text-white shadow">CURRENT PLAN</span>
      )}

      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
      <p className="text-xs text-gray-500 mt-1 leading-snug min-h-[32px]">
        {plan.description || (free ? 'Get started at no cost' : 'For growing operations')}
      </p>

      {/* Free-trial badge — onboarding only, paid plans only */}
      {showTrial && (
        <div className="mt-2.5 min-h-[26px]">
          {!free && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-[11px] font-bold text-green-700">🎁 3 months free trial</span>
          )}
        </div>
      )}

      {/* Price */}
      <div className="mt-3 mb-3">
        <div className="flex items-end gap-1">
          <span className="text-3xl font-extrabold text-gray-900 leading-none">{priceMain}</span>
          {priceUnit && <span className="text-sm font-medium text-gray-400 mb-0.5">{priceUnit}</span>}
        </div>
        {!free && period === 'yearly' && save > 0 && <p className="text-xs font-medium text-green-600 mt-1">≈ {formatCurrencyRound(y / 12)}/mo · save {save}%</p>}
        {!free && period === 'monthly' && <p className="text-xs text-gray-400 mt-1">billed monthly</p>}
        {free && <p className="text-xs text-gray-400 mt-1">free forever</p>}
      </div>

      {/* Per-card billing selector */}
      {!free ? (
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {['monthly', 'yearly'].map(p => (
            <button key={p} type="button" disabled={disabled} onClick={() => onBilling?.(p)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${period === p ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:border-amber-300'}`}>
              {p === 'monthly' ? 'Monthly' : <span className="inline-flex items-center gap-1">Yearly{save > 0 && <span className="text-green-600">−{save}%</span>}</span>}
            </button>
          ))}
        </div>
      ) : <div className="mb-4 h-[34px]" />}

      {/* Features */}
      <ul className="space-y-2 mb-5 flex-1">
        <li className="flex items-start gap-2 text-sm font-semibold text-gray-800"><Check /> {farms}</li>
        <li className="flex items-start gap-2 text-sm font-semibold text-gray-800"><Check /> {users}</li>
        {COMMON_FEATURES.map(f => <li key={f} className="flex items-start gap-2 text-xs text-gray-500"><Check muted /> {f}</li>)}
      </ul>

      <button onClick={onChoose} disabled={disabled || busy || ctaDisabled}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${popular ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm' : 'border-2 border-amber-500 text-amber-600 hover:bg-amber-50'}`}>
        {busy ? 'Setting up…' : (ctaLabel || defaultLabel)}
      </button>
    </div>
  )
}
