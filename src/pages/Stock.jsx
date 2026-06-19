import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtQty(n) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

const TYPE_STYLES = {
  chicks:    'bg-yellow-100 text-yellow-700',
  feed:      'bg-green-100  text-green-700',
  medicine:  'bg-blue-100   text-blue-700',
  equipment: 'bg-purple-100 text-purple-700',
  other:     'bg-gray-100   text-gray-600',
}

const REF_LABELS = {
  procurement:  { label: 'Procurement',  color: 'text-green-600' },
  batch:        { label: 'Batch placed', color: 'text-amber-600' },
  distribution: { label: 'Distribution', color: 'text-blue-600' },
}

// ─── History drawer ───────────────────────────────────────────────────────────

function HistoryDrawer({ item, entries, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">{item.item_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmtQty(item.totalIn)} {item.unit} in · {fmtQty(item.totalOut)} {item.unit} out ·{' '}
              <span className={item.balance >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                {fmtQty(item.balance)} {item.unit} balance
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {entries.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">No ledger entries found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-2">
                  <th className="pb-2">Date</th>
                  <th className="pb-2 text-center">In / Out</th>
                  <th className="pb-2 text-right">Quantity</th>
                  <th className="pb-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map(e => {
                  const ref = REF_LABELS[e.reference_type] || { label: e.reference_type, color: 'text-gray-500' }
                  return (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="py-2.5 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold
                          ${e.change_type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {e.change_type === 'in' ? '▲ IN' : '▼ OUT'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-gray-800">
                        {fmtQty(e.quantity)} {e.unit}
                      </td>
                      <td className={`py-2.5 text-xs font-medium ${ref.color}`}>{ref.label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Stock() {
  const [ledger,       setLedger]       = useState([])
  const [reorderMap,   setReorderMap]   = useState({}) // item_name (lowercase) → reorder_level
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [historyItem,  setHistoryItem]  = useState(null)  // the computed item row
  const [historyEntries, setHistoryEntries] = useState([])

  async function fetchData() {
    setLoading(true)
    const [{ data: ledgerData }, { data: stockData }] = await Promise.all([
      supabase.from('stock_ledger').select('*').order('date', { ascending: false }),
      supabase.from('stock').select('item_name, reorder_level'),
    ])

    setLedger(ledgerData || [])

    const rMap = {}
    for (const s of (stockData || [])) {
      rMap[s.item_name.toLowerCase().trim()] = Number(s.reorder_level || 0)
    }
    setReorderMap(rMap)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // ─── Compute balances from ledger ───────────────────────────────────────────

  const itemMap = {}
  for (const row of ledger) {
    const key = row.item_name.toLowerCase().trim()
    if (!itemMap[key]) {
      itemMap[key] = {
        item_name: row.item_name,
        item_type: row.item_type,
        unit:      row.unit,
        totalIn:   0,
        totalOut:  0,
      }
    }
    if (row.change_type === 'in')  itemMap[key].totalIn  += Number(row.quantity)
    else                           itemMap[key].totalOut += Number(row.quantity)
  }

  const items = Object.entries(itemMap).map(([key, v]) => ({
    ...v,
    balance:      v.totalIn - v.totalOut,
    reorderLevel: reorderMap[key] ?? 0,
  })).sort((a, b) => a.item_name.localeCompare(b.item_name))

  // ─── Filters ────────────────────────────────────────────────────────────────

  const allTypes = [...new Set(items.map(i => i.item_type))]

  const filtered = items.filter(item => {
    const matchSearch = item.item_name.toLowerCase().includes(search.toLowerCase())
    const matchType   = typeFilter === 'all' || item.item_type === typeFilter
    return matchSearch && matchType
  })

  const lowCount   = items.filter(i => i.balance > 0 && i.reorderLevel > 0 && i.balance <= i.reorderLevel).length
  const emptyCount = items.filter(i => i.balance <= 0).length

  // ─── View history ────────────────────────────────────────────────────────────

  function openHistory(item) {
    const key = item.item_name.toLowerCase().trim()
    const entries = ledger.filter(e => e.item_name.toLowerCase().trim() === key)
    setHistoryEntries(entries)
    setHistoryItem(item)
  }

  // ─── Status color helpers ────────────────────────────────────────────────────

  function rowBorderColor(item) {
    if (item.balance <= 0) return 'border-l-gray-300'
    if (item.reorderLevel > 0 && item.balance <= item.reorderLevel) return 'border-l-red-400'
    return 'border-l-green-400'
  }

  function balanceColor(item) {
    if (item.balance <= 0) return 'text-gray-400'
    if (item.reorderLevel > 0 && item.balance <= item.reorderLevel) return 'text-red-600 font-bold'
    return 'text-green-700 font-bold'
  }

  function statusLabel(item) {
    if (item.balance <= 0) return { text: 'Empty', cls: 'bg-gray-100 text-gray-500' }
    if (item.reorderLevel > 0 && item.balance <= item.reorderLevel) return { text: 'Low', cls: 'bg-red-100 text-red-600' }
    return { text: 'OK', cls: 'bg-green-100 text-green-700' }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live inventory — driven by procurement &amp; distributions</p>
        </div>
      </div>

      {/* Alert banners */}
      {(emptyCount > 0 || lowCount > 0) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {emptyCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
              <span className="font-bold">⚠</span>
              <span><span className="font-semibold">{emptyCount} item{emptyCount > 1 ? 's' : ''}</span> out of stock</span>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-2.5 text-sm text-yellow-700">
              <span className="font-bold">↓</span>
              <span><span className="font-semibold">{lowCount} item{lowCount > 1 ? 's' : ''}</span> below reorder level</span>
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Items',  value: items.length,  color: 'text-gray-800'  },
            { label: 'In Stock',     value: items.filter(i => i.balance > 0 && !(i.reorderLevel > 0 && i.balance <= i.reorderLevel)).length, color: 'text-green-600' },
            { label: 'Low Stock',    value: lowCount,      color: 'text-red-500'   },
            { label: 'Out of Stock', value: emptyCount,    color: 'text-gray-400'  },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-xs text-gray-500 font-medium">{label}</p>
              <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"
        />
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {['all', ...allTypes].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 font-medium capitalize transition
                ${typeFilter === t ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">📦</span>
            <p className="text-sm font-medium">
              {items.length === 0 ? 'No stock movements recorded yet' : 'No items match your filters'}
            </p>
            {items.length === 0 && (
              <p className="text-xs mt-1 text-gray-400">Record a procurement to start tracking stock</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Total In</th>
                  <th className="px-5 py-3 text-right">Total Out</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">History</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(item => {
                  const status = statusLabel(item)
                  return (
                    <tr key={item.item_name} className={`hover:bg-amber-50/30 transition border-l-4 ${rowBorderColor(item)}`}>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-800">{item.item_name}</p>
                        {item.reorderLevel > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">Reorder at {fmtQty(item.reorderLevel)} {item.unit}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TYPE_STYLES[item.item_type] ?? TYPE_STYLES.other}`}>
                          {item.item_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-600">
                        {fmtQty(item.totalIn)} <span className="text-gray-400 text-xs">{item.unit}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-600">
                        {fmtQty(item.totalOut)} <span className="text-gray-400 text-xs">{item.unit}</span>
                      </td>
                      <td className={`px-5 py-3.5 text-right text-base ${balanceColor(item)}`}>
                        {fmtQty(item.balance)} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => openHistory(item)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History drawer */}
      {historyItem && (
        <HistoryDrawer
          item={historyItem}
          entries={historyEntries}
          onClose={() => { setHistoryItem(null); setHistoryEntries([]) }}
        />
      )}
    </div>
  )
}
