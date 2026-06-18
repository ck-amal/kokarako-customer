import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GROW_OUT_DAYS = 45

function daysRemaining(startDate) {
  const start = new Date(startDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  return GROW_OUT_DAYS - Math.floor((today - start) / (1000 * 60 * 60 * 24))
}

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function currentMonthRange() {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end:   new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent, to, loading }) {
  const card = (
    <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex items-start justify-between gap-3 transition
      ${accent === 'red'    ? 'border-red-200'    : ''}
      ${accent === 'green'  ? 'border-green-200'  : ''}
      ${accent === 'amber'  ? 'border-amber-200'  : ''}
      ${accent === 'blue'   ? 'border-blue-200'   : ''}
      ${!accent             ? 'border-gray-100'   : ''}
      ${to ? 'hover:shadow-md cursor-pointer' : ''}
    `}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="h-8 w-24 bg-gray-100 rounded-lg animate-pulse mt-1" />
        ) : (
          <p className={`text-2xl font-bold mt-1 leading-none
            ${accent === 'red'   ? 'text-red-600'   : ''}
            ${accent === 'green' ? 'text-green-600' : ''}
            ${accent === 'amber' ? 'text-amber-600' : ''}
            ${accent === 'blue'  ? 'text-blue-600'  : ''}
            ${!accent            ? 'text-gray-800'  : ''}
          `}>{value}</p>
        )}
        {sub && !loading && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      <span className="text-3xl opacity-80 shrink-0">{icon}</span>
    </div>
  )

  return to ? <Link to={to}>{card}</Link> : card
}

// ─── Days remaining pill ──────────────────────────────────────────────────────

function DaysPill({ startDate }) {
  const days = daysRemaining(startDate)
  if (days < 0)  return <span className="text-xs font-semibold text-red-600">{Math.abs(days)}d overdue</span>
  if (days <= 5) return <span className="text-xs font-semibold text-orange-500">{days}d left</span>
  return <span className="text-xs font-semibold text-gray-600">{days}d left</span>
}

// ─── Recent activity row ──────────────────────────────────────────────────────

function ActivityRow({ type, label, sub, amount, date, positive }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm
        ${positive ? 'bg-green-100' : 'bg-red-50'}`}>
        {positive ? '💰' : '🧾'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
        <p className="text-xs text-gray-400">{sub} · {formatDate(date)}</p>
      </div>
      <span className={`text-sm font-bold shrink-0 ${positive ? 'text-green-600' : 'text-red-500'}`}>
        {positive ? '+' : '−'}{formatCurrency(amount)}
      </span>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      const { start, end } = currentMonthRange()

      const [
        { data: batches },
        { data: vendorBals },
        { data: lowStock },
        { data: recentSales },
        { data: recentExpenses },
        { data: monthSales },
      ] = await Promise.all([
        // Active batches (for count, chick total, table)
        supabase
          .from('batches')
          .select('id, start_date, chick_count, farms(name)')
          .eq('status', 'active')
          .order('start_date', { ascending: false }),

        // Vendor outstanding balances
        supabase
          .from('vendor_balances')
          .select('outstanding_balance'),

        // Low stock items
        supabase
          .from('low_stock_alerts')
          .select('id'),

        // 5 most recent sales
        supabase
          .from('sales')
          .select('id, date, total_amount, vendors(name), batches(farms(name))')
          .order('date', { ascending: false })
          .limit(5),

        // 5 most recent expenses
        supabase
          .from('expenses')
          .select('id, date, amount, category, description')
          .order('date', { ascending: false })
          .limit(5),

        // Revenue this month
        supabase
          .from('sales')
          .select('total_amount')
          .gte('date', start)
          .lte('date', end),
      ])

      const monthRevenue  = (monthSales || []).reduce((s, r) => s + Number(r.total_amount || 0), 0)
      const totalOutstanding = (vendorBals || [])
        .reduce((s, v) => s + Math.max(0, Number(v.outstanding_balance)), 0)
      const totalChicks = (batches || []).reduce((s, b) => s + Number(b.chick_count), 0)

      // Merge and sort recent transactions (sales + expenses) by date, take 5
      const txns = [
        ...(recentSales || []).map(s => ({
          id:       s.id,
          type:     'sale',
          label:    `Sale — ${s.vendors?.name ?? 'Vendor'}`,
          sub:      s.batches?.farms?.name ?? '—',
          amount:   s.total_amount,
          date:     s.date,
          positive: true,
        })),
        ...(recentExpenses || []).map(e => ({
          id:       e.id,
          type:     'expense',
          label:    e.description || `Expense — ${e.category}`,
          sub:      e.category,
          amount:   e.amount,
          date:     e.date,
          positive: false,
        })),
      ]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5)

      setData({
        batches:        batches || [],
        totalChicks,
        monthRevenue,
        totalOutstanding,
        lowStockCount:  (lowStock || []).length,
        txns,
      })
      setLoading(false)
    }

    fetchAll()
  }, [])

  const monthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-8">

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Active Batches"
          value={loading ? '…' : data.batches.length}
          sub={loading ? '' : `${data.batches.length === 1 ? '1 farm' : `${data.batches.length} farms`} running`}
          icon="🐣"
          to="/batches"
          loading={loading}
        />
        <StatCard
          label="Total Chicks Alive"
          value={loading ? '…' : data.totalChicks.toLocaleString('en-IN')}
          sub="across active batches"
          icon="🐔"
          loading={loading}
        />
        <StatCard
          label={`Revenue — ${new Date().toLocaleString('en-IN', { month: 'short' })}`}
          value={loading ? '…' : formatCurrency(data.monthRevenue)}
          sub={monthName}
          icon="💰"
          accent="green"
          to="/sales"
          loading={loading}
        />
        <StatCard
          label="Outstanding Payments"
          value={loading ? '…' : formatCurrency(data.totalOutstanding)}
          sub={loading || data.totalOutstanding === 0 ? 'All cleared' : 'owed by vendors'}
          icon="📋"
          accent={!loading && data.totalOutstanding > 0 ? 'red' : undefined}
          to="/cash-collection"
          loading={loading}
        />
        <StatCard
          label="Low Stock Alerts"
          value={loading ? '…' : data.lowStockCount}
          sub={loading ? '' : data.lowStockCount === 0 ? 'All stocked up' : `item${data.lowStockCount > 1 ? 's' : ''} need restocking`}
          icon="📦"
          accent={!loading && data.lowStockCount > 0 ? 'amber' : undefined}
          to="/stock"
          loading={loading}
        />
      </div>

      {/* Active batches table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Active Batches</h2>
          <Link to="/batches" className="text-xs text-amber-600 hover:underline font-medium">View all →</Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
            </div>
          ) : data.batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-2">🐣</span>
              <p className="text-sm">No active batches</p>
              <Link to="/batches" className="text-xs text-amber-500 hover:underline mt-1">Start a batch →</Link>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Farm</th>
                  <th className="px-5 py-3">Start Date</th>
                  <th className="px-5 py-3 text-right">Chicks</th>
                  <th className="px-5 py-3 text-center">Progress</th>
                  <th className="px-5 py-3 text-right">Days Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.batches.map(b => {
                  const elapsed  = GROW_OUT_DAYS - daysRemaining(b.start_date)
                  const pct      = Math.min(100, Math.max(0, Math.round((elapsed / GROW_OUT_DAYS) * 100)))
                  const isOver   = daysRemaining(b.start_date) < 0
                  const isNear   = daysRemaining(b.start_date) <= 5 && !isOver
                  return (
                    <tr key={b.id} className="hover:bg-amber-50/40 transition">
                      <td className="px-5 py-3.5 font-medium text-gray-800">{b.farms?.name ?? '—'}</td>
                      <td className="px-5 py-3.5 text-gray-500">{formatDate(b.start_date)}</td>
                      <td className="px-5 py-3.5 text-right text-gray-700">{Number(b.chick_count).toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isOver ? 'bg-red-400' : isNear ? 'bg-orange-400' : 'bg-amber-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right shrink-0">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <DaysPill startDate={b.start_date} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Recent Transactions</h2>
          <div className="flex gap-3">
            <Link to="/sales"    className="text-xs text-amber-600 hover:underline font-medium">Sales →</Link>
            <Link to="/expenses" className="text-xs text-amber-600 hover:underline font-medium">Expenses →</Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
            </div>
          ) : data.txns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-2">📊</span>
              <p className="text-sm">No transactions yet</p>
            </div>
          ) : (
            <div>
              {data.txns.map(t => (
                <ActivityRow key={`${t.type}-${t.id}`} {...t} />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
