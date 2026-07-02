import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { ledgerIn, ledgerOut, getChickBalance } from '../lib/stockLedger'
import { addToStock } from '../lib/stockHelpers'
import { formatCurrency, roundCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

/**
 * Shared "Start New Batch" modal used by both Batches page and FarmDetail page.
 *
 * Props:
 *   farmId        — when set, hides the farm dropdown and checks farm capacity
 *   farms         — array of farm objects for the dropdown (Batches page)
 *   initialFarmId — pre-select a farm in the dropdown
 *   onClose / onSaved
 */
export default function NewBatchModal({ farmId, farms = [], initialFarmId, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t } = useTranslation()

  const fixedFarm = !!farmId

  const [form, setForm] = useState({
    farm_id:     farmId ?? initialFarmId ?? farms[0]?.id ?? '',
    chick_count: '',
    start_date:  new Date().toISOString().slice(0, 10),
  })

  const [chickBalance, setChickBalance] = useState(null)
  const [capacity,     setCapacity]     = useState(null)
  const [liveChicks,   setLiveChicks]   = useState(0)
  const [suppliers,    setSuppliers]    = useState([])
  const [accounts,     setAccounts]     = useState([])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const [purchases, setPurchases] = useState([
    { id: 1, count: '', pricePerChick: '', supplierId: '', payNow: false, accountId: '' },
  ])

  useEffect(() => {
    async function load() {
      const queries = [
        getChickBalance(organization?.id),
        supabase.from('suppliers').select('id, name').eq('is_active', true).eq('organization_id', organization?.id).order('name'),
        supabase.from('accounts').select('id, name, type').eq('is_active', true).eq('organization_id', organization?.id).order('name'),
      ]
      if (fixedFarm) {
        queries.push(
          supabase.from('farms').select('capacity').eq('id', farmId).eq('organization_id', organization?.id).single(),
          supabase.from('batches').select('chick_count, mortality_count').eq('farm_id', farmId).eq('organization_id', organization?.id).eq('status', 'active'),
        )
      }

      const [balance, { data: sups }, { data: accs }, farmRes, batchRes] = await Promise.all(queries)

      setChickBalance(balance)
      setSuppliers(sups || [])
      const accList = accs || []
      setAccounts(accList)
      const cashId = accList.find(a => a.type === 'cash')?.id ?? ''
      setPurchases([{ id: 1, count: '', pricePerChick: '', supplierId: '', payNow: false, accountId: cashId }])

      if (fixedFarm) {
        setCapacity(farmRes?.data?.capacity ?? null)
        setLiveChicks((batchRes?.data || []).reduce(
          (s, b) => s + Math.max(0, Number(b.chick_count || 0) - Number(b.mortality_count || 0)), 0
        ))
      }
    }
    load()
  }, [farmId])

  useEffect(() => {
    if (chickBalance === null) return
    const batchCount = Number(form.chick_count) || 0
    const shortfall  = Math.max(0, batchCount - chickBalance)
    if (shortfall > 0) {
      setPurchases(prev => prev.map((p, i) => i === 0 && !p.count ? { ...p, count: String(shortfall) } : p))
    }
  }, [chickBalance, form.chick_count])

  function set(field) { return e => setForm(prev => ({ ...prev, [field]: e.target.value })) }
  function updatePurchase(id, patch) { setPurchases(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p)) }
  function removePurchase(id) { setPurchases(prev => prev.filter(p => p.id !== id)) }
  function addPurchase() {
    const cashId    = accounts.find(a => a.type === 'cash')?.id ?? ''
    const remaining = stillShort > 0 ? String(stillShort) : ''
    setPurchases(prev => [...prev, { id: Date.now(), count: remaining, pricePerChick: '', supplierId: '', payNow: false, accountId: cashId }])
  }

  const chickCount     = Number(form.chick_count) || 0
  const shortfall      = chickBalance !== null ? Math.max(0, chickCount - chickBalance) : 0
  const needsPurchase  = chickBalance !== null && chickCount > 0 && chickBalance < chickCount
  const totalPurchased = purchases.reduce((s, p) => s + (Number(p.count) || 0), 0)
  const stillShort     = needsPurchase ? Math.max(0, shortfall - totalPurchased) : 0
  const remaining      = fixedFarm && capacity != null ? Math.max(0, capacity - liveChicks) : null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (remaining !== null && chickCount > remaining) {
      setError(`Exceeds farm capacity. Only ${remaining.toLocaleString('en-IN')} spots available.`)
      return
    }
    if (needsPurchase) {
      for (const p of purchases) {
        if (!p.count || Number(p.count) < 1) { setError('Enter chick count for each purchase'); return }
        if (!p.pricePerChick)                { setError('Enter price per chick for each purchase'); return }
      }
      if (totalPurchased < shortfall) {
        setError(`Still ${(shortfall - totalPurchased).toLocaleString('en-IN')} chicks short — add another purchase or increase the count`)
        return
      }
    }

    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    // Step 1: Create batch
    const { data: inserted, error: batchErr } = await supabase.from('batches').insert({
      organization_id: organization?.id,
      farm_id:         form.farm_id,
      chick_count:     chickCount,
      start_date:      form.start_date,
      status:          'active',
      created_by_id:   user?.id,
      created_by_name: userName,
    }).select('id').single()

    if (batchErr) { setError(batchErr.message); setSaving(false); return }

    // Step 2: Stock-sourced chicks — record at stock's current avg cost
    const stockChicksUsed = needsPurchase ? Math.min(chickBalance, chickCount) : chickCount
    if (stockChicksUsed > 0) {
      const { data: stockRow } = await supabase
        .from('stock')
        .select('avg_cost')
        .ilike('item_name', 'Chicks')
        .eq('organization_id', organization?.id)
        .maybeSingle()
      const pricePerChick = roundCurrency(Number(stockRow?.avg_cost || 0))
      await supabase.from('batch_chick_purchases').insert({
        organization_id: organization?.id,
        batch_id:        inserted.id,
        quantity:        stockChicksUsed,
        price_per_chick: pricePerChick,
        total_cost:      roundCurrency(stockChicksUsed * pricePerChick),
        source:          'stock',
        notes:           'Drawn from existing stock',
      })
    }

    // Step 3: Each inline purchase — procurement + ledgerIn records the FULL purchase;
    // batch_chick_purchases only records what the batch actually uses (≤ shortfall).
    // Any surplus chicks beyond shortfall stay in stock for future batches.
    if (needsPurchase) {
      let shortfallRemaining = shortfall  // chicks still needed for this batch from purchases

      for (const p of purchases) {
        const count     = Number(p.count)
        const price     = roundCurrency(parseFloat(p.pricePerChick))
        const totalCost = roundCurrency(count * price)

        // Only assign chicks to this batch up to what it still needs
        const allocatedToBatch = Math.min(count, shortfallRemaining)
        shortfallRemaining -= allocatedToBatch

        if (allocatedToBatch > 0) {
          const { error: lineErr } = await supabase.from('batch_chick_purchases').insert({
            organization_id: organization?.id,
            batch_id:        inserted.id,
            quantity:        allocatedToBatch,
            price_per_chick: price,
            total_cost:      roundCurrency(allocatedToBatch * price),
            source:          'purchase',
          })
          if (lineErr) { setError(lineErr.message); setSaving(false); return }
        }

        const { data: proc } = await supabase.from('procurement').insert({
          organization_id: organization?.id,
          type:            'chicks',
          item_name:       'Chicks',
          quantity:        count,
          unit:            'birds',
          cost:            totalCost,
          cost_per_unit:   price,
          supplier_id:     p.supplierId || null,
          date:            form.start_date,
          notes:           'Purchased on batch creation',
          created_by_id:   user?.id,
          created_by_name: userName,
        }).select('id').single()

        await ledgerIn({
          itemName: 'Chicks', itemType: 'chicks',
          quantity: count, unit: 'birds',
          referenceType: 'procurement', referenceId: proc?.id,
          date: form.start_date, organizationId: organization?.id,
        })
        await addToStock('Chicks', count, 'birds', price, organization?.id)

        if (p.payNow && p.accountId && proc?.id) {
          await supabase.from('transactions').insert({
            organization_id:  organization?.id,
            account_id:       p.accountId,
            transaction_type: 'out',
            category:         'procurement',
            description:      `Chick purchase — ${count.toLocaleString('en-IN')} birds`,
            amount:           totalCost,
            transaction_date: form.start_date,
            reference_type:   'procurement',
            reference_id:     proc.id,
          })
        }
      }
    }

    // Step 4: Deduct full batch count from stock ledger
    await ledgerOut({
      itemName: 'Chicks', itemType: 'chicks',
      quantity: chickCount, unit: 'birds',
      referenceType: 'batch', referenceId: inserted.id,
      date: form.start_date, organizationId: organization?.id,
    })

    onSaved()
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('batches.startBatch')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Farm dropdown — only when not fixed to a specific farm */}
          {!fixedFarm && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Farm *</label>
              <select required value={form.farm_id} onChange={set('farm_id')} className={inputCls + ' bg-white'}>
                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}

          {/* Chick count */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('batches.chickCount')} *</label>
            <input required type="number" min="1"
              value={form.chick_count} onChange={set('chick_count')}
              placeholder="e.g. 3000" className={inputCls}
            />
            {chickBalance !== null && (
              chickBalance === 0 ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <span className="text-amber-500 text-sm">⚠</span>
                  <p className="text-xs font-medium text-amber-700">No chicks in stock — add purchase details below</p>
                </div>
              ) : chickCount > chickBalance ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <span className="text-amber-500 text-sm">⚠</span>
                  <p className="text-xs font-medium text-amber-700">
                    {chickBalance.toLocaleString('en-IN')} in stock — {shortfall.toLocaleString('en-IN')} more needed
                  </p>
                </div>
              ) : (
                <p className="text-xs mt-1.5 font-medium text-green-600">
                  ✓ {chickBalance.toLocaleString('en-IN')} chicks available in stock
                </p>
              )
            )}
            {remaining !== null && (
              <p className={`text-xs mt-1 font-medium ${remaining === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {remaining === 0
                  ? '⚠ Farm is at full capacity'
                  : `Farm capacity remaining: ${remaining.toLocaleString('en-IN')} birds`}
              </p>
            )}
          </div>

          {/* Start date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('batches.startDate')} *</label>
            <input required type="date" value={form.start_date} onChange={set('start_date')} className={inputCls} />
          </div>

          {/* Purchase cards */}
          {needsPurchase && (
            <div className="space-y-3">
              {purchases.map((p, idx) => {
                const pCount = Number(p.count) || 0
                const pCost  = pCount * (parseFloat(p.pricePerChick) || 0)
                return (
                  <div key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                        {purchases.length > 1 ? `Purchase #${idx + 1}` : 'Chick Purchase Details'}
                      </p>
                      {purchases.length > 1 && (
                        <button type="button" onClick={() => removePurchase(p.id)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium">Remove</button>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Chicks to Purchase *</label>
                      <input required type="number" min="1"
                        value={p.count}
                        onChange={e => updatePurchase(p.id, { count: e.target.value })}
                        placeholder={`e.g. ${shortfall}`}
                        className={inputCls}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Price per Chick (₹) *</label>
                        <input required type="number" min="0.01" step="0.01"
                          value={p.pricePerChick}
                          onChange={e => updatePurchase(p.id, { pricePerChick: e.target.value })}
                          placeholder="e.g. 28.50" className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('procurement.totalCost')}</label>
                        <div className="flex items-center h-[38px] rounded-lg bg-white border border-gray-200 px-3 text-sm font-semibold text-amber-700">
                          {pCost > 0 ? formatCurrency(pCost) : '—'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('procurement.supplier')} <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <select value={p.supplierId} onChange={e => updatePurchase(p.id, { supplierId: e.target.value })}
                        className={inputCls + ' bg-white'}>
                        <option value="">No supplier / unknown</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>

                    {accounts.length > 0 && (
                      <div className="rounded-lg border border-amber-100 bg-white px-3 py-3 space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={p.payNow}
                            onChange={e => updatePurchase(p.id, { payNow: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-700">Pay now</span>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {p.payNow ? 'Cash deducted from account' : 'Added to Supplier Dues'}
                            </p>
                          </div>
                        </label>
                        {p.payNow && (
                          <select value={p.accountId} onChange={e => updatePurchase(p.id, { accountId: e.target.value })}
                            className={inputCls + ' bg-white'}>
                            <option value="">— select account —</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {stillShort > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-amber-800">
                    ⚠ Still {stillShort.toLocaleString('en-IN')} chicks short
                  </p>
                  <button type="button" onClick={addPurchase}
                    className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition">
                    + Add Purchase
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving || chickBalance === null}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving || chickBalance === null ? t('common.loading') : t('batches.startBatch')}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
