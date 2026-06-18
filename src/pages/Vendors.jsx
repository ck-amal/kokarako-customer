import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

// ─── Vendor Modal (Add / Edit) ────────────────────────────────────────────────

function VendorModal({ vendor, onClose, onSaved }) {
  const isEdit = Boolean(vendor)
  const [form, setForm]   = useState({ name: vendor?.name ?? '', phone: vendor?.phone ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = { name: form.name.trim(), phone: form.phone.trim() || null }

    const { error } = isEdit
      ? await supabase.from('vendors').update(payload).eq('id', vendor.id)
      : await supabase.from('vendors').insert(payload)

    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? 'Edit Vendor' : 'Add Vendor'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Raju Traders"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="e.g. 9876543210"
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
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteModal({ vendor, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('vendors').delete().eq('id', vendor.id)
    if (error) { setError(error.message); setDeleting(false) }
    else        { onDeleted() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Delete Vendor</h2>
        <p className="text-sm text-gray-600 mb-5">
          Delete <span className="font-semibold">{vendor.name}</span>? This will fail if they have existing sales.
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Vendors() {
  const [vendors, setVendors]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null) // null | { mode: 'add'|'edit'|'delete', vendor? }

  async function fetchVendors() {
    setLoading(true)
    // Use the vendor_balances view to get total_sales per vendor
    const { data } = await supabase
      .from('vendor_balances')
      .select('vendor_id, vendor_name, total_sales')
      .order('vendor_name')

    // Also fetch phone from vendors table
    const { data: rawVendors } = await supabase
      .from('vendors')
      .select('id, name, phone')
      .order('name')

    // Merge phone into balances
    const phoneMap = {}
    rawVendors?.forEach(v => { phoneMap[v.id] = v.phone })

    setVendors(
      (data || []).map(v => ({
        id:             v.vendor_id,
        name:           v.vendor_name,
        phone:          phoneMap[v.vendor_id] ?? '',
        total_purchases: v.total_sales,
      }))
    )
    setLoading(false)
  }

  useEffect(() => { fetchVendors() }, [])

  function openAdd()          { setModal({ mode: 'add' }) }
  function openEdit(vendor)   { setModal({ mode: 'edit', vendor }) }
  function openDelete(vendor) { setModal({ mode: 'delete', vendor }) }
  function closeModal()       { setModal(null) }
  function afterSave()        { closeModal(); fetchVendors() }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vendors</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your buyers</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
        >
          <span className="text-base leading-none">+</span> Add Vendor
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🤝</span>
            <p className="text-sm font-medium">No vendors yet</p>
            <p className="text-xs mt-1">Click "Add Vendor" to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3 text-right">Total Purchases</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vendors.map(v => (
                <tr key={v.id} className="hover:bg-amber-50/40 transition">
                  <td className="px-5 py-4 font-medium text-gray-800">{v.name}</td>
                  <td className="px-5 py-4 text-gray-600">{v.phone || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-4 text-right font-semibold text-gray-700">
                    {formatCurrency(v.total_purchases)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(v)}
                        className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openDelete(v)}
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
      {modal?.mode === 'add' && (
        <VendorModal onClose={closeModal} onSaved={afterSave} />
      )}
      {modal?.mode === 'edit' && (
        <VendorModal vendor={modal.vendor} onClose={closeModal} onSaved={afterSave} />
      )}
      {modal?.mode === 'delete' && (
        <DeleteModal vendor={modal.vendor} onClose={closeModal} onDeleted={afterSave} />
      )}
    </div>
  )
}
