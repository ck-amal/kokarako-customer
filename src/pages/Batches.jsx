import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const GROW_OUT_DAYS = 45

function daysRemaining(startDate) {
  const start    = new Date(startDate)
  const today    = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  const elapsed  = Math.floor((today - start) / (1000 * 60 * 60 * 24))
  return GROW_OUT_DAYS - elapsed
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    active: 'bg-green-100 text-green-700',
    sold:   'bg-gray-100  text-gray-500',
    closed: 'bg-red-100   text-red-500',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${styles[status] ?? styles.closed}`}>
      {status}
    </span>
  )
}

// ─── Days remaining cell ──────────────────────────────────────────────────────

function DaysCell({ status, startDate }) {
  if (status !== 'active') return <span className="text-gray-400">—</span>

  const days = daysRemaining(startDate)

  if (days < 0) {
    return <span className="text-red-500 font-semibold">{Math.abs(days)}d overdue</span>
  }
  if (days <= 5) {
    return <span className="text-orange-500 font-semibold">{days}d left</span>
  }
  return <span className="text-gray-700">{days}d left</span>
}

// ─── New batch modal ──────────────────────────────────────────────────────────

function NewBatchModal({ farms, onClose, onSaved }) {
  const [form, setForm] = useState({
    farm_id:     farms[0]?.id ?? '',
    chick_count: '',
    start_date:  new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const { error } = await supabase.from('batches').insert({
      farm_id:     form.farm_id,
      chick_count: Number(form.chick_count),
      start_date:  form.start_date,
      status:      'active',
    })

    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Start New Batch</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farm *</label>
            <select
              required
              value={form.farm_id}
              onChange={set('farm_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chick Count *</label>
            <input
              required
              type="number"
              min="1"
              value={form.chick_count}
              onChange={set('chick_count')}
              placeholder="e.g. 3000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
            <input
              required
              type="date"
              value={form.start_date}
              onChange={set('start_date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? 'Saving…' : 'Start Batch'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ─── Mark as sold confirmation ────────────────────────────────────────────────

function SoldModal({ batch, onClose, onSaved }) {
  const [mortality, setMortality] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  async function handleConfirm() {
    setSaving(true)
    const { error } = await supabase
      .from('batches')
      .update({
        status:          'sold',
        mortality_count: mortality !== '' ? Number(mortality) : 0,
      })
      .eq('id', batch.id)

    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Mark as Sold</h2>
        <p className="text-sm text-gray-600 mb-4">
          Mark the batch at <span className="font-semibold">{batch.farms?.name}</span> (started{' '}
          {formatDate(batch.start_date)}) as sold.
        </p>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mortality Count <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="number" min="0" max={batch.chick_count}
            value={mortality} onChange={e => setMortality(e.target.value)}
            placeholder="0 birds lost"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {mortality !== '' && Number(mortality) > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Survival rate: {(((batch.chick_count - Number(mortality)) / batch.chick_count) * 100).toFixed(1)}%
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm} disabled={saving}
            className="flex-1 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
          >
            {saving ? 'Updating…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Batches() {
  const [batches, setBatches]       = useState([])
  const [farms, setFarms]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [newModal, setNewModal]     = useState(false)
  const [soldBatch, setSoldBatch]   = useState(null)
  const [filter, setFilter]         = useState('all') // 'all' | 'active' | 'sold'

  async function fetchData() {
    setLoading(true)
    const [{ data: batchData }, { data: farmData }] = await Promise.all([
      supabase
        .from('batches')
        .select('*, farms(name)')
        .order('start_date', { ascending: false }),
      supabase.from('farms').select('id, name').order('name'),
    ])
    setBatches(batchData || [])
    setFarms(farmData || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const visible = filter === 'all'
    ? batches
    : batches.filter(b => b.status === filter)

  const activeCount = batches.filter(b => b.status === 'active').length
  const soldCount   = batches.filter(b => b.status === 'sold').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Batches</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all your grow-out cycles</p>
        </div>
        <button
          onClick={() => setNewModal(true)}
          disabled={farms.length === 0}
          title={farms.length === 0 ? 'Add a farm first' : ''}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
        >
          <span className="text-base leading-none">+</span> New Batch
        </button>
      </div>

      {/* Stat pills + filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { key: 'all',    label: `All (${batches.length})` },
          { key: 'active', label: `Active (${activeCount})` },
          { key: 'sold',   label: `Sold (${soldCount})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border ${
              filter === key
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🐣</span>
            <p className="text-sm font-medium">No batches found</p>
            <p className="text-xs mt-1">
              {filter !== 'all' ? 'Try switching the filter above' : 'Click "New Batch" to start one'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">Farm</th>
                <th className="px-5 py-3">Start Date</th>
                <th className="px-5 py-3 text-right">Chick Count</th>
                <th className="px-5 py-3 text-center">Days Remaining</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.map(batch => (
                <tr key={batch.id} className="hover:bg-amber-50/40 transition">
                  <td className="px-5 py-4 font-medium text-gray-800">
                    {batch.farms?.name ?? '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-600">
                    {formatDate(batch.start_date)}
                  </td>
                  <td className="px-5 py-4 text-right text-gray-700">
                    {batch.chick_count.toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <DaysCell status={batch.status} startDate={batch.start_date} />
                  </td>
                  <td className="px-5 py-4 text-center">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex gap-2">
                      {batch.status === 'active' ? (
                        <button
                          onClick={() => setSoldBatch(batch)}
                          className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 transition"
                        >
                          Mark as Sold
                        </button>
                      ) : (
                        <Link
                          to={`/batches/${batch.id}/report`}
                          className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition"
                        >
                          View Report
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {newModal && (
        <NewBatchModal
          farms={farms}
          onClose={() => setNewModal(false)}
          onSaved={() => { setNewModal(false); fetchData() }}
        />
      )}
      {soldBatch && (
        <SoldModal
          batch={soldBatch}
          onClose={() => setSoldBatch(null)}
          onSaved={() => { setSoldBatch(null); fetchData() }}
        />
      )}
    </div>
  )
}
