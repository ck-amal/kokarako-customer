import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fcrRatingInfo(fcr) {
  if (fcr == null) return { label: '—', color: '#9ca3af', bg: '#f3f4f6' }
  if (fcr <= 1.8)  return { label: 'Excellent', color: '#15803d', bg: '#f0fdf4' }
  if (fcr <= 2.1)  return { label: 'Good',      color: '#2563eb', bg: '#eff6ff' }
  if (fcr <= 2.5)  return { label: 'Average',   color: '#d97706', bg: '#fffbeb' }
  return               { label: 'Poor',      color: '#dc2626', bg: '#fef2f2' }
}

// ─── FCR Bar Chart ────────────────────────────────────────────────────────────

function FCRBar({ fcr, max }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t) }, [])
  const pct = max > 0 ? (fcr / max) * 100 : 0
  const { color } = fcrRatingInfo(fcr)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#f3f4f6' }}>
        <div
          className="h-3 rounded-full transition-all duration-700"
          style={{ width: ready ? `${pct}%` : '0%', backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold w-10 text-right" style={{ color }}>{fcr?.toFixed(2) ?? '—'}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FCRReport() {
  const { organization } = useAuth()
  const [batches,  setBatches]  = useState([])
  const [farms,    setFarms]    = useState([])
  const [loading,  setLoading]  = useState(true)

  // Filters
  const [farmFilter,   setFarmFilter]   = useState('all')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [sortBy,       setSortBy]       = useState('fcr_asc')

  useEffect(() => {
    async function load() {
      const [{ data: bData }, { data: fData }] = await Promise.all([
        supabase
          .from('batches')
          .select('id, farm_id, start_date, sold_at, chick_count, status, fcr, fcr_rating, total_feed_kg, total_sale_kg, farms(name)')
          .eq('organization_id', organization?.id)
          .not('fcr', 'is', null)
          .in('status', ['sold', 'closed'])
          .order('sold_at', { ascending: false }),
        supabase.from('farms').select('id, name').eq('organization_id', organization?.id).order('name'),
      ])
      setBatches(bData || [])
      setFarms(fData || [])
      setLoading(false)
    }
    load()
  }, [organization])

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = batches
    .filter(b => farmFilter === 'all' || b.farm_id === farmFilter)
    .filter(b => ratingFilter === 'all' || b.fcr_rating === ratingFilter)
    .sort((a, b) => {
      if (sortBy === 'fcr_asc')  return Number(a.fcr) - Number(b.fcr)
      if (sortBy === 'fcr_desc') return Number(b.fcr) - Number(a.fcr)
      if (sortBy === 'date_desc') return new Date(b.sold_at || b.start_date) - new Date(a.sold_at || a.start_date)
      if (sortBy === 'date_asc')  return new Date(a.sold_at || a.start_date) - new Date(b.sold_at || b.start_date)
      return 0
    })

  // ── Summary cards ─────────────────────────────────────────────────────────

  const withFCR   = filtered.filter(b => b.fcr != null)
  const avgFCR    = withFCR.length > 0 ? withFCR.reduce((s, b) => s + Number(b.fcr), 0) / withFCR.length : null
  const bestFCR   = withFCR.length > 0 ? Math.min(...withFCR.map(b => Number(b.fcr))) : null
  const worstFCR  = withFCR.length > 0 ? Math.max(...withFCR.map(b => Number(b.fcr))) : null

  const ratingCounts = { Excellent: 0, Good: 0, Average: 0, Poor: 0 }
  withFCR.forEach(b => { if (b.fcr_rating) ratingCounts[b.fcr_rating] = (ratingCounts[b.fcr_rating] || 0) + 1 })

  const barMax = worstFCR ? Math.min(Math.ceil(worstFCR * 1.1), 4) : 3

  // ── Auto insight ─────────────────────────────────────────────────────────

  function autoInsight() {
    if (withFCR.length === 0) return null
    const avg = avgFCR?.toFixed(2)
    const { label } = fcrRatingInfo(avgFCR)
    const best = withFCR.reduce((a, b) => Number(b.fcr) < Number(a.fcr) ? b : a)
    const farmName = best.farms?.name ?? 'Unknown Farm'
    return `Average FCR across ${withFCR.length} batch${withFCR.length > 1 ? 'es' : ''} is ${avg} (${label}). Best performing batch started ${fmtDate(best.start_date)} at ${farmName} with FCR ${Number(best.fcr).toFixed(2)}.`
  }

  const insight = autoInsight()

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">FCR Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">Feed Conversion Ratio across all closed batches — lower is better</p>
      </div>

      {batches.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 shadow-sm bg-white flex flex-col items-center justify-center py-24 text-gray-400">
          <p className="text-4xl mb-3">🌾</p>
          <p className="font-medium text-gray-600">No FCR data yet</p>
          <p className="text-sm mt-1 text-gray-400">FCR is calculated when you mark a batch as Sold.</p>
        </div>
      ) : (
        <>
          {/* ── Summary cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Batches',     value: withFCR.length,              bg: '#f8fafc',  color: '#1c1917' },
              { label: 'Average FCR', value: avgFCR?.toFixed(2) ?? '—',   ...fcrRatingInfo(avgFCR) },
              { label: 'Best FCR',    value: bestFCR?.toFixed(2) ?? '—',  ...fcrRatingInfo(bestFCR) },
              { label: 'Worst FCR',   value: worstFCR?.toFixed(2) ?? '—', ...fcrRatingInfo(worstFCR) },
            ].map(card => (
              <div key={card.label}
                className="rounded-xl border border-gray-100 p-4 text-center"
                style={{ backgroundColor: card.bg }}>
                <p className="text-2xl font-extrabold" style={{ color: card.color }}>{card.value}</p>
                <p className="text-xs mt-1.5 font-medium text-gray-500">{card.label}</p>
              </div>
            ))}
          </div>

          {/* ── Rating breakdown ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Rating Breakdown</p>
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: 'Excellent', color: '#15803d', bg: '#f0fdf4', hint: '≤ 1.8' },
                { label: 'Good',      color: '#2563eb', bg: '#eff6ff', hint: '1.9–2.1' },
                { label: 'Average',   color: '#d97706', bg: '#fffbeb', hint: '2.2–2.5' },
                { label: 'Poor',      color: '#dc2626', bg: '#fef2f2', hint: '> 2.5' },
              ].map(r => (
                <div key={r.label} className="rounded-lg p-3" style={{ backgroundColor: r.bg }}>
                  <p className="text-xl font-extrabold" style={{ color: r.color }}>{ratingCounts[r.label] || 0}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: r.color }}>{r.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Auto insight ──────────────────────────────────────────── */}
          {insight && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-start gap-3">
              <span className="text-lg">💡</span>
              <p className="text-sm text-blue-800">{insight}</p>
            </div>
          )}

          {/* ── Filters ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            <select value={farmFilter} onChange={e => setFarmFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="all">All Farms</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="all">All Ratings</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Average">Average</option>
              <option value="Poor">Poor</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="fcr_asc">FCR: Best first</option>
              <option value="fcr_desc">FCR: Worst first</option>
              <option value="date_desc">Date: Newest first</option>
              <option value="date_asc">Date: Oldest first</option>
            </select>
            <span className="ml-auto text-sm text-gray-400 self-center">{filtered.length} batch{filtered.length !== 1 ? 'es' : ''}</span>
          </div>

          {/* ── Comparison table ──────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex items-center justify-center py-16">
              <p className="text-sm text-gray-400">No batches match the selected filters.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                      style={{ backgroundColor: '#fafaf5', borderBottom: '1px solid #e7e5e0' }}>
                      <th className="px-5 py-3">Farm</th>
                      <th className="px-5 py-3">Batch Start</th>
                      <th className="px-5 py-3">Sold On</th>
                      <th className="px-5 py-3 text-right">Feed (kg)</th>
                      <th className="px-5 py-3 text-right">Sale (kg)</th>
                      <th className="px-5 py-3">FCR</th>
                      <th className="px-5 py-3">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b, i) => {
                      const { label, color, bg } = fcrRatingInfo(b.fcr)
                      return (
                        <tr key={b.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f5f5f4' : 'none' }}>
                          <td className="px-5 py-3 font-medium text-gray-800">{b.farms?.name ?? '—'}</td>
                          <td className="px-5 py-3 text-gray-600">{fmtDate(b.start_date)}</td>
                          <td className="px-5 py-3 text-gray-600">{fmtDate(b.sold_at)}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{Number(b.total_feed_kg || 0).toLocaleString('en-IN')}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{Number(b.total_sale_kg || 0).toLocaleString('en-IN')}</td>
                          <td className="px-5 py-3" style={{ minWidth: 140 }}>
                            <FCRBar fcr={Number(b.fcr)} max={barMax} />
                          </td>
                          <td className="px-5 py-3">
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: bg, color }}>{label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
