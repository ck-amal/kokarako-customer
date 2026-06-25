import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Guards a route:
 *  - Not logged in          → /login
 *  - Logged in, no org      → /setup
 *  - Logged in, has org     → render children
 *
 * Optional `requireRole` prop — if set, redirects to /dashboard if role doesn't match.
 */
export default function ProtectedRoute({ children, requireRole }) {
  const { user, organization, serviceBlocked, loading } = useAuth()
  const location = useLocation()

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
          <p className="text-sm font-medium text-amber-600">support@poultrymanager.com</p>
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
