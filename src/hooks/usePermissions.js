import { useAuth } from '../contexts/AuthContext'

/**
 * Returns granular action-level permission checks.
 * Usage:  const { can } = usePermissions()
 *         if (can('delete_farm')) { ... }
 */
export function usePermissions() {
  const { userRole, canEdit, canDelete, canViewFinancials, canRecordOperations, canManageUsers } = useAuth()

  function can(action) {
    switch (action) {
      // Farms
      case 'create_farm':        return canEdit
      case 'edit_farm':          return canEdit
      case 'delete_farm':        return canDelete

      // Batches
      case 'create_batch':       return canEdit
      case 'edit_batch':         return canEdit
      case 'close_batch':        return canEdit
      case 'delete_batch':       return canDelete

      // Procurement & stock
      case 'create_procurement': return canEdit
      case 'edit_procurement':   return canEdit
      case 'delete_procurement': return canDelete

      // Distributions & sales (farm_supervisor allowed)
      case 'record_distribution':return canRecordOperations
      case 'record_sale':        return canRecordOperations
      case 'record_expense':     return canRecordOperations
      case 'return_stock':       return canRecordOperations

      // Payments (NOT farm_supervisor)
      case 'record_payment':     return canEdit
      case 'record_advance':     return canEdit

      // Financial views
      case 'view_financials':    return canViewFinancials
      case 'view_pl_report':     return canViewFinancials
      case 'view_cash_bank':     return canViewFinancials
      case 'view_suppliers':     return canEdit || userRole === 'accountant'
      case 'view_growing_fees':  return canViewFinancials

      // Settings
      case 'manage_catalog':     return canEdit
      case 'manage_fee_config':  return userRole === 'owner'
      case 'manage_accounts':    return userRole === 'owner'
      case 'manage_org':         return userRole === 'owner'
      case 'manage_users':       return canManageUsers

      default:                   return false
    }
  }

  return { can, userRole, canEdit, canDelete, canViewFinancials, canRecordOperations, canManageUsers }
}
