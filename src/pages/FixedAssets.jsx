import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const CATEGORIES = ['Vehicle', 'Equipment', 'Land', 'Building', 'Furniture', 'Other']

const CATEGORY_ICON = {
  Vehicle:   '🚗',
  Equipment: '🔧',
  Land:      '🌍',
  Building:  '🏢',
  Furniture: '🪑',
  Other:     '📦',
}

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function formatDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function AssetModal({ asset, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const isEdit = Boolean(asset)

  const [form, setForm] = useState({
    name:           asset?.name           ?? '',
    category:       asset?.category       ?? 'Vehicle',
    purchase_date:  asset?.purchase_date  ?? new Date().toISOString().slice(0, 10),
    purchase_value: asset?.purchase_value ?? '',
    description:    asset?.description    ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const value = parseFloat(form.purchase_value)
    if (!form.name.trim())   { setError('Name is required'); return }
    if (isNaN(value) || value < 0) { setError('Enter a valid purchase value'); return }

    setSaving(true)
    const now = new Date().toISOString()
    const userName = user?.user_metadata?.full_name || user?.email || ''

    const payload = {
      name:           form.name.trim(),
      category:       form.category,
      purchase_date:  form.purchase_date,
      purchase_value: value,
      description:    form.description.trim() || null,
    }

    let err
    if (isEdit) {
      const res = await supabase
        .from('fixed_assets')
        .update({ ...payload, updated_at: now, updated_by_id: user?.id, updated_by_name: userName })
        .eq('id', asset.id)
        .eq('organization_id', organization?.id)
      err = res.error
    } else {
      const res = await supabase
        .from('fixed_assets')
        .insert({
          ...payload,
          organization_id: organization?.id,
          created_by_id:   user?.id,
          created_by_name: userName,
        })
      err = res.error
    }

    if (err) { setError(err.message); setSaving(false) }
    else      { onSaved() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? 'Edit Asset' : 'Add Fixed Asset'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name *</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Delivery Van, Borewell Pump"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select
              value={form.category}
              onChange={set('category')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_ICON[c]} {c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date *</label>
            <input
              required
              type="date"
              value={form.purchase_date}
              onChange={set('purchase_date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Value (₹) *</label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.purchase_value}
              onChange={set('purchase_value')}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={2}
              placeholder="Optional notes (registration number, model, etc.)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
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
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ asset, onClose, onDeleted }) {
  const { organization } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase
      .from('fixed_assets')
      .delete()
      .eq('id', asset.id)
      .eq('organization_id', organization?.id)
    if (error) { setError(error.message); setDeleting(false) }
    else        { onDeleted() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Delete Asset</h2>
        <p className="text-sm text-gray-600 mb-5">
          Remove <span className="font-semibold">{asset.name}</span> from your assets? This cannot be undone.
        </p>
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
            onClick={handleDelete} disabled={deleting}
            className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FixedAssets() {
  const { organization, canEdit, canDelete } = useAuth()
  const [assets, setAssets]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null) // null | { mode: 'add'|'edit'|'delete', asset? }
  const [filter, setFilter]   = useState('All')

  async function fetchAssets() {
    setLoading(true)
    const { data } = await supabase
      .from('fixed_assets')
      .select('*')
      .eq('organization_id', organization?.id)
      .order('purchase_date', { ascending: false })
    setAssets(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAssets() }, [organization])

  function openAdd()         { setModal({ mode: 'add' }) }
  function openEdit(asset)   { setModal({ mode: 'edit', asset: { ...asset } }) }
  function openDelete(asset) { setModal({ mode: 'delete', asset }) }
  function closeModal()      { setModal(null) }
  function afterSave()       { closeModal(); fetchAssets() }

  const categories = ['All', ...CATEGORIES.filter(c => assets.some(a => a.category === c))]
  const filtered   = filter === 'All' ? assets : assets.filter(a => a.category === filter)
  const total      = filtered.reduce((s, a) => s + Number(a.purchase_value || 0), 0)
  const grandTotal = assets.reduce((s, a) => s + Number(a.purchase_value || 0), 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Fixed Assets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Vehicles, equipment, land, and other business assets</p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
          >
            <span className="text-base leading-none">+</span> Add Asset
          </button>
        )}
      </div>

      {/* Summary card */}
      {!loading && assets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Total Assets</p>
            <p className="text-xl font-bold text-amber-700 mt-0.5">{formatCurrency(grandTotal)}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Count</p>
            <p className="text-xl font-bold text-gray-700 mt-0.5">{assets.length} items</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 col-span-2 sm:col-span-1">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Categories</p>
            <p className="text-xl font-bold text-gray-700 mt-0.5">
              {CATEGORIES.filter(c => assets.some(a => a.category === c)).length} types
            </p>
          </div>
        </div>
      )}

      {/* Category filter */}
      {!loading && assets.length > 0 && categories.length > 2 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition
                ${filter === c
                  ? 'bg-amber-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-amber-300'}`}
            >
              {c !== 'All' && CATEGORY_ICON[c]} {c}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🏗️</span>
            <p className="text-sm font-medium">No fixed assets yet</p>
            <p className="text-xs mt-1">Add vehicles, equipment, land and more</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Asset</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Purchase Date</th>
                    <th className="px-5 py-3 text-right">Value</th>
                    {(canEdit || canDelete) && <th className="px-5 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(a => (
                    <tr key={a.id} className="hover:bg-amber-50/40 transition">
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800">{a.name}</p>
                        {a.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{a.description}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                          {CATEGORY_ICON[a.category] || '📦'} {a.category}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{formatDate(a.purchase_date)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-gray-800">{formatCurrency(a.purchase_value)}</td>
                      {(canEdit || canDelete) && (
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {canEdit && (
                              <button
                                onClick={() => openEdit(a)}
                                className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition"
                              >
                                Edit
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => openDelete(a)}
                                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition"
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
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {filtered.length} {filtered.length === 1 ? 'asset' : 'assets'}{filter !== 'All' && ` · ${filter}`}
              </span>
              <span className="text-sm font-bold text-gray-700">{formatCurrency(total)}</span>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {modal?.mode === 'add'    && <AssetModal onClose={closeModal} onSaved={afterSave} />}
      {modal?.mode === 'edit'   && <AssetModal asset={modal.asset} onClose={closeModal} onSaved={afterSave} />}
      {modal?.mode === 'delete' && <DeleteModal asset={modal.asset} onClose={closeModal} onDeleted={afterSave} />}
    </div>
  )
}
