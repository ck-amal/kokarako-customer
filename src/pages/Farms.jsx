import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// ─── Modal (create & edit) ────────────────────────────────────────────────────

function FarmModal({ farm, onClose, onSaved }) {
  const isEdit = Boolean(farm)
  const [form, setForm] = useState({
    name:         farm?.name         ?? '',
    location:     farm?.location     ?? '',
    capacity:     farm?.capacity     ?? '',
    phone_number: farm?.phone_number ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = {
      name:         form.name.trim(),
      location:     form.location.trim() || null,
      capacity:     Number(form.capacity),
      phone_number: form.phone_number.trim() || null,
    }

    const { error } = isEdit
      ? await supabase.from('farms').update(payload).eq('id', farm.id)
      : await supabase.from('farms').insert(payload)

    if (error) { setError(error.message); setSaving(false) }
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{isEdit ? 'Edit Farm' : 'New Farm'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farm Name *</label>
            <input required value={form.name} onChange={set('name')} placeholder="e.g. Green Valley Farm"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input value={form.location} onChange={set('location')} placeholder="e.g. Coimbatore, Tamil Nadu"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (birds) *</label>
            <input required type="number" min="1" value={form.capacity} onChange={set('capacity')} placeholder="e.g. 5000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input value={form.phone_number} onChange={set('phone_number')} placeholder="e.g. 9876543210"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Farm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteModal({ farm, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState('')

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('farms').delete().eq('id', farm.id)
    if (error) { setError(error.message); setDeleting(false) }
    else onDeleted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Delete Farm</h2>
        <p className="text-sm text-gray-600 mb-1">
          Are you sure you want to delete <span className="font-semibold">{farm.name}</span>?
        </p>
        <p className="text-xs text-red-500 mb-5">This will fail if the farm has existing batches.</p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Farms() {
  const [farms,        setFarms]        = useState([])
  const [activeCounts, setActiveCounts] = useState({})
  const [loading,      setLoading]      = useState(true)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editingFarm,  setEditingFarm]  = useState(null)
  const [deletingFarm, setDeletingFarm] = useState(null)

  // Filters
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('all') // all | active | inactive
  const [locationFilter, setLocationFilter] = useState('all')

  async function fetchData() {
    setLoading(true)
    const [{ data: farmsData }, { data: batchData }] = await Promise.all([
      supabase.from('farms').select('*').order('name'),
      supabase.from('batches').select('farm_id').eq('status', 'active'),
    ])

    setFarms(farmsData || [])

    const counts = {}
    for (const b of (batchData || [])) {
      counts[b.farm_id] = (counts[b.farm_id] || 0) + 1
    }
    setActiveCounts(counts)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function handleSaved()  { setModalOpen(false); setEditingFarm(null); fetchData() }
  function handleDeleted() { setDeletingFarm(null); fetchData() }

  // Unique locations for dropdown
  const locations = ['all', ...Array.from(new Set(farms.map(f => f.location).filter(Boolean))).sort()]

  // Apply filters
  const filtered = farms.filter(farm => {
    const matchSearch   = farm.name.toLowerCase().includes(search.toLowerCase())
    const hasActive     = (activeCounts[farm.id] || 0) > 0
    const matchStatus   = statusFilter === 'all' ? true : statusFilter === 'active' ? hasActive : !hasActive
    const matchLocation = locationFilter === 'all' || farm.location === locationFilter
    return matchSearch && matchStatus && matchLocation
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Farms</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your farm locations</p>
        </div>
        <button
          onClick={() => { setEditingFarm(null); setModalOpen(true) }}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
        >
          <span className="text-base leading-none">+</span> New Farm
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search farms…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"
        />

        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {[['all', 'All'], ['active', 'Has Active Batch'], ['inactive', 'No Active Batch']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-2 font-medium transition ${statusFilter === val ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={locationFilter}
          onChange={e => setLocationFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">All Locations</option>
          {locations.filter(l => l !== 'all').map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🏡</span>
            <p className="text-sm font-medium">{farms.length === 0 ? 'No farms yet' : 'No farms match your filters'}</p>
            {farms.length === 0 && <p className="text-xs mt-1">Click "New Farm" to add your first one</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Farm Name</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3 text-right">Capacity</th>
                  <th className="px-5 py-3 text-center">Active Batches</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(farm => (
                  <tr key={farm.id} className="hover:bg-amber-50/40 transition">
                    <td className="px-5 py-4">
                      <Link
                        to={`/farms/${farm.id}`}
                        className="font-medium text-gray-800 hover:text-amber-600 hover:underline"
                      >
                        {farm.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-gray-500">{farm.location || '—'}</td>
                    <td className="px-5 py-4 text-gray-500">{farm.phone_number || '—'}</td>
                    <td className="px-5 py-4 text-right text-gray-700">
                      {Number(farm.capacity).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                        ${(activeCounts[farm.id] || 0) > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'}`}>
                        {activeCounts[farm.id] || 0}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-2">
                        <Link
                          to={`/farms/${farm.id}`}
                          className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => { setEditingFarm(farm); setModalOpen(true) }}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingFarm(farm)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition"
                        >
                          Delete
                        </button>
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
      {modalOpen && (
        <FarmModal
          farm={editingFarm}
          onClose={() => { setModalOpen(false); setEditingFarm(null) }}
          onSaved={handleSaved}
        />
      )}
      {deletingFarm && (
        <DeleteModal
          farm={deletingFarm}
          onClose={() => setDeletingFarm(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
