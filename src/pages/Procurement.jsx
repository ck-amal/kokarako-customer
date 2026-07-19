import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { addToStock } from '../lib/stockHelpers'
import { ledgerIn } from '../lib/stockLedger'
import { formatCurrency, roundCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'
import AuditInfo from '../components/AuditInfo'
import AttachmentUploader from '../components/AttachmentUploader'
import { uploadAttachments, attachmentsByEntity } from '../lib/attachments'
import AttachmentViewer from '../components/AttachmentViewer'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_STYLES = {
  chicks:    'bg-yellow-100 text-yellow-700',
  feed:      'bg-green-100  text-green-700',
  medicine:  'bg-blue-100   text-blue-700',
  equipment: 'bg-purple-100 text-purple-700',
  other:     'bg-gray-100   text-gray-600',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthRange() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TYPE_STYLES[type] ?? TYPE_STYLES.other}`}>
      {type}
    </span>
  )
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ records }) {
  const { t, i18n } = useTranslation()
  const { start, end } = currentMonthRange()

  const thisMonth = records.filter(r => r.date >= start && r.date <= end)
  const monthTotal = thisMonth.reduce((sum, r) => sum + Number(r.cost), 0)

  const byType = {}
  for (const r of thisMonth) {
    byType[r.type] = (byType[r.type] || 0) + Number(r.cost)
  }

  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]

  const monthName = new Date().toLocaleString(i18n.language === 'ml' ? 'ml-IN' : 'en-IN', { month: 'long' })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('procurement.totalThisMonth')}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(monthTotal)}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('common.thisMonth')}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{thisMonth.length}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{monthName}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1 capitalize">
          {topType ? topType[0] : '—'}
        </p>
        {topType && (
          <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(topType[1])}</p>
        )}
      </div>
    </div>
  )
}

// ─── New procurement modal ────────────────────────────────────────────────────

function ProcurementModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { organization, user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const [itemTypes, setItemTypes]   = useState([])
  const [suppliers, setSuppliers]   = useState([])
  const [accounts, setAccounts]     = useState([])
  const [supplierOutstanding, setSupplierOutstanding] = useState(null)
  const newLine = () => ({ item_type_id: '', item_id: '', quantity: '', cost_per_unit: '', cost: '', items: [], extra_enabled: false, extra_per_unit: '0' })
  const [lines, setLines] = useState([newLine()])
  const [header, setHeader] = useState({
    supplier_id:    '',
    date:           new Date().toISOString().slice(0, 10),
    invoice_number: '',
    notes:          '',
    pay_now:        false,
    account_id:     '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState([])

  // Fetch active catalog items for a given type (includes kg/ml per unit)
  async function fetchItems(typeId) {
    if (!typeId) return []
    const { data } = await supabase
      .from('items')
      .select('id, name, unit, item_type_id, kg_per_unit, ml_per_unit')
      .eq('item_type_id', typeId)
      .eq('is_active', true)
      .order('name')
    return data || []
  }

  // On mount: load item types, suppliers, accounts; seed the first line
  useEffect(() => {
    async function loadInitial() {
      const [{ data: types }, { data: sups }, { data: accs }] = await Promise.all([
        supabase.from('item_types').select('id, name, has_extra_expense, extra_expense_type, extra_expense_value').order('name'),
        supabase.from('suppliers').select('id, name, business_name').eq('is_active', true).order('name'),
        supabase.from('accounts').select('id, name, type').eq('is_active', true).order('name'),
      ])
      setItemTypes(types || [])
      setSuppliers(sups || [])
      const accList = accs || []
      setAccounts(accList)
      const cash = accList.find(a => a.type === 'cash')
      if (cash) setHeader(h => ({ ...h, account_id: cash.id }))
      if (types?.length) {
        const initialItems = await fetchItems(types[0].id)
        setLines([{ item_type_id: types[0].id, item_id: initialItems[0]?.id || '', quantity: '', cost_per_unit: '', cost: '', items: initialItems }])
      }
    }
    loadInitial()
  }, [])

  function updateLine(i, patch) {
    setLines(prev => prev.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)))
  }

  // When a line's item type changes: reload its catalog items and seed ancillary expense
  async function handleLineTypeChange(i, typeId) {
    updateLine(i, { item_type_id: typeId, item_id: '', cost_per_unit: '', cost: '', items: [], extra_enabled: false, extra_per_unit: '0' })
    const items = await fetchItems(typeId)
    const typeRule = itemTypes.find(t => t.id === typeId)
    const hasRule = typeRule?.has_extra_expense && typeRule?.extra_expense_type && typeRule?.extra_expense_value != null
    const autoPerUnit = hasRule && typeRule.extra_expense_type === 'fixed_per_unit'
      ? String(typeRule.extra_expense_value)
      : '0'
    updateLine(i, { items, item_id: items[0]?.id || '', extra_enabled: hasRule, extra_per_unit: autoPerUnit })
  }

  // Per-line field setter with auto-calc for quantity / cost_per_unit
  function setLineField(i, field, value) {
    setLines(prev => prev.map((ln, idx) => {
      if (idx !== i) return ln
      const next = { ...ln, [field]: value }
      if (field === 'quantity' || field === 'cost_per_unit') {
        const qty = parseFloat(field === 'quantity' ? value : ln.quantity) || 0
        const cpu = parseFloat(field === 'cost_per_unit' ? value : ln.cost_per_unit) || 0
        next.cost = qty && cpu ? String(roundCurrency(qty * cpu)) : next.cost
      }
      // Auto-recompute percentage ancillary when cost_per_unit changes
      if (field === 'cost_per_unit' && next.extra_enabled) {
        const typeRule = itemTypes.find(t => t.id === ln.item_type_id)
        if (typeRule?.extra_expense_type === 'percentage' && typeRule?.extra_expense_value != null) {
          const cpu = parseFloat(value) || 0
          next.extra_per_unit = String(roundCurrency(cpu * typeRule.extra_expense_value / 100))
        }
      }
      return next
    }))
  }

  async function addLine() {
    const typeId = itemTypes[0]?.id || ''
    const items = typeId ? await fetchItems(typeId) : []
    setLines(prev => [...prev, { item_type_id: typeId, item_id: items[0]?.id || '', quantity: '', cost_per_unit: '', cost: '', items }])
  }

  function removeLine(i) {
    setLines(prev => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  // When supplier changes: fetch their outstanding balance
  async function handleSupplierChange(supplierId) {
    setHeader(h => ({ ...h, supplier_id: supplierId }))
    if (!supplierId) { setSupplierOutstanding(null); return }
    const [{ data: procs }, { data: pays }] = await Promise.all([
      supabase.from('procurement').select('cost').eq('supplier_id', supplierId),
      supabase.from('supplier_payments').select('amount').eq('supplier_id', supplierId),
    ])
    const totalCost = (procs || []).reduce((s, r) => s + Number(r.cost), 0)
    const totalPaid = (pays  || []).reduce((s, r) => s + Number(r.amount), 0)
    setSupplierOutstanding(Math.max(0, totalCost - totalPaid))
  }

  const grandTotal = lines.reduce((s, ln) => s + (parseFloat(ln.cost) || 0), 0)

  // ── kg/ml per unit inline editing ─────────────────────────────────────────
  // kgMlState[i] = { editing: bool, draft: string, saving: bool, error: string }
  const [kgMlState, setKgMlState] = useState({})

  function kgMlOf(i) {
    return kgMlState[i] || { editing: false, draft: '', saving: false, error: '' }
  }
  function setKgMl(i, patch) {
    setKgMlState(prev => ({ ...prev, [i]: { ...kgMlOf(i), ...patch } }))
  }

  function openKgMlEdit(i, currentVal) {
    setKgMl(i, { editing: true, draft: currentVal != null ? String(currentVal) : '', error: '' })
  }

  async function saveKgMl(i) {
    const ln = lines[i]
    const item = ln.items.find(it => it.id === ln.item_id)
    if (!item) return
    const state = kgMlOf(i)
    if (!state.draft || isNaN(parseFloat(state.draft))) {
      setKgMl(i, { error: 'Enter a valid number' }); return
    }
    setKgMl(i, { saving: true, error: '' })
    const val = parseFloat(state.draft)
    const field = item.unit === 'Bag' ? 'kg_per_unit' : 'ml_per_unit'
    await supabase.from('items').update({ [field]: val }).eq('id', item.id)
    // Refresh items list for this line so the display updates
    const refreshed = await fetchItems(ln.item_type_id)
    updateLine(i, { items: refreshed })
    setKgMl(i, { editing: false, saving: false, draft: '' })
  }

  // ── Add new item to catalog inline ────────────────────────────────────────
  const [addItemLine, setAddItemLine] = useState(null) // which line index
  const [addItemData, setAddItemData] = useState({ name: '', unit: '', kg_per_unit: '', ml_per_unit: '' })
  const [addItemError, setAddItemError] = useState('')
  const [addItemSaving, setAddItemSaving] = useState(false)

  const UNIT_OPTIONS = ['KG', 'ml', 'Bag', 'Bottle', 'Number']

  async function handleAddNewItem(e) {
    e.preventDefault()
    setAddItemError('')
    const i = addItemLine
    const ln = lines[i]
    if (!addItemData.name.trim()) { setAddItemError('Item name is required'); return }
    if (!addItemData.unit) { setAddItemError('Select a unit'); return }
    if (addItemData.unit === 'Bag' && !addItemData.kg_per_unit) { setAddItemError('Enter KG per bag'); return }
    if (addItemData.unit === 'Bottle' && !addItemData.ml_per_unit) { setAddItemError('Enter ml per bottle'); return }
    setAddItemSaving(true)
    const { data: newItem, error } = await supabase.from('items').insert({
      name: addItemData.name.trim(),
      unit: addItemData.unit,
      is_active: true,
      item_type_id: ln.item_type_id,
      organization_id: organization?.id,
      kg_per_unit: addItemData.unit === 'Bag' && addItemData.kg_per_unit ? parseFloat(addItemData.kg_per_unit) : null,
      ml_per_unit: addItemData.unit === 'Bottle' && addItemData.ml_per_unit ? parseFloat(addItemData.ml_per_unit) : null,
    }).select('id, name, unit, item_type_id, kg_per_unit, ml_per_unit').single()
    if (error) { setAddItemError(error.message); setAddItemSaving(false); return }
    const refreshed = await fetchItems(ln.item_type_id)
    updateLine(i, { items: refreshed, item_id: newItem.id })
    setAddItemSaving(false)
    setAddItemLine(null)
    setAddItemData({ name: '', unit: '', kg_per_unit: '', ml_per_unit: '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!header.supplier_id) { setError(t('procurement.selectSupplier')); return }

    // Validate + prepare every line before writing anything
    const prepared = []
    for (const ln of lines) {
      if (!ln.item_type_id) { setError(t('procurement.selectItemType')); return }
      if (!ln.item_id) { setError(t('procurement.selectItem')); return }
      const item = ln.items.find(it => it.id === ln.item_id)
      if (!item) { setError(t('errors.required')); return }
      const qty = Number(ln.quantity)
      if (!qty || qty <= 0) { setError(`${t('procurement.quantity')} *`); return }
      const cost = Number(ln.cost)
      if (!cost || cost < 0) { setError(`${t('procurement.totalCost')} *`); return }
      const cpu = parseFloat(ln.cost_per_unit) || (qty > 0 ? roundCurrency(cost / qty) : 0)
      const typeName = itemTypes.find(it => it.id === ln.item_type_id)?.name?.toLowerCase() ?? 'other'
      const extraEnabled = !!ln.extra_enabled
      const extraPerUnit = extraEnabled ? (parseFloat(ln.extra_per_unit) || 0) : 0
      prepared.push({ item, item_id: ln.item_id, qty, cost, cpu, typeName, extraEnabled, extraPerUnit })
    }

    setSaving(true)
    let firstProcurementId = null
    // One procurement row per line (keeping stock + ledger in sync each time)
    for (const p of prepared) {
      const { data: inserted, error: insertErr } = await supabase.from('procurement').insert({
        organization_id: organization?.id,
        type:          p.typeName,
        item_name:     p.item.name,
        item_id:       p.item_id,
        quantity:      p.qty,
        unit:          p.item.unit,
        cost:          p.cost,
        cost_per_unit: p.cpu,
        supplier_id:   header.supplier_id || null,
        date:          header.date,
        invoice_number: header.invoice_number.trim() || null,
        notes:         header.notes.trim() || null,
        has_extra_expense:     p.extraEnabled,
        extra_expense_per_unit: p.extraPerUnit,
        created_by_id:   user?.id,
        created_by_name: userName,
      }).select('id').single()

      if (insertErr) { setError(insertErr.message); setSaving(false); return }
      if (!firstProcurementId) firstProcurementId = inserted.id

      // Auto-record payment transaction if "Pay now" is checked
      if (header.pay_now && header.account_id) {
        await supabase.from('transactions').insert({
          organization_id:  organization?.id,
          account_id:       header.account_id,
          transaction_type: 'out',
          category:         'procurement',
          description:      `Purchase — ${p.item.name}`,
          amount:           p.cost,
          transaction_date: header.date,
          reference_type:   'procurement',
          reference_id:     inserted.id,
          created_by_id:   user?.id,
          created_by_name: userName,
        })
      }

      // Stock ledger + stock cache
      await ledgerIn({
        itemName:       p.item.name,
        itemType:       p.typeName,
        quantity:       p.qty,
        unit:           p.item.unit,
        referenceType:  'procurement',
        referenceId:    inserted.id,
        date:           header.date,
        organizationId: organization?.id,
      })
      await addToStock(p.item.name, p.qty, p.item.unit, p.cpu, organization?.id)
    }

    // Attach uploaded bills/files to the purchase (its first line)
    if (pendingFiles.length && firstProcurementId) {
      try {
        await uploadAttachments({
          organizationId: organization?.id,
          entityType:     'procurement',
          entityId:       firstProcurementId,
          files:          pendingFiles,
          user,
        })
      } catch (err) {
        console.error('Attachment upload failed', err)
        alert('Purchase saved, but the file upload failed: ' + err.message)
      }
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('procurement.addPurchase')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Supplier + Date (shared across the purchase) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('procurement.supplier')} *</label>
              <select
                value={header.supplier_id}
                onChange={e => handleSupplierChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">— {t('procurement.selectSupplier')} —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.business_name ? ` — ${s.business_name}` : ''}
                  </option>
                ))}
              </select>
              {supplierOutstanding !== null && header.supplier_id && (
                <p className={`text-xs mt-1 font-medium ${supplierOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  Current outstanding: {formatCurrency(supplierOutstanding)}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input
                required type="date"
                value={header.date} onChange={e => setHeader(h => ({ ...h, date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Invoice number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
            <input
              type="text"
              value={header.invoice_number}
              onChange={e => setHeader(h => ({ ...h, invoice_number: e.target.value }))}
              placeholder="e.g. INV-2024-001"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Item lines */}
          <div className="space-y-3">
            {lines.map((ln, i) => {
              const item = ln.items.find(it => it.id === ln.item_id)
              return (
                <div key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('procurement.item')} {i + 1}</span>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)}
                        className="text-xs font-medium text-gray-400 hover:text-red-600">
                        {t('common.remove', { defaultValue: 'Remove' })}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('procurement.itemType')} *</label>
                      <select
                        value={ln.item_type_id}
                        onChange={e => handleLineTypeChange(i, e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="">{t('procurement.selectItemType')}…</option>
                        {itemTypes.map(tp => (
                          <option key={tp.id} value={tp.id}>{tp.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('procurement.item')} *</label>
                      <select
                        value={ln.item_id}
                        onChange={e => updateLine(i, { item_id: e.target.value })}
                        disabled={!ln.item_type_id}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        <option value="">{t('procurement.selectItem')}…</option>
                        {ln.items.map(it => (
                          <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Add new item to catalog inline */}
                  {ln.item_type_id && addItemLine !== i && (
                    <div className="mb-3">
                      <button type="button" onClick={() => { setAddItemLine(i); setAddItemData({ name: '', unit: '', kg_per_unit: '', ml_per_unit: '' }); setAddItemError('') }}
                        className="text-xs text-amber-600 hover:text-amber-700 font-medium underline underline-offset-2">
                        + Add new item to catalog
                      </button>
                    </div>
                  )}

                  {/* Inline add-new-item form */}
                  {addItemLine === i && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-amber-700">New Item (saved to catalog)</p>
                        <button type="button" onClick={() => setAddItemLine(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                      </div>
                      <form onSubmit={handleAddNewItem} className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            autoFocus required type="text"
                            placeholder="Item name *"
                            value={addItemData.name}
                            onChange={e => setAddItemData(p => ({ ...p, name: e.target.value }))}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                          <select
                            required value={addItemData.unit}
                            onChange={e => setAddItemData(p => ({ ...p, unit: e.target.value, kg_per_unit: '', ml_per_unit: '' }))}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                          >
                            <option value="">Unit *</option>
                            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        {addItemData.unit === 'Bag' && (
                          <input required type="number" step="0.01" min="0.01"
                            placeholder="KG per bag *  (e.g. 50)"
                            value={addItemData.kg_per_unit}
                            onChange={e => setAddItemData(p => ({ ...p, kg_per_unit: e.target.value }))}
                            className="w-full rounded-lg border border-emerald-400 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        )}
                        {addItemData.unit === 'Bottle' && (
                          <input required type="number" step="1" min="1"
                            placeholder="ml per bottle *  (e.g. 500)"
                            value={addItemData.ml_per_unit}
                            onChange={e => setAddItemData(p => ({ ...p, ml_per_unit: e.target.value }))}
                            className="w-full rounded-lg border border-blue-400 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        )}
                        {addItemError && <p className="text-xs text-red-600">{addItemError}</p>}
                        <div className="flex gap-2">
                          <button type="submit" disabled={addItemSaving}
                            className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-1.5 text-xs font-semibold text-white transition">
                            {addItemSaving ? 'Saving…' : 'Add to catalog & select'}
                          </button>
                          <button type="button" onClick={() => setAddItemLine(null)}
                            className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* kg/ml per unit display & edit — shown when Bag or Bottle is selected */}
                  {item && (item.unit === 'Bag' || item.unit === 'Bottle') && (
                    <div className={`mb-3 rounded-xl px-3 py-2 flex items-center justify-between gap-3 ${item.unit === 'Bag' ? 'bg-emerald-50 border border-emerald-200' : 'bg-blue-50 border border-blue-200'}`}>
                      {kgMlOf(i).editing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            autoFocus type="number" step="0.01" min="0.01"
                            value={kgMlOf(i).draft}
                            onChange={e => setKgMl(i, { draft: e.target.value })}
                            placeholder={item.unit === 'Bag' ? 'KG per bag' : 'ml per bottle'}
                            className={`w-32 rounded-lg border px-2 py-1 text-sm focus:outline-none focus:ring-2 ${item.unit === 'Bag' ? 'border-emerald-400 focus:ring-emerald-400' : 'border-blue-400 focus:ring-blue-400'}`}
                          />
                          <span className="text-xs text-gray-500">{item.unit === 'Bag' ? 'kg/bag' : 'ml/bottle'}</span>
                          {kgMlOf(i).error && <span className="text-xs text-red-600">{kgMlOf(i).error}</span>}
                          <button type="button" onClick={() => saveKgMl(i)} disabled={kgMlOf(i).saving}
                            className="rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 px-3 py-1 text-xs font-semibold text-white transition">
                            {kgMlOf(i).saving ? '…' : '✓ Save to catalog'}
                          </button>
                          <button type="button" onClick={() => setKgMl(i, { editing: false })}
                            className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            {item.unit === 'Bag' && item.kg_per_unit != null ? (
                              <span className={`text-xs font-semibold text-emerald-700`}>📦 {item.kg_per_unit} kg per bag</span>
                            ) : item.unit === 'Bottle' && item.ml_per_unit != null ? (
                              <span className="text-xs font-semibold text-blue-700">🧴 {item.ml_per_unit} ml per bottle</span>
                            ) : (
                              <span className={`text-xs font-medium ${item.unit === 'Bag' ? 'text-amber-600' : 'text-blue-600'}`}>
                                ⚠ {item.unit === 'Bag' ? 'KG per bag not set' : 'ml per bottle not set'} — needed for FCR
                              </span>
                            )}
                          </div>
                          <button type="button" onClick={() => openKgMlEdit(i, item.unit === 'Bag' ? item.kg_per_unit : item.ml_per_unit)}
                            className={`text-xs font-medium underline underline-offset-2 ${item.unit === 'Bag' ? 'text-emerald-600 hover:text-emerald-800' : 'text-blue-600 hover:text-blue-800'}`}>
                            {(item.unit === 'Bag' ? item.kg_per_unit : item.ml_per_unit) != null ? 'Edit' : 'Set it'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {t('procurement.quantity')}{item ? ` (${item.unit})` : ''} *
                      </label>
                      <input
                        type="number" min="0.01" step="0.01"
                        value={ln.quantity} onChange={e => setLineField(i, 'quantity', e.target.value)}
                        placeholder="e.g. 100"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('procurement.costPerUnit')} (₹)</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={ln.cost_per_unit} onChange={e => setLineField(i, 'cost_per_unit', e.target.value)}
                        placeholder="e.g. 28.50"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('procurement.totalCost')} (₹) *</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={ln.cost} onChange={e => setLineField(i, 'cost', e.target.value)}
                        placeholder="Auto"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>

                  {/* Ancillary expense — shown only if item type has a rule configured */}
                  {(() => {
                    const typeRule = itemTypes.find(t => t.id === ln.item_type_id)
                    if (!typeRule?.has_extra_expense) return null
                    const qty = parseFloat(ln.quantity) || 0
                    const epu = parseFloat(ln.extra_per_unit) || 0
                    return (
                      <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={ln.extra_enabled}
                            onChange={e => updateLine(i, { extra_enabled: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                          />
                          <span className="text-xs font-semibold text-orange-700">Add ancillary expense? (transport, loading/unloading)</span>
                        </label>
                        {ln.extra_enabled && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number" min="0" step="0.01"
                                value={ln.extra_per_unit}
                                onChange={e => updateLine(i, { extra_per_unit: e.target.value })}
                                placeholder="0"
                                className="w-24 rounded-lg border border-orange-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                              />
                              <span className="text-xs text-gray-500">₹ per {item?.unit || 'unit'}</span>
                            </div>
                            {qty > 0 && epu > 0 && (
                              <span className="text-xs font-semibold text-orange-700">
                                Total ancillary: {formatCurrency(qty * epu)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}

            <button type="button" onClick={addLine}
              className="w-full rounded-lg border border-dashed border-amber-300 px-4 py-2 text-sm font-semibold text-amber-600 hover:bg-amber-50 transition">
              + {t('procurement.addItem', { defaultValue: 'Add another item' })}
            </button>
          </div>

          {/* Grand total */}
          {grandTotal > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
              <span className="text-xs text-amber-700 font-medium uppercase tracking-wide">{t('common.total')}</span>
              <span className="text-base font-bold text-amber-700">{formatCurrency(grandTotal)}</span>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')} <span className="text-gray-400 font-normal">({t('common.optional')})</span></label>
            <textarea
              rows={2}
              value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
              placeholder="Any additional details…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Bill / Invoice / files */}
          <AttachmentUploader value={pendingFiles} onChange={setPendingFiles} label="Bill / Invoice (optional)" />

          {/* Pay now */}
          {accounts.length > 0 && (
            <div className="rounded-lg border border-gray-200 px-4 py-3 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={header.pay_now}
                  onChange={e => setHeader(h => ({ ...h, pay_now: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">{t('procurement.payNow')}</span>
                  {!header.pay_now && (
                    <p className="text-xs text-gray-400 mt-0.5">{t('procurement.payLater')}</p>
                  )}
                </div>
              </label>
              {header.pay_now && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pay from Account</label>
                  <select
                    value={header.account_id}
                    onChange={e => setHeader(h => ({ ...h, account_id: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— select account —</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? `${t('common.save')}…` : t('procurement.addPurchase')}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ─── Edit Procurement Modal ───────────────────────────────────────────────────

function EditProcurementModal({ proc, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t, i18n } = useTranslation()
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState({
    date:           proc.date,
    supplier_id:    proc.supplier_id || '',
    invoice_number: proc.invoice_number || '',
    notes:          proc.notes || '',
    quantity:       String(proc.quantity),
    cost_per_unit:  String(proc.cost_per_unit ?? (Number(proc.cost) / Number(proc.quantity) || 0)),
  })
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [consumed, setConsumed] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('suppliers').select('id, name').eq('organization_id', organization?.id).order('name'),
      supabase.from('distributions').select('quantity, returned_quantity').eq('procurement_id', proc.id),
      supabase.from('batch_chick_purchases').select('quantity').eq('procurement_id', proc.id),
    ]).then(([{ data: suppData }, { data: distRows }, { data: batchRows }]) => {
      setSuppliers(suppData || [])
      const distConsumed  = (distRows  || []).reduce((s, r) => s + Math.max(0, Number(r.quantity) - Number(r.returned_quantity || 0)), 0)
      const batchConsumed = (batchRows || []).reduce((s, r) => s + Number(r.quantity), 0)
      setConsumed(distConsumed + batchConsumed)
    })
  }, [organization?.id, proc.id])

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    const newQty  = parseFloat(form.quantity)
    const newCpu  = parseFloat(form.cost_per_unit)
    if (!newQty || newQty <= 0)  { setError('Quantity must be > 0'); return }
    if (newCpu < 0)              { setError('Cost per unit cannot be negative'); return }
    if (consumed !== null && newQty < consumed) {
      setError(`Cannot reduce quantity below already distributed amount (${consumed.toLocaleString('en-IN')} ${proc.unit} used so far)`)
      return
    }

    setSaving(true)
    setError('')
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const newCost  = roundCurrency(newQty * newCpu)
    const oldQty   = Number(proc.quantity)
    const qtyDiff  = newQty - oldQty

    // 1. Update the procurement row
    const { error: upErr } = await supabase.from('procurement').update({
      date:            form.date,
      supplier_id:     form.supplier_id || null,
      invoice_number:  form.invoice_number.trim() || null,
      notes:           form.notes.trim() || null,
      quantity:        newQty,
      cost:            newCost,
      cost_per_unit:   newCpu,
      updated_by_id:   user?.id,
      updated_by_name: userName,
    }).eq('id', proc.id).eq('organization_id', organization?.id)

    if (upErr) { setError(upErr.message); setSaving(false); return }

    // 2. If quantity or cost changed, sync stock and ledger
    if (qtyDiff !== 0 || newCpu !== Number(proc.cost_per_unit)) {
      // Update the stock_ledger entry quantity
      if (qtyDiff !== 0) {
        await supabase.from('stock_ledger')
          .update({ quantity: newQty })
          .eq('reference_type', 'procurement')
          .eq('reference_id', proc.id)
          .eq('organization_id', organization?.id)
      }

      // Recalculate avg_cost from ALL procurements for this item (now includes updated row)
      const { data: allProcs } = await supabase.from('procurement')
        .select('quantity, cost')
        .ilike('item_name', proc.item_name)
        .eq('organization_id', organization?.id)

      const totalQty  = (allProcs || []).reduce((s, r) => s + Number(r.quantity), 0)
      const totalCost = (allProcs || []).reduce((s, r) => s + Number(r.cost), 0)
      const newAvg    = totalQty > 0 ? roundCurrency(totalCost / totalQty) : 0

      const { data: stockRow } = await supabase.from('stock')
        .select('id, quantity')
        .ilike('item_name', proc.item_name)
        .eq('organization_id', organization?.id)
        .maybeSingle()

      if (stockRow) {
        await supabase.from('stock').update({
          quantity: Math.max(0, Number(stockRow.quantity) + qtyDiff),
          avg_cost: newAvg,
        }).eq('id', stockRow.id)
      }
    }

    // 3. If cost_per_unit changed, update farm_expenses for all distributions from this procurement
    if (newCpu !== Number(proc.cost_per_unit)) {
      const { data: dists } = await supabase.from('distributions')
        .select('id, quantity')
        .eq('procurement_id', proc.id)
        .eq('organization_id', organization?.id)

      for (const dist of (dists || [])) {
        await supabase.from('farm_expenses').update({
          cost_per_unit: newCpu,
          total_cost:    roundCurrency(Number(dist.quantity) * newCpu),
        }).eq('distribution_id', dist.id).eq('organization_id', organization?.id)
      }
    }

    onSaved()
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Edit Procurement</h2>
            <p className="text-xs text-gray-400 mt-0.5">{proc.item_name} · {proc.unit}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity *</label>
              <input required type="number" min="0.01" step="any"
                value={form.quantity} onChange={set('quantity')} className={inputCls} />
              {consumed !== null && consumed > 0 && (
                <p className={`text-xs mt-1 ${parseFloat(form.quantity) < consumed ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                  {consumed.toLocaleString('en-IN')} {proc.unit} already distributed — minimum allowed
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cost per Unit *</label>
              <input required type="number" min="0" step="any"
                value={form.cost_per_unit} onChange={set('cost_per_unit')} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('procurement.supplier')}</label>
            <select value={form.supplier_id} onChange={set('supplier_id')} className={inputCls + ' bg-white'}>
              <option value="">— No supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.date')} *</label>
              <input required type="date" value={form.date} onChange={set('date')} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice No.</label>
              <input value={form.invoice_number} onChange={set('invoice_number')} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.notes')}</label>
            <input value={form.notes} onChange={set('notes')} placeholder="Optional" className={inputCls} />
          </div>

          {form.quantity && form.cost_per_unit && Number(form.quantity) > 0 && (
            <p className="text-xs text-gray-400">
              Total cost: {formatCurrency(parseFloat(form.quantity) * parseFloat(form.cost_per_unit))}
            </p>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Procurement() {
  const { t, i18n } = useTranslation()
  const { organization, canEdit, canDelete } = useAuth()
  const { currentStep, stepDone } = useOnboarding()
  const location = useLocation()

  const [records, setRecords]       = useState([])
  const [itemTypes, setItemTypes]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(() => !!location.state?.openModal)
  const [editingProc,       setEditingProc]       = useState(null)
  const [deletingProc,      setDeletingProc]      = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingBusy,      setDeletingBusy]      = useState(false)
  const [deleteError,       setDeleteError]       = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom,   setDateFrom]   = useState(currentMonthRange().start) // 1st of this month
  const [dateTo,     setDateTo]     = useState(new Date().toISOString().slice(0, 10)) // today
  const [page,       setPage]       = useState(1)
  const [attByRow,   setAttByRow]   = useState({})
  const [viewRowId,  setViewRowId]  = useState(() => location.state?.openProcurementId || null)

  async function fetchData() {
    setLoading(true)
    const [{ data: batchData }, { data: typesData }] = await Promise.all([
      supabase.from('procurement').select('*, suppliers(name), created_by_name, created_at, updated_by_name, updated_at').eq('organization_id', organization?.id).order('date', { ascending: false }),
      supabase.from('item_types').select('id, name'),
    ])
    const rows = batchData || []
    setRecords(rows)
    setItemTypes(typesData || [])
    setAttByRow(await attachmentsByEntity('procurement', rows.map(r => r.id), organization?.id))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Reset to the first page whenever a filter changes
  useEffect(() => { setPage(1) }, [typeFilter, dateFrom, dateTo])

  const visible = records.filter(r => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    if (dateFrom && r.date < dateFrom) return false
    if (dateTo   && r.date > dateTo)   return false
    return true
  })

  const grandTotal = records.reduce((sum, r) => sum + Number(r.cost), 0)

  const PAGE_SIZE   = 15
  const totalPages  = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged       = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const viewRow     = viewRowId ? records.find(r => r.id === viewRowId) : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('procurement.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">All purchases — feed, chicks, medicine &amp; more</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              data-tour="procurement"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
            >
              <span className="text-base leading-none">+</span> {t('procurement.addPurchase')}
            </button>
          )}
        </div>
      </div>

      {/* Untracked payables alert */}
      {!loading && (() => {
        const untracked = records.filter(r => !r.supplier_id)
        if (untracked.length === 0) return null
        const total = untracked.reduce((s, r) => s + Number(r.cost), 0)
        return (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {untracked.length} {t('procurement.untrackedWarning', { count: untracked.length, amount: formatCurrency(total) })}
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                These are not tracked as liabilities anywhere. Edit them to assign a supplier, or mark as paid if already settled.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {untracked.slice(0, 5).map(r => (
                  <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-xs text-amber-800">
                    {r.item_name} · {formatCurrency(r.cost)} · {formatDate(r.date, i18n.language)}
                  </span>
                ))}
                {untracked.length > 5 && (
                  <span className="text-xs text-amber-500">+{untracked.length - 5} more</span>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Summary bar */}
      {!loading && <SummaryBar records={records} />}

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.from', { defaultValue: 'From' })}</label>
          <input
            type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.to', { defaultValue: 'To' })}</label>
          <input
            type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-xs font-medium text-amber-600 hover:text-amber-700 pb-2"
          >
            {t('common.clear', { defaultValue: 'Clear' })}
          </button>
        )}
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['all', ...itemTypes.map(t => t.name.toLowerCase())].map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border capitalize ${
              typeFilter === type
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {type === 'all' ? `${t('common.all')} (${records.length})` : type}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🛒</span>
            <p className="text-sm font-medium">{t('common.noData')}</p>
            <p className="text-xs mt-1">
              {typeFilter !== 'all' ? t('common.filter') : `${t('procurement.addPurchase')}`}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">{t('procurement.itemType')}</th>
                  <th className="px-5 py-3">{t('procurement.item')}</th>
                  <th className="px-5 py-3 text-right">{t('procurement.quantity')}</th>
                  <th className="px-5 py-3">{t('procurement.unit')}</th>
                  <th className="px-5 py-3 text-right">{t('procurement.totalCost')}</th>
                  <th className="px-5 py-3">{t('procurement.supplier')}</th>
                  <th className="px-5 py-3">Invoice No.</th>
                  <th className="px-5 py-3">{t('common.date')}</th>
                  <th className="px-5 py-3">{t('common.notes')}</th>
                  <th className="w-8 px-5 py-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  </th>
                  {(canEdit || canDelete) && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paged.map(r => (
                  <tr key={r.id} onClick={() => setViewRowId(r.id)} className="hover:bg-amber-50/40 transition cursor-pointer">
                    <td className="px-5 py-3.5">
                      <TypeBadge type={r.item_type_name?.toLowerCase() ?? r.type} />
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-800">{r.item_name}</td>
                    <td className="px-5 py-3.5 text-right text-gray-700">
                      {Number(r.quantity).toLocaleString('en-IN')}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{r.unit}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-800">
                      {formatCurrency(r.cost)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{r.suppliers?.name || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500">{r.invoice_number || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(r.date, i18n.language)}</td>
                    <td className="px-5 py-3.5 text-gray-400 max-w-[140px] truncate" title={r.notes || ''}>
                      {r.notes || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <AuditInfo createdByName={r.created_by_name} createdAt={r.created_at} updatedByName={r.updated_by_name} updatedAt={r.updated_at} />
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {canEdit && (
                            <button
                              onClick={() => setEditingProc(r)}
                              className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => { setDeletingProc(r); setDeleteConfirmText(''); setDeleteError('') }}
                              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Footer total */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {typeFilter === 'all' ? t('common.total') : `${typeFilter} ${t('common.total').toLowerCase()}`}
              </span>
              <span className="text-sm font-bold text-gray-800">
                {formatCurrency(visible.reduce((s, r) => s + Number(r.cost), 0))}
              </span>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-white">
                <span className="text-xs text-gray-500">
                  {`${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, visible.length)} of ${visible.length}`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('common.previous', { defaultValue: 'Previous' })}
                  </button>
                  <span className="text-xs text-gray-500">{`${currentPage} / ${totalPages}`}</span>
                  <button
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('common.next', { defaultValue: 'Next' })}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {viewRow && (
        <AttachmentViewer
          attachments={attByRow[viewRowId] || []}
          title={viewRow.item_name}
          header={
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="text-gray-400 text-xs block mb-0.5">{t('procurement.itemType')}</span>
                <TypeBadge type={viewRow.item_type_name?.toLowerCase() ?? viewRow.type} />
              </div>
              <div>
                <span className="text-gray-400 text-xs block mb-0.5">{t('procurement.quantity')}</span>
                {Number(viewRow.quantity).toLocaleString('en-IN')} {viewRow.unit}
              </div>
              <div>
                <span className="text-gray-400 text-xs block mb-0.5">{t('procurement.totalCost')}</span>
                <span className="font-semibold text-gray-800">{formatCurrency(viewRow.cost)}</span>
              </div>
              <div>
                <span className="text-gray-400 text-xs block mb-0.5">{t('procurement.supplier')}</span>
                {viewRow.suppliers?.name || '—'}
              </div>
              <div>
                <span className="text-gray-400 text-xs block mb-0.5">{t('common.date')}</span>
                {formatDate(viewRow.date, i18n.language)}
              </div>
              {viewRow.cost_per_unit != null && (
                <div>
                  <span className="text-gray-400 text-xs block mb-0.5">{t('procurement.costPerUnit')}</span>
                  {formatCurrency(viewRow.cost_per_unit)}
                </div>
              )}
              {viewRow.invoice_number && (
                <div>
                  <span className="text-gray-400 text-xs block mb-0.5">Invoice No.</span>
                  {viewRow.invoice_number}
                </div>
              )}
              {viewRow.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-gray-400 text-xs block mb-0.5">{t('common.notes')}</span>
                  {viewRow.notes}
                </div>
              )}
            </div>
          }
          canDelete={canEdit}
          onClose={() => setViewRowId(null)}
          onDeleted={(a) => setAttByRow(prev => ({ ...prev, [viewRowId]: (prev[viewRowId] || []).filter(x => x.id !== a.id) }))}
        />
      )}

      {modalOpen && (
        <ProcurementModal
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchData(); if (currentStep?.id === 'procurement') stepDone('procurement') }}
        />
      )}

      {editingProc && (
        <EditProcurementModal
          proc={editingProc}
          onClose={() => setEditingProc(null)}
          onSaved={() => { setEditingProc(null); fetchData() }}
        />
      )}

      {deletingProc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm">!</div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">Delete Procurement?</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {deletingProc.item_name} · {Number(deletingProc.quantity).toLocaleString('en-IN')} {deletingProc.unit} · {formatCurrency(deletingProc.cost)}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4 space-y-1">
              <p className="font-semibold">This will permanently:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5 mt-1">
                <li>Remove {Number(deletingProc.quantity).toLocaleString('en-IN')} {deletingProc.unit} from stock</li>
                <li>Delete the stock ledger IN entry</li>
                <li>Delete any linked payment transaction</li>
                <li>Unlink any distributions that used this procurement lot</li>
              </ul>
              <p className="text-xs font-medium mt-2">This action cannot be undone.</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                autoFocus
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setDeletingProc(null); setDeleteConfirmText(''); setDeleteError('') }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                {t('common.cancel')}
              </button>
              <button
                disabled={deleteConfirmText !== 'DELETE' || deletingBusy}
                onClick={async () => {
                  setDeletingBusy(true)
                  setDeleteError('')
                  const { error } = await supabase.rpc('delete_procurement', {
                    p_proc_id: deletingProc.id,
                    p_org_id:  organization?.id,
                  })
                  setDeletingBusy(false)
                  if (error) {
                    setDeleteError(error.message)
                  } else {
                    setDeletingProc(null)
                    setDeleteConfirmText('')
                    fetchData()
                  }
                }}
                className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition"
              >
                {deletingBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
