import { supabase } from './supabaseClient'
import { roundCurrency } from '../utils/format'

/**
 * Record a stock-IN movement (procurement received).
 */
export async function ledgerIn({ itemName, itemType, quantity, unit, referenceType, referenceId, date, organizationId }) {
  return supabase.from('stock_ledger').insert({
    item_name:       itemName,
    item_type:       itemType,
    change_type:     'in',
    quantity:        Number(quantity),
    unit,
    reference_type:  referenceType,
    reference_id:    referenceId,
    date,
    organization_id: organizationId,
  })
}

/**
 * Record a stock-OUT movement (batch placement or distribution).
 */
export async function ledgerOut({ itemName, itemType, quantity, unit, referenceType, referenceId, date, organizationId }) {
  return supabase.from('stock_ledger').insert({
    item_name:       itemName,
    item_type:       itemType,
    change_type:     'out',
    quantity:        Number(quantity),
    unit,
    reference_type:  referenceType,
    reference_id:    referenceId,
    date,
    organization_id: organizationId,
  })
}

/**
 * Return current chick balance (in - out) from stock_ledger.
 */
export async function getChickBalance(organizationId) {
  const { data } = await supabase
    .from('stock_ledger')
    .select('change_type, quantity')
    .eq('item_type', 'chicks')
    .eq('organization_id', organizationId)

  return (data || []).reduce((bal, row) => {
    return bal + (row.change_type === 'in' ? Number(row.quantity) : -Number(row.quantity))
  }, 0)
}

/**
 * Calculate weighted-average cost per unit for an item.
 *
 * Scope priority (most accurate → least):
 *  1. batch_id match  — requires procurement records to have batch_id set
 *  2. date >= startDate — works for existing data where batch_id is missing
 *  3. global average  — last resort only; produces wrong numbers when prices vary between batches
 *
 * Always pass at least startDate (the batch's start_date) when calling from a distribution context.
 */
export async function getAverageCostPerUnit(itemName, { batchId, startDate, organizationId } = {}) {
  // 1. Batch-scoped (most accurate — future data)
  if (batchId) {
    const { data } = await supabase
      .from('procurement')
      .select('quantity, cost')
      .ilike('item_name', itemName)
      .eq('batch_id', batchId)
      .eq('organization_id', organizationId)
    const rows = data || []
    if (rows.length > 0) {
      const totalQty  = rows.reduce((s, r) => s + Number(r.quantity || 0), 0)
      const totalCost = rows.reduce((s, r) => s + Number(r.cost || 0), 0)
      if (totalQty > 0) return roundCurrency(totalCost / totalQty)
    }
  }

  // 2. Date-scoped (works for existing data without batch_id on procurement)
  if (startDate) {
    const { data } = await supabase
      .from('procurement')
      .select('quantity, cost')
      .ilike('item_name', itemName)
      .gte('date', startDate)
      .eq('organization_id', organizationId)
    const rows = data || []
    if (rows.length > 0) {
      const totalQty  = rows.reduce((s, r) => s + Number(r.quantity || 0), 0)
      const totalCost = rows.reduce((s, r) => s + Number(r.cost || 0), 0)
      if (totalQty > 0) return roundCurrency(totalCost / totalQty)
    }
  }

  // 3. Global fallback — should rarely be reached; cross-batch average is inaccurate
  const { data } = await supabase
    .from('procurement')
    .select('quantity, cost')
    .ilike('item_name', itemName)
    .eq('organization_id', organizationId)
  const totalQty  = (data || []).reduce((s, r) => s + Number(r.quantity || 0), 0)
  const totalCost = (data || []).reduce((s, r) => s + Number(r.cost || 0), 0)
  return totalQty > 0 ? roundCurrency(totalCost / totalQty) : 0
}
