import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { GRACE_DAYS } from '../lib/subscription'

/**
 * Guards a route:
 *  - Not logged in          → /login
 *  - Logged in, no org      → /setup
 *  - Logged in, has org     → render children
 *
 * Optional `requireRole` prop — if set, redirects to /dashboard if role doesn't match.
 */
export default function ProtectedRoute({ children, requireRole }) {
  const { user, organization, serviceBlocked, subscriptionState, isOwner, signOut, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (serviceBlocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm border border-gray-100 p-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-100 mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {serviceBlocked === 'suspended' ? 'Service Suspended' : 'Service Cancelled'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {serviceBlocked === 'suspended'
              ? "Your organisation's access has been temporarily suspended. Please contact support to resolve this."
              : "Your organisation's service has been cancelled. Please contact support."}
          </p>
          <p className="text-sm font-medium text-amber-600">support@kokarako.com</p>
        </div>
      </div>
    )
  }

  // Subscription lapsed past the grace window → pause access. The session is kept
  // so the owner can still reach the renewal page and pay; everything else is gated.
  if (subscriptionState?.blocked && location.pathname !== '/choose-plan') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-sm border border-gray-100 p-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-red-100 mb-6">
            <span className="text-3xl">⏳</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Subscription expired</h1>
          <p className="text-sm text-gray-500 mb-6">
            Your subscription ended and the {GRACE_DAYS}-day grace period has passed, so access is paused.
            {isOwner
              ? ' Renew now to restore access for your whole team.'
              : ' Please ask your organisation’s owner to renew the subscription.'}
          </p>
          {isOwner && (
            <button onClick={() => navigate('/choose-plan')}
              className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition">
              Renew subscription
            </button>
          )}
          <button onClick={signOut} className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition">
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!organization) {
    return <Navigate to="/setup" replace />
  }

  return children
}
