import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import AuditInfo from '../components/AuditInfo'

function batchLabel(batch, i18nLanguage) {
  if (!batch) return '—'
  return `${batch.farms?.name ?? 'Farm'} — ${formatDate(batch.start_date, i18nLanguage)} (${batch.chick_count?.toLocaleString()} chicks)`
}

// ─── Record Sale Modal ────────────────────────────────────────────────────────

function SaleModal({ batches, vendors, onClose, onSaved }) {
  const { t, i18n } = useTranslation()
  const { organization, user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const [form, setForm] = useState({
    batch_id:       batches[0]?.id ?? '',
    vendor_id:      vendors[0]?.id ?? '',
    chicken_count:  '',
    kg_sold:        '',
    price_per_kg:   '',
    date:           new Date().toISOString().slice(0, 10),
    notes:          '',
  })
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [alreadySold,  setAlreadySold]  = useState(0)
  const [loadingBatch, setLoadingBatch] = useState(false)

  // Fetch already-sold count for selected batch
  useEffect(() => {
    if (!form.batch_id) return
    setLoadingBatch(true)
    supabase
      .from('sales')
      .select('chicken_count')
      .eq('batch_id', form.batch_id)
      .then(({ data }) => {
        setAlreadySold((data || []).reduce((s, r) => s + Number(r.chicken_count || 0), 0))
        setLoadingBatch(false)
      })
  }, [form.batch_id])

  const selectedBatch  = batches.find(b => b.id === form.batch_id)
  const batchLive      = selectedBatch
    ? Math.max(0, Number(selectedBatch.chick_count || 0) - Number(selectedBatch.mortality_count || 0))
    : 0
  const available      = Math.max(0, batchLive - alreadySold)
  const chickensEntered = parseInt(form.chicken_count) || 0

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  const total =
    form.kg_sold && form.price_per_kg
      ? (parseFloat(form.kg_sold) * parseFloat(form.price_per_kg)).toFixed(2)
      : null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const count = parseInt(form.chicken_count)
    if (!count || count <= 0) { setError('Enter number of chickens'); return }
    if (count > available) {
      setError(`Only ${available.toLocaleString('en-IN')} birds available in this batch (${batchLive.toLocaleString('en-IN')} live − ${alreadySold.toLocaleString('en-IN')} already sold)`)
      return
    }
    setSaving(true)
    const { error } = await supabase.from('sales').insert({
      organization_id: organization?.id,
      batch_id:      form.batch_id,
      vendor_id:     form.vendor_id,
      chicken_count: count,
      kg_sold:       parseFloat(form.kg_sold),
      price_per_kg:  parseFloat(form.price_per_kg),
      date:          form.date,
      notes:         form.notes.trim() || null,
      created_by_id:   user?.id,
      created_by_name: userName,
    })
    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('sales.recordSale')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {batches.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No active batches. Start a batch first before recording a sale.
          </p>
        ) : vendors.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No vendors found. Add a vendor first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.batch')} *</label>
              <select required value={form.batch_id} onChange={set('batch_id')} className={inputCls}>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{batchLabel(b, i18n.language)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.vendor')} *</label>
              <select required value={form.vendor_id} onChange={set('vendor_id')} className={inputCls}>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. of Chickens *</label>
                <input
                  required type="number" min="1" step="1"
                  value={form.chicken_count} onChange={set('chicken_count')}
                  placeholder="e.g. 500"
                  className={inputCls}
                />
                {selectedBatch && !loadingBatch && (
                  <p className={`text-xs mt-1 font-medium ${
                    chickensEntered > available ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {chickensEntered > available
                      ? `⚠ Exceeds available (${available.toLocaleString('en-IN')})`
                      : `Available: ${available.toLocaleString('en-IN')} birds`}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.kgSold')} *</label>
                <input
                  required type="number" min="0.01" step="0.01"
                  value={form.kg_sold} onChange={set('kg_sold')}
                  placeholder="e.g. 120.5"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.pricePerKg')} (₹) *</label>
                <input
                  required type="number" min="0.01" step="0.01"
                  value={form.price_per_kg} onChange={set('price_per_kg')}
                  placeholder="e.g. 95"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Auto-calculated total */}
            <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${
              total ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'
            }`}>
              <span className="text-sm font-medium text-gray-600">{t('sales.totalAmount')}</span>
              <span className={`text-lg font-bold ${total ? 'text-green-700' : 'text-gray-300'}`}>
                {total ? formatCurrency(total) : '—'}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input
                required type="date"
                value={form.date} onChange={set('date')}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')}</label>
              <input
                type="text"
                value={form.notes} onChange={set('notes')}
                placeholder={t('common.optional')}
                className={inputCls}
              />
            </div>

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
                {saving ? `${t('common.save')}…` : t('sales.recordSale')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Sales() {
  const { t, i18n } = useTranslation()
  const { organization, canRecordOperations } = useAuth()
  const [sales, setSales]       = useState([])
  const [batches, setBatches]   = useState([])   // active only for modal
  const [vendors, setVendors]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)

  async function fetchData() {
    setLoading(true)
    const [
      { data: salesData },
      { data: batchData },
      { data: vendorData },
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('*, batches(start_date, chick_count, farms(name)), vendors(name), created_by_name, created_at, updated_by_name, updated_at')
        .eq('organization_id', organization?.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('batches')
        .select('id, start_date, chick_count, mortality_count, farms(name)')
        .eq('organization_id', organization?.id)
        .eq('status', 'active')
        .order('start_date', { ascending: false }),
      supabase
        .from('vendors')
        .select('id, name')
        .eq('organization_id', organization?.id)
        .order('name'),
    ])
    setSales(salesData || [])
    setBatches(batchData || [])
    setVendors(vendorData || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Revenue this month
  const now = new Date()
  const thisMonthRevenue = sales
    .filter(s => {
      const d = new Date(s.date)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    .reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

  const monthLabel = now.toLocaleDateString(i18n.language === 'ml' ? 'ml-IN' : 'en-IN', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('sales.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record and track all sales</p>
        </div>
        {canRecordOperations && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
          >
            <span className="text-base leading-none">+</span> {t('sales.recordSale')}
          </button>
        )}
      </div>

      {/* Revenue this month */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-400 rounded-2xl px-6 py-5 mb-6 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-sm text-amber-100 font-medium">{t('sales.totalRevenue')} — {monthLabel}</p>
          <p className="text-3xl font-bold text-white mt-0.5">
            {loading ? '…' : formatCurrency(thisMonthRevenue)}
          </p>
        </div>
        <span className="text-5xl opacity-30">💰</span>
      </div>

      {/* Sales table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">📦</span>
            <p className="text-sm font-medium">{t('sales.noSales')}</p>
            <p className="text-xs mt-1">{t('sales.recordSale')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">{t('common.date')}</th>
                <th className="px-5 py-3">{t('sales.batch')}</th>
                <th className="px-5 py-3">{t('sales.vendor')}</th>
                <th className="px-5 py-3 text-right">Chickens</th>
                <th className="px-5 py-3 text-right">{t('sales.kgSold')}</th>
                <th className="px-5 py-3 text-right">{t('sales.pricePerKg')}</th>
                <th className="px-5 py-3 text-right">{t('common.total')}</th>
                <th className="w-8 px-5 py-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sales.map(s => (
                <tr key={s.id} className="hover:bg-amber-50/40 transition">
                  <td className="px-5 py-4 text-gray-600 whitespace-nowrap">{formatDate(s.date, i18n.language)}</td>
                  <td className="px-5 py-4 text-gray-700">
                    {s.batches
                      ? `${s.batches.farms?.name ?? '—'} (${formatDate(s.batches.start_date, i18n.language)})`
                      : '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-700">{s.vendors?.name ?? '—'}</td>
                  <td className="px-5 py-4 text-right text-gray-700">
                    {s.chicken_count != null ? Number(s.chicken_count).toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-5 py-4 text-right text-gray-700">
                    {Number(s.kg_sold).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg
                  </td>
                  <td className="px-5 py-4 text-right text-gray-700">
                    {formatCurrency(s.price_per_kg)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-gray-800">
                    {formatCurrency(s.total_amount)}
                  </td>
                  <td className="px-5 py-4">
                    <AuditInfo createdByName={s.created_by_name} createdAt={s.created_at} updatedByName={s.updated_by_name} updatedAt={s.updated_at} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={7} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                  {t('common.total')}
                </td>
                <td className="px-5 py-3 text-right font-bold text-gray-800">
                  {formatCurrency(sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <SaleModal
          batches={batches}
          vendors={vendors}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchData() }}
        />
      )}
    </div>
  )
}
