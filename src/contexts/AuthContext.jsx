import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getSubscriptionState } from '../lib/subscription'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,            setUser]            = useState(undefined) // undefined = loading
  const [organization,    setOrganization]    = useState(null)
  const [userRole,        setUserRole]        = useState(null)
  const [serviceBlocked,  setServiceBlocked]  = useState(null) // null | 'suspended' | 'cancelled'
  const [loading,         setLoading]         = useState(true)

  // Load org + role for a given auth user
  async function loadOrgContext(authUser) {
    if (!authUser) {
      setUser(null)
      setOrganization(null)
      setUserRole(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setUser(authUser)

    const { data: ouRows } = await supabase
      .from('organization_users')
      .select('organization_id, role, organizations(id, name, business_name, phone, address, subscription_plan, billing_period, subscription_status, current_period_end, is_active)')
      .eq('user_id', authUser.id)
      .eq('is_active', true)

    const rows = ouRows || []

    if (rows.length === 0) {
      // New user — no org yet; ProtectedRoute will redirect to /setup
      setOrganization(null)
      setUserRole(null)
      setServiceBlocked(null)
    } else {
      let match
      if (rows.length === 1) {
        match = rows[0]
      } else {
        const storedOrgId = sessionStorage.getItem('selectedOrgId')
        match = rows.find(r => r.organization_id === storedOrgId) || rows[0]
      }
      const org = match.organizations
      // Check service status — suspended/cancelled blocks access
      if (org?.service_status === 'suspended' || org?.service_status === 'cancelled') {
        setServiceBlocked(org.service_status)
        setOrganization(null)
        setUserRole(null)
        await supabase.auth.signOut()
      } else {
        setServiceBlocked(null)
        setOrganization(org)
        setUserRole(match.role)
      }
    }

    setLoading(false)
  }

  // Switch active organization (for multi-org users)
  async function selectOrganization(orgId) {
    if (!user) return
    sessionStorage.setItem('selectedOrgId', orgId)
    const { data: ouRows } = await supabase
      .from('organization_users')
      .select('role, organizations(*)')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single()
    if (ouRows) {
      setOrganization(ouRows.organizations)
      setUserRole(ouRows.role)
    }
  }

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      loadOrgContext(data.session?.user ?? null)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadOrgContext(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    sessionStorage.removeItem('selectedOrgId')
    await supabase.auth.signOut()
  }

  // ── Derived permission booleans ──────────────────────────────────────────
  const isOwner           = userRole === 'owner'
  const isManager         = userRole === 'manager'
  const isFarmSupervisor  = userRole === 'farm_supervisor'
  const isAccountant      = userRole === 'accountant'
  const isViewer          = userRole === 'viewer'

  // Can create/update records (not delete)
  const canEdit              = isOwner || isManager
  // Can delete records
  const canDelete            = isOwner
  // Can see P&L, Cash & Bank, financial reports
  const canViewFinancials    = isOwner || isManager || isAccountant
  // Can record distributions, sales, expenses
  const canRecordOperations  = isOwner || isManager || isFarmSupervisor
  // Can manage team and org settings
  const canManageUsers       = isOwner

  // Subscription lifecycle (paid-through date → warn / grace / block)
  const subscriptionState = getSubscriptionState(organization)

  const value = {
    user,
    organization,
    userRole,
    serviceBlocked,
    subscriptionState,
    loading,
    // role booleans
    isOwner,
    isManager,
    isFarmSupervisor,
    isAccountant,
    isViewer,
    // permission booleans
    canEdit,
    canDelete,
    canViewFinancials,
    canRecordOperations,
    canManageUsers,
    // actions
    signOut,
    selectOrganization,
    refreshOrg: async () => {
      // Re-fetch the current session and reload org context.
      // Using getSession() ensures auth.uid() is fresh in subsequent queries.
      const { data } = await supabase.auth.getSession()
      await loadOrgContext(data.session?.user ?? null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
