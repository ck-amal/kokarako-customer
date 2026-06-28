import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatSubDate } from '../lib/subscription'

// Dashboard-level subscription notice. Renders only when the subscription is
// ending soon or has ended (still inside the grace window). Owners get a Renew CTA.
export default function SubscriptionBanner() {
  const { subscriptionState: s, isOwner } = useAuth()
  if (!s || (!s.endingSoon && !s.inGrace)) return null

  // Ended → urgent red notice with the grace countdown.
  if (s.inGrace) {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-red-700">⚠️ Your subscription has ended</p>
          <p className="text-xs text-red-600 mt-0.5">
            Service will stop in <span className="font-semibold">{s.graceDaysLeft} day{s.graceDaysLeft === 1 ? '' : 's'}</span> if
            no payment is made (ended {formatSubDate(s.periodEnd)}). Renew now to avoid losing access.
          </p>
        </div>
        {isOwner && (
          <Link to="/choose-plan"
            className="shrink-0 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white transition">
            Renew now →
          </Link>
        )}
      </div>
    )
  }

  // Ending soon → amber heads-up.
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-800">⏳ Your subscription ends in {s.daysLeft} day{s.daysLeft === 1 ? '' : 's'}</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Renews on {formatSubDate(s.periodEnd)}. Renew to avoid any interruption to your service.
        </p>
      </div>
      {isOwner && (
        <Link to="/choose-plan"
          className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition">
          Renew now →
        </Link>
      )}
    </div>
  )
}
