import { supabase } from './supabaseClient'

/**
 * Upsert stock after a procurement entry.
 * Matches on item_name (case-insensitive trim).
 * If found → increments quantity.
 * If not found → creates a new row with reorder_level = 0.
 */
export async function addToStock(itemName, quantity, unit, costPerUnit = 0) {
  const name = itemName.trim()

  const { data: existing } = await supabase
    .from('stock')
    .select('id, quantity, avg_cost')
    .ilike('item_name', name)
    .maybeSingle()

  if (existing) {
    const oldQty  = Number(existing.quantity)
    const newQty  = oldQty + Number(quantity)
    const oldCost = Number(existing.avg_cost || 0)
    const cpu     = Number(costPerUnit || 0)
    // Weighted average cost
    const newAvg  = cpu > 0
      ? (oldQty * oldCost + Number(quantity) * cpu) / newQty
      : oldCost
    return supabase
      .from('stock')
      .update({ quantity: newQty, avg_cost: newAvg })
      .eq('id', existing.id)
  }

  return supabase.from('stock').insert({
    item_name:     name,
    quantity:      Number(quantity),
    unit,
    reorder_level: 0,
    avg_cost:      Number(costPerUnit || 0),
  })
}

/**
 * Subtract from stock (feed distribution, medicine use, etc.)
 * Clamps at 0 — won't go negative.
 */
export async function subtractFromStock(stockId, currentQty, amount) {
  const newQty = Math.max(0, Number(currentQty) - Number(amount))
  return supabase
    .from('stock')
    .update({ quantity: newQty })
    .eq('id', stockId)
}
