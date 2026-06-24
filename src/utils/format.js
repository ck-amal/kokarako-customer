// ─── Global formatting utilities ─────────────────────────────────────────────
// ALL currency displays in the app must use these functions.
// Never use raw number interpolation for money values.

/**
 * Format any number as currency — always exactly 2 decimal places.
 * Uses Indian locale (en-IN) for lakh/crore comma placement.
 * e.g. 25555.556 → ₹25,555.56
 */
export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(Number(value))) return '₹0.00'
  return '₹' + Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format currency with no decimal places (for large round numbers in badges/pills).
 * e.g. 25555 → ₹25,555
 */
export function formatCurrencyRound(value) {
  if (value === null || value === undefined || isNaN(Number(value))) return '₹0'
  return '₹' + Math.round(Number(value)).toLocaleString('en-IN')
}

/**
 * Round a number to exactly 2 decimal places for calculations.
 * Prevents floating point drift before storing or displaying.
 * e.g. 25555.5555... → 25555.56
 */
export function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

/**
 * Format FCR to exactly 2 decimal places.
 * e.g. 1.8499... → "1.85"
 */
export function formatFCR(value) {
  if (value === null || value === undefined || isNaN(Number(value))) return '—'
  return Number(value).toFixed(2)
}
