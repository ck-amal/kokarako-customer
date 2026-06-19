import { supabase } from './supabaseClient'

/**
 * Record a stock-IN movement (procurement received).
 */
export async function ledgerIn({ itemName, itemType, quantity, unit, referenceType, referenceId, date }) {
  return supabase.from('stock_ledger').insert({
    item_name:      itemName,
    item_type:      itemType,
    change_type:    'in',
    quantity:       Number(quantity),
    unit,
    reference_type: referenceType,
    reference_id:   referenceId,
    date,
  })
}

/**
 * Record a stock-OUT movement (batch placement or distribution).
 */
export async function ledgerOut({ itemName, itemType, quantity, unit, referenceType, referenceId, date }) {
  return supabase.from('stock_ledger').insert({
    item_name:      itemName,
    item_type:      itemType,
    change_type:    'out',
    quantity:       Number(quantity),
    unit,
    reference_type: referenceType,
    reference_id:   referenceId,
    date,
  })
}

/**
 * Return current chick balance (in - out) from stock_ledger.
 */
export async function getChickBalance() {
  const { data } = await supabase
    .from('stock_ledger')
    .select('change_type, quantity')
    .eq('item_type', 'chicks')

  return (data || []).reduce((bal, row) => {
    return bal + (row.change_type === 'in' ? Number(row.quantity) : -Number(row.quantity))
  }, 0)
}

/**
 * Calculate weighted-average cost per unit for an item
 * from all procurement records (total cost / total quantity).
 */
export async function getAverageCostPerUnit(itemName) {
  const { data } = await supabase
    .from('procurement')
    .select('quantity, cost')
    .ilike('item_name', itemName)

  const totalQty  = (data || []).reduce((s, r) => s + Number(r.quantity || 0), 0)
  const totalCost = (data || []).reduce((s, r) => s + Number(r.cost || 0), 0)
  return totalQty > 0 ? totalCost / totalQty : 0
}
