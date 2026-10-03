import { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import AuditInfo from '../components/AuditInfo'

// ─── Sales Tab ────────────────────────────────────────────────────────────────

function SalesTab({ sales }) {
  const { i18n } = useTranslation()
  const [filter, setFilter] = useState('All')

  const filtered = filter === 'All' ? sales : sales.filter(s => s.status === filter)

  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-4xl mb-2">🐔</span>
        <p className="text-sm">No sales recorded yet</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-2 mb-4">
        {['All', 'confirmed', 'pending', 'rejected'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
              filter === f
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Item / Batch</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-amber-50/30 transition">
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                    {formatDate(s.date, i18n.language)}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-800">
                      {s.item_name || (s.sale_type === 'chicken' ? 'Chicken Sale' : 'Goods Sale')}
                    </p>
                    {s.batch_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{s.batch_name}</p>
                    )}
                    {s.chicken_count > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{Number(s.chicken_count).toLocaleString('en-IN')} birds</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-gray-800">
                    {formatCurrency(s.total_amount || s.final_amount || 0)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                      s.status === 'confirmed' ? 'bg-green-100 text-green-700'
                      : s.status === 'rejected' ? 'bg-red-100 text-red-600'
                      : 'bg-amber-100 text-amber-700'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-100">
                <td className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" colSpan={2}>
                  Total (confirmed)
                </td>
                <td className="px-5 py-3 text-right font-bold text-gray-800">
                  {formatCurrency(sales.filter(s => s.status === 'confirmed').reduce((sum, s) => sum + Number(s.total_amount || s.final_amount || 0), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Collections Tab ──────────────────────────────────────────────────────────

function CollectionsTab({ collections }) {
  const { i18n } = useTranslation()

  if (collections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-4xl mb-2">💰</span>
        <p className="text-sm">No collections recorded yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3">Method</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Notes</th>
              <th className="px-5 py-3">🕐</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {collections.map(c => (
              <tr key={c.id} className="hover:bg-green-50/30 transition">
                <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                  {formatDate(c.created_at?.slice(0, 10), i18n.language)}
                </td>
                <td className="px-5 py-3.5 text-right font-semibold text-green-600">
                  {formatCurrency(c.amount_paid)}
                </td>
                <td className="px-5 py-3.5 text-gray-600 capitalize">{c.method || '—'}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                    c.status === 'verified' ? 'bg-green-100 text-green-700'
                    : c.status === 'rejected' ? 'bg-red-100 text-red-600'
                    : 'bg-amber-100 text-amber-700'
                  }`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-gray-400 max-w-[140px] truncate" title={c.notes || ''}>
                  {c.notes || '—'}
                </td>
                <td className="px-5 py-3.5">
                  <AuditInfo createdByName={c.collected_by_name} createdAt={c.created_at} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-100">
              <td className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total (verified)</td>
              <td className="px-5 py-3 text-right font-bold text-green-600">
                {formatCurrency(collections.filter(c => c.status === 'verified').reduce((s, c) => s + Number(c.amount_paid), 0))}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Ledger Tab ───────────────────────────────────────────────────────────────

function LedgerTab({ sales, collections, openingBalance }) {
  const { i18n } = useTranslation()

  const entries = []

  if (openingBalance !== 0) {
    entries.push({
      id:     'opening',
      date:   '0000-00-00',
      type:   'opening',
      label:  'Opening Balance',
      sub:    '',
      debit:  openingBalance > 0 ? openingBalance : 0,
      credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
    })
  }

  sales
    .filter(s => s.status === 'confirmed')
    .forEach(s => entries.push({
      id:     s.id,
      date:   s.date,
      type:   'sale',
      label:  s.item_name || (s.sale_type === 'chicken' ? 'Chicken Sale' : 'Goods Sale'),
      sub:    s.batch_name || '',
      debit:  Number(s.total_amount || s.final_amount || 0),
      credit: 0,
    }))

  collections
    .filter(c => c.status === 'verified')
    .forEach(c => entries.push({
      id:     c.id,
      date:   c.created_at?.slice(0, 10) || '',
      type:   'collection',
      label:  `Collection — ${c.method || 'Cash'}`,
      sub:    c.notes || '',
      debit:  0,
      credit: Number(c.amount_paid),
    }))

  entries.sort((a, b) => a.date.localeCompare(b.date))

  let balance = 0
  const rows = entries.map(e => {
    balance += e.debit - e.credit
    return { ...e, balance }
  })

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-4xl mb-2">📒</span>
        <p className="text-sm">No transactions yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[550px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3 text-right">Debit (They owe)</th>
              <th className="px-5 py-3 text-right">Credit (They paid)</th>
              <th className="px-5 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => (
              <tr
                key={`${r.type}-${r.id}`}
                className={`transition ${r.type === 'collection' ? 'hover:bg-green-50/30' : 'hover:bg-red-50/20'}`}
              >
                <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                  {r.date === '0000-00-00' ? '—' : formatDate(r.date, i18n.language)}
                </td>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-gray-800">{r.label}</p>
                  {r.sub && <p className="text-xs text-gray-400">{r.sub}</p>}
                </td>
                <td className="px-5 py-3.5 text-right font-semibold text-red-500">
                  {r.debit > 0 ? formatCurrency(r.debit) : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-semibold text-green-600">
                  {r.credit > 0 ? formatCurrency(r.credit) : '—'}
                </td>
                <td className={`px-5 py-3.5 text-right font-bold ${r.balance > 0 ? 'text-red-600' : r.balance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                  {formatCurrency(Math.abs(r.balance))}
                  {r.balance < 0 && <span className="text-xs font-normal ml-1">(cr)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VendorDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { organization, canViewFinancials } = useAuth()
  const { i18n } = useTranslation()

  const [vendor,      setVendor]      = useState(null)
  const [sales,       setSales]       = useState([])
  const [collections, setCollections] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('Sales')

  async function fetchAll() {
    setLoading(true)
    const [{ data: v }, { data: s }, { data: cc }] = await Promise.all([
      supabase.from('vendors').select('*').eq('organization_id', organization.id).eq('id', id).single(),
      supabase
        .from('sales')
        .select('id, date, sale_type, total_amount, final_amount, chicken_count, status, item_id, batch_id, items(name)')
        .eq('organization_id', organization.id)
        .eq('vendor_id', id)
        .order('date', { ascending: false }),
      supabase
        .from('cash_collection')
        .select('id, amount_paid, method, status, notes, created_at, collected_by_name')
        .eq('organization_id', organization.id)
        .eq('vendor_id', id)
        .order('created_at', { ascending: false }),
    ])
    setVendor(v)
    setSales((s || []).map(r => ({
      ...r,
      item_name:  r.items?.name  || null,
      batch_name: null,
    })))
    setCollections(cc || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id])

  if (!canViewFinancials) return <Navigate to="/dashboard" replace />

  const totalSales       = sales.filter(s => s.status === 'confirmed').reduce((sum, s) => sum + Number(s.total_amount || s.final_amount || 0), 0)
  const totalCollected   = collections.filter(c => c.status === 'verified').reduce((sum, c) => sum + Number(c.amount_paid), 0)
  const openingBalance   = Number(vendor?.opening_balance || 0)
  const outstanding      = openingBalance + totalSales - totalCollected

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <span className="text-5xl mb-3">🤝</span>
        <p className="text-sm font-medium">Vendor not found</p>
        <button onClick={() => navigate('/vendors')} className="text-xs text-amber-500 hover:underline mt-1">← Back to Vendors</button>
      </div>
    )
  }

  const TABS = ['Sales', 'Collections', 'Ledger']

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate('/vendors')}
            className="text-sm text-gray-500 hover:text-amber-600 flex items-center gap-1 mb-2 transition"
          >
            ← Vendors
          </button>
          <h1 className="text-2xl font-bold text-gray-800">{vendor.name}</h1>
          {vendor.phone && (
            <p className="text-sm text-gray-500 mt-0.5">📞 {vendor.phone}</p>
          )}
          {vendor.address && (
            <p className="text-sm text-gray-400 mt-0.5">📍 {vendor.address}</p>
          )}
        </div>

        <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-base font-bold shrink-0 ${
          outstanding < 0 ? 'bg-blue-100 text-blue-700'
          : outstanding > 0 ? 'bg-amber-100 text-amber-700'
          : 'bg-green-100 text-green-700'
        }`}>
          {outstanding < 0
            ? `Credit ${formatCurrency(Math.abs(outstanding))}`
            : outstanding > 0
            ? `${formatCurrency(outstanding)} due`
            : '✓ All cleared'}
        </span>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Sales</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(totalSales)}</p>
          {openingBalance !== 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Opening: {openingBalance > 0 ? '+' : ''}{formatCurrency(openingBalance)}</p>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Collected</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(totalCollected)}</p>
        </div>
        <div className={`bg-white rounded-2xl border shadow-sm px-4 py-3 ${
          outstanding > 0 ? 'border-amber-200' : outstanding < 0 ? 'border-blue-200' : 'border-gray-100'
        }`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
            {outstanding < 0 ? 'Credit Balance' : 'Balance Due'}
          </p>
          <p className={`text-xl font-bold mt-1 ${
            outstanding > 0 ? 'text-amber-600' : outstanding < 0 ? 'text-blue-600' : 'text-green-600'
          }`}>
            {formatCurrency(Math.abs(outstanding))}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-5">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Sales'       && <SalesTab       sales={sales} />}
      {activeTab === 'Collections' && <CollectionsTab collections={collections} />}
      {activeTab === 'Ledger'      && <LedgerTab      sales={sales} collections={collections} openingBalance={openingBalance} />}
    </div>
  )
}
