// Subscription lifecycle — single source of truth for the settings page, the
// dashboard banner, and the access gate. Driven by organizations.current_period_end
// (the paid-through date the Razorpay webhook stamps on every successful charge).

export const GRACE_DAYS = 7   // service keeps running this many days past the period end
export const WARN_DAYS  = 7   // start warning this many days before the period ends

const DAY = 86_400_000

// Derive the lifecycle for an organization.
//   hasSubscription — a paid period is on record (else: free / never subscribed)
//   periodEnd       — Date the current paid period ends/ended
//   daysLeft        — whole days until periodEnd (negative once past)
//   endingSoon      — within WARN_DAYS of the end, not yet ended
//   ended           — period end has passed
//   inGrace         — ended but still inside the GRACE_DAYS window (service stays on)
//   blocked         — past the grace window → service should stop
//   graceDaysLeft   — whole days until service stops (counts down through the grace window)
export function getSubscriptionState(org, now = Date.now()) {
  const periodEnd = org?.current_period_end ? new Date(org.current_period_end).getTime() : null
  const plan = org?.subscription_plan || 'free'

  // No paid period on record → nothing to expire (genuinely free / never subscribed).
  if (!periodEnd || Number.isNaN(periodEnd)) {
    return {
      hasSubscription: false, periodEnd: null, daysLeft: null,
      endingSoon: false, ended: false, inGrace: false, blocked: false,
      graceDaysLeft: null, plan,
    }
  }

  const daysLeft = Math.ceil((periodEnd - now) / DAY)
  const ended    = now >= periodEnd
  const blockAt  = periodEnd + GRACE_DAYS * DAY
  const blocked  = now >= blockAt
  const inGrace  = ended && !blocked
  const graceDaysLeft = ended ? Math.max(0, Math.ceil((blockAt - now) / DAY)) : null
  const endingSoon = !ended && daysLeft <= WARN_DAYS

  return {
    hasSubscription: true, periodEnd: new Date(periodEnd), daysLeft,
    endingSoon, ended, inGrace, blocked, graceDaysLeft, plan,
  }
}

export function formatSubDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
