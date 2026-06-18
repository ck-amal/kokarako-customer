import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function pct(part, total) {
  if (!total || total === 0) return '0.0'
  return ((part / total) * 100).toFixed(1)
}

// ─── Simple horizontal bar chart ─────────────────────────────────────────────

function BarChart({ revenue, totalCost, profit }) {
  const max     = Math.max(revenue, totalCost, 1)
  const revPct  = Math.round((revenue  / max) * 100)
  const costPct = Math.round((totalCost / max) * 100)

  const bars = [
    { label: 'Revenue',    value: revenue,   pct: revPct,  color: 'bg-green-400' },
    { label: 'Total Cost', value: totalCost, pct: costPct, color: 'bg-red-400' },
    { label: 'Net Profit', value: Math.abs(profit), pct: Math.round((Math.abs(profit) / max) * 100),
      color: profit >= 0 ? 'bg-amber-400' : 'bg-gray-400' },
  ]

  return (
    <div className="space-y-3">
      {bars.map(b => (
        <div key={b.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-gray-600">{b.label}</span>
            <span className="font-bold text-gray-800">{fmt(b.value)}</span>
          </div>
          <div className="h-5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${b.color}`}
              style={{ width: `${b.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── P&L row ──────────────────────────────────────────────────────────────────

function PLRow({ label, value, sub, indent, bold, positive, negative, separator }) {
  if (separator) {
    return <tr><td colSpan={3} className="px-5 py-1"><div className="border-t border-gray-100" /></td></tr>
  }
  return (
    <tr className={bold ? 'bg-gray-50' : 'hover:bg-gray-50/50'}>
      <td className={`px-5 py-2.5 text-sm ${bold ? 'font-semibold text-gray-800' : 'text-gray-700'} ${indent ? 'pl-9' : ''}`}>
        {label}
        {sub && <span className="block text-xs text-gray-400 font-normal">{sub}</span>}
      </td>
      <td className={`px-5 py-2.5 text-right text-sm ${
        bold     ? 'font-bold text-gray-800' :
        positive ? 'font-semibold text-green-700' :
        negative ? 'font-semibold text-red-600' :
        'text-gray-700'
      }`}>
        {value !== null && value !== undefined ? fmt(value) : '—'}
      </td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BatchReport() {
  const { id }          = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    async function fetchReport() {
      setLoading(true)

      // 1. Batch + farm
      const { data: batch, error: bErr } = await supabase
        .from('batches')
        .select('*, farms(name, location)')
        .eq('id', id)
        .single()

      if (bErr || !batch) { setError('Batch not found.'); setLoading(false); return }

      // 2. All procurement linked to this batch
      const { data: procurement } = await supabase
        .from('procurement')
        .select('*')
        .eq('batch_id', id)
        .order('date')

      // 3. All sales linked to this batch
      const { data: sales } = await supabase
        .from('sales')
        .select('*, vendors(name)')
        .eq('batch_id', id)
        .order('date')

      // 4. All expenses linked to this batch
      const { data: expenses } = await supabase
        .from('expenses')
        .select('*')
        .eq('batch_id', id)
        .order('date')

      // ── Aggregate ──────────────────────────────────────────

      const proc = procurement || []
      const sal  = sales       || []
      const exp  = expenses    || []

      const chickCost    = proc.filter(p => p.type === 'chicks')   .reduce((s, p) => s + Number(p.cost), 0)
      const feedCost     = proc.filter(p => p.type === 'feed')     .reduce((s, p) => s + Number(p.cost), 0)
      const medicineCost = proc.filter(p => p.type === 'medicine') .reduce((s, p) => s + Number(p.cost), 0)
      const otherProcCost= proc.filter(p => !['chicks','feed','medicine'].includes(p.type))
                               .reduce((s, p) => s + Number(p.cost), 0)
      const expenseTotal = exp.reduce((s, e) => s + Number(e.amount), 0)

      const totalCost    = chickCost + feedCost + medicineCost + otherProcCost + expenseTotal
      const revenue      = sal.reduce((s, s2) => s + Number(s2.total_amount || 0), 0)
      const grossProfit  = revenue - totalCost
      const marginPct    = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : '0.0'

      const totalKgSold  = sal.reduce((s, s2) => s + Number(s2.kg_sold || 0), 0)
      const mortality    = Number(batch.mortality_count || 0)
      const survived     = batch.chick_count - mortality
      const survivalRate = batch.chick_count > 0
        ? ((survived / batch.chick_count) * 100).toFixed(1)
        : '100.0'

      // Feed per bird estimate (for reference)
      const feedPerBird  = batch.chick_count > 0
        ? (feedCost / batch.chick_count).toFixed(2)
        : null

      setReport({
        batch, proc, sal, exp,
        chickCost, feedCost, medicineCost, otherProcCost, expenseTotal,
        totalCost, revenue, grossProfit, marginPct,
        totalKgSold, mortality, survived, survivalRate, feedPerBird,
      })
      setLoading(false)
    }

    fetchReport()
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center py-32 text-gray-400">
      <span className="text-5xl mb-3">❌</span>
      <p className="text-sm">{error}</p>
      <Link to="/batches" className="mt-3 text-xs text-amber-500 hover:underline">← Back to Batches</Link>
    </div>
  )

  const { batch, sal, exp, proc,
          chickCost, feedCost, medicineCost, otherProcCost, expenseTotal,
          totalCost, revenue, grossProfit, marginPct,
          totalKgSold, mortality, survived, survivalRate } = report

  const isProfitable = grossProfit >= 0

  return (
    <div className="space-y-7 max-w-4xl mx-auto">

      {/* Back + header */}
      <div>
        <Link to="/batches" className="text-xs text-amber-600 hover:underline font-medium">← Back to Batches</Link>
        <div className="flex items-start justify-between mt-2 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Batch Report</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {batch.farms?.name}
              {batch.farms?.location ? ` · ${batch.farms.location}` : ''}
              {' · '}Started {fmtDate(batch.start_date)}
            </p>
          </div>
          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize bg-gray-100 text-gray-600">
            {batch.status}
          </span>
        </div>
      </div>

      {/* Batch summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Chicks Placed',  value: Number(batch.chick_count).toLocaleString('en-IN') },
          { label: 'Mortality',      value: mortality > 0 ? mortality.toLocaleString('en-IN') : 'None recorded',
            accent: mortality > 0 ? 'text-red-600' : 'text-gray-800' },
          { label: 'Survival Rate',  value: `${survivalRate}%`,
            accent: Number(survivalRate) >= 95 ? 'text-green-600' : Number(survivalRate) >= 88 ? 'text-amber-600' : 'text-red-600' },
          { label: 'Kg Sold',        value: `${Number(totalKgSold).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg` },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${accent || 'text-gray-800'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* P&L + bar chart — two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* P&L table */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Profit & Loss</h2>
          </div>
          <table className="w-full">
            <tbody>
              <PLRow label="REVENUE" bold />
              <PLRow label="Total Sales" value={revenue} positive indent
                sub={sal.length > 0 ? `${sal.length} sale${sal.length > 1 ? 's' : ''}, ${Number(totalKgSold).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg` : undefined}
              />

              <PLRow separator />
              <PLRow label="COSTS" bold />
              <PLRow label="Chick Purchase"       value={chickCost}     indent />
              <PLRow label="Feed"                 value={feedCost}      indent />
              <PLRow label="Medicine"             value={medicineCost}  indent />
              {otherProcCost > 0 && (
                <PLRow label="Other Procurement"  value={otherProcCost} indent />
              )}
              <PLRow label="Expenses (labour etc)"value={expenseTotal}  indent
                sub={exp.length > 0 ? `${exp.length} expense entr${exp.length > 1 ? 'ies' : 'y'}` : undefined}
              />
              <PLRow separator />
              <PLRow label="Total Cost"  value={totalCost}   bold negative={totalCost > 0} />

              <PLRow separator />
              <PLRow
                label={isProfitable ? 'Net Profit' : 'Net Loss'}
                value={Math.abs(grossProfit)}
                bold
                positive={isProfitable}
                negative={!isProfitable}
              />
            </tbody>
          </table>
          {/* Margin */}
          <div className={`px-5 py-3 border-t ${isProfitable ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Profit Margin</span>
              <span className={`text-lg font-bold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                {isProfitable ? '' : '−'}{Math.abs(Number(marginPct))}%
              </span>
            </div>
          </div>
        </div>

        {/* Bar chart + cost breakdown */}
        <div className="lg:col-span-2 space-y-5">

          {/* Bar chart */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <h2 className="font-semibold text-gray-800 mb-4">Revenue vs Cost</h2>
            <BarChart revenue={revenue} totalCost={totalCost} profit={grossProfit} />
          </div>

          {/* Cost breakdown donut-style list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <h2 className="font-semibold text-gray-800 mb-3">Cost Breakdown</h2>
            <div className="space-y-2">
              {[
                { label: 'Chicks',     value: chickCost,    color: 'bg-yellow-400' },
                { label: 'Feed',       value: feedCost,     color: 'bg-green-400'  },
                { label: 'Medicine',   value: medicineCost, color: 'bg-blue-400'   },
                { label: 'Other',      value: otherProcCost, color: 'bg-purple-400' },
                { label: 'Expenses',   value: expenseTotal, color: 'bg-orange-400' },
              ].filter(c => c.value > 0).map(c => (
                <div key={c.label} className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${c.color}`} />
                  <span className="text-xs text-gray-600 flex-1">{c.label}</span>
                  <span className="text-xs font-semibold text-gray-800">{fmt(c.value)}</span>
                  <span className="text-xs text-gray-400 w-10 text-right">
                    {pct(c.value, totalCost)}%
                  </span>
                </div>
              ))}
              {totalCost === 0 && (
                <p className="text-xs text-gray-400">No costs recorded for this batch.</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Sales detail */}
      {sal.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Sales Detail</h2>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Vendor</th>
                <th className="px-5 py-3 text-right">Kg Sold</th>
                <th className="px-5 py-3 text-right">Price / kg</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sal.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600">{fmtDate(s.date)}</td>
                  <td className="px-5 py-3 text-gray-700">{s.vendors?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{Number(s.kg_sold).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg</td>
                  <td className="px-5 py-3 text-right text-gray-700">{fmt(s.price_per_kg)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800">{fmt(s.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Procurement detail */}
      {proc.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Procurement / Input Costs</h2>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Item</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {proc.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-500">{fmtDate(p.date)}</td>
                  <td className="px-5 py-3 text-gray-700">{p.item_name}</td>
                  <td className="px-5 py-3 capitalize text-gray-500">{p.type}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{Number(p.quantity).toLocaleString('en-IN')} {p.unit}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800">{fmt(p.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Expenses detail */}
      {exp.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Expenses</h2>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Category</th>
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {exp.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-500">{fmtDate(e.date)}</td>
                  <td className="px-5 py-3 capitalize text-gray-600">{e.category}</td>
                  <td className="px-5 py-3 text-gray-700">{e.description || '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* No data notice */}
      {sal.length === 0 && proc.length === 0 && exp.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <span className="text-5xl mb-3">📊</span>
          <p className="text-sm font-medium">No data linked to this batch</p>
          <p className="text-xs mt-1">Link procurement, sales, and expenses to this batch to see a full P&L</p>
        </div>
      )}

    </div>
  )
}
