import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Visits() {
  const { organization } = useAuth()
  const navigate = useNavigate()

  const [visits,  setVisits]  = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [userFilter,   setUserFilter]   = useState('All')
  const [farmFilter,   setFarmFilter]   = useState('All')

  useEffect(() => {
    if (!organization?.id) return
    async function fetch() {
      setLoading(true)
      const { data } = await supabase
        .from('farm_visits')
        .select(`
          id,
          visit_date,
          visited_by_name,
          notes,
          farm_id,
          farms(id, name),
          farm_visit_mortality(batch_id, mortality_count)
        `)
        .eq('organization_id', organization.id)
        .order('visit_date', { ascending: false })
      setVisits(data || [])
      setLoading(false)
    }
    fetch()
  }, [organization])

  // Unique visitors and farms for filter dropdowns
  const visitors = useMemo(() => {
    const names = [...new Set(visits.map(v => v.visited_by_name).filter(Boolean))]
    return names.sort()
  }, [visits])

  const farms = useMemo(() => {
    const seen = {}
    visits.forEach(v => {
      if (v.farms?.id) seen[v.farms.id] = v.farms.name
    })
    return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1]))
  }, [visits])

  const filtered = useMemo(() => {
    return visits.filter(v => {
      if (userFilter !== 'All' && v.visited_by_name !== userFilter) return false
      if (farmFilter !== 'All' && v.farm_id !== farmFilter) return false
      if (dateFrom && v.visit_date < dateFrom) return false
      if (dateTo   && v.visit_date > dateTo)   return false
      return true
    })
  }, [visits, userFilter, farmFilter, dateFrom, dateTo])

  const totalMortInView = filtered.reduce((s, v) =>
    s + (v.farm_visit_mortality || []).reduce((ss, m) => ss + Number(m.mortality_count || 0), 0), 0)

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setUserFilter('All'); setFarmFilter('All')
  }

  const hasFilter = dateFrom || dateTo || userFilter !== 'All' || farmFilter !== 'All'

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Farm Visits</h1>
        <p className="text-sm text-gray-500 mt-0.5">All visit records across farms — filter by date or visitor</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Date from */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Visitor */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Visited By</label>
            <select
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="All">All Users</option>
              {visitors.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Farm */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Farm</label>
            <select
              value={farmFilter}
              onChange={e => setFarmFilter(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="All">All Farms</option>
              {farms.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {hasFilter && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition"
            >
              Clear
            </button>
          )}

          {/* Summary chip */}
          {!loading && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {filtered.length} visit{filtered.length !== 1 ? 's' : ''}
              </span>
              {totalMortInView > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-100 px-3 py-1 text-xs font-semibold text-red-600">
                  {totalMortInView} total deaths
                </span>
              )}
            </div>
          )}
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
            <span className="text-5xl mb-3">🚜</span>
            <p className="text-sm font-medium">{hasFilter ? 'No visits match the filters' : 'No visits recorded yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Farm</th>
                  <th className="px-5 py-3">Visited By</th>
                  <th className="px-5 py-3 text-right">Mortality</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(v => {
                  const mort = (v.farm_visit_mortality || []).reduce((s, m) => s + Number(m.mortality_count || 0), 0)
                  const batchCount = (v.farm_visit_mortality || []).length
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-amber-50/40 transition cursor-pointer"
                      onClick={() => navigate(`/farms/${v.farm_id}?tab=visits`)}
                    >
                      <td className="px-5 py-4 font-medium text-gray-800 whitespace-nowrap">
                        {formatDate(v.visit_date)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-medium text-amber-700">{v.farms?.name ?? '—'}</span>
                      </td>
                      <td className="px-5 py-4 text-gray-700">
                        {v.visited_by_name || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {mort > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                            {mort} dead
                          </span>
                        ) : batchCount > 0 ? (
                          <span className="text-xs text-green-600 font-medium">None</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-500 max-w-xs">
                        {v.notes
                          ? <span className="truncate block max-w-[240px]">{v.notes}</span>
                          : <span className="text-gray-300">—</span>}
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
  )
}
