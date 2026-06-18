import { supabase } from './supabaseClient'

/**
 * Upsert stock after a procurement entry.
 * Matches on item_name (case-insensitive trim).
 * If found → increments quantity.
 * If not found → creates a new row with reorder_level = 0.
 */
export async function addToStock(itemName, quantity, unit) {
  const name = itemName.trim()

  const { data: existing } = await supabase
    .from('stock')
    .select('id, quantity')
    .ilike('item_name', name)
    .maybeSingle()

  if (existing) {
    return supabase
      .from('stock')
      .update({ quantity: Number(existing.quantity) + Number(quantity) })
      .eq('id', existing.id)
  }

  return supabase.from('stock').insert({
    item_name:     name,
    quantity:      Number(quantity),
    unit,
    reorder_level: 0,
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
