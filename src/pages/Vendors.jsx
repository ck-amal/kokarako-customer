import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

// ─── Vendor Modal (Add / Edit) ────────────────────────────────────────────────

function VendorModal({ vendor, onClose, onSaved }) {
  const { t } = useTranslation()
  const { organization } = useAuth()
  const isEdit = Boolean(vendor)

  const currentOutstanding = isEdit
    ? Number(vendor.outstanding != null
        ? vendor.outstanding
        : (Number(vendor.opening_balance || 0) + Number(vendor.total_sales || 0) - Number(vendor.total_collected || 0)))
    : 0

  const [form, setForm]       = useState({
    name:    vendor?.name    ?? '',
    phone:   vendor?.phone   ?? '',
    balance: isEdit ? String(currentOutstanding) : '0',
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [confirm, setConfirm] = useState(false)

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function doSave() {
    setSaving(true)
    const enteredBalance = parseFloat(form.balance) || 0
    const totalSales     = Number(vendor?.total_sales     || 0)
    const totalCollected = Number(vendor?.total_collected || 0)
    const openingBal     = isEdit
      ? enteredBalance - totalSales + totalCollected
      : enteredBalance

    const payload = {
      name:            form.name.trim(),
      phone:           form.phone.trim() || null,
      opening_balance: openingBal,
    }

    const { error } = isEdit
      ? await supabase.from('vendors').update(payload).eq('id', vendor.id).eq('organization_id', organization?.id)
      : await supabase.from('vendors').insert({ ...payload, organization_id: organization?.id })

    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (isEdit && parseFloat(form.balance) !== currentOutstanding) {
      setConfirm(true)
      return
    }
    doSave()
  }

  if (confirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Confirm Balance Change</h2>
          <p className="text-sm text-gray-600 mb-5">
            You're changing the balance from{' '}
            <span className="font-semibold">₹{currentOutstanding.toLocaleString('en-IN')}</span> to{' '}
            <span className="font-semibold">₹{(parseFloat(form.balance) || 0).toLocaleString('en-IN')}</span>.
            This will adjust the opening balance accordingly. Continue?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirm(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
            <button onClick={doSave} disabled={saving} className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Yes, update'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? t('vendors.editVendor') : t('vendors.addVendor')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')} *</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.phone')}</label>
            <input
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="e.g. 9876543210"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Balance with Vendor (₹)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.balance}
              onChange={set('balance')}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              {isEdit
                ? 'Amount the vendor currently owes you. Negative = you owe them.'
                : 'Opening balance — amount owed before any recorded sales. Negative = you owe them.'}
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? `${t('common.save')}…` : isEdit ? t('common.save') : t('vendors.addVendor')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteModal({ vendor, onClose, onDeleted }) {
  const { t } = useTranslation()
  const { organization } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('vendors').delete().eq('id', vendor.id).eq('organization_id', organization?.id)
    if (error) { setError(error.message); setDeleting(false) }
    else        { onDeleted() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{t('common.delete')} {t('vendors.title')}</h2>
        <p className="text-sm text-gray-600 mb-5">
          {t('common.delete')} <span className="font-semibold">{vendor.name}</span>? This will fail if they have existing sales.
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleDelete} disabled={deleting}
            className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
          >
            {deleting ? `${t('common.delete')}…` : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Vendors() {
  const { t } = useTranslation()
  const { organization, canEdit, canDelete } = useAuth()
  const { currentStep, stepDone } = useOnboarding()
  const [vendors, setVendors]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null) // null | { mode: 'add'|'edit'|'delete', vendor? }

  async function fetchVendors() {
    setLoading(true)
    const [{ data }, { data: rawVendors }] = await Promise.all([
      supabase
        .from('vendor_balances')
        .select('vendor_id, vendor_name, opening_balance, total_sales, total_collected, outstanding_balance')
        .eq('organization_id', organization?.id)
        .order('vendor_name'),
      supabase
        .from('vendors')
        .select('id, phone')
        .eq('organization_id', organization?.id),
    ])

    const phoneMap = {}
    rawVendors?.forEach(v => { phoneMap[v.id] = v.phone })

    setVendors(
      (data || []).map(v => ({
        id:              v.vendor_id,
        name:            v.vendor_name,
        phone:           phoneMap[v.vendor_id] ?? '',
        opening_balance: Number(v.opening_balance || 0),
        total_sales:     Number(v.total_sales || 0),
        total_collected: Number(v.total_collected || 0),
        outstanding:     Number(v.outstanding_balance || 0),
      }))
    )
    setLoading(false)
  }

  useEffect(() => { fetchVendors() }, [])

  function openAdd()          { setModal({ mode: 'add' }) }
  function openEdit(vendor)   { setModal({ mode: 'edit', vendor: { ...vendor } }) }
  function openDelete(vendor) { setModal({ mode: 'delete', vendor }) }
  function closeModal()       { setModal(null) }
  function afterSave()        { closeModal(); fetchVendors(); if (currentStep?.id === 'vendors') stepDone('vendors') }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('vendors.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your buyers</p>
        </div>
        {canEdit && (
          <button
            data-tour="vendors"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
          >
            <span className="text-base leading-none">+</span> {t('vendors.addVendor')}
          </button>
        )}
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
            <p className="text-sm font-medium">{t('vendors.noVendors')}</p>
            <p className="text-xs mt-1">{t('vendors.addVendor')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">{t('common.name')}</th>
                <th className="px-5 py-3">{t('common.phone')}</th>
                <th className="px-5 py-3 text-right">{t('vendors.totalSales')}</th>
                <th className="px-5 py-3 text-right">Outstanding</th>
                <th className="px-5 py-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vendors.map(v => {
                const isCredit = v.outstanding < 0
                return (
                <tr key={v.id} className="hover:bg-amber-50/40 transition">
                  <td className="px-5 py-4 font-medium text-gray-800">{v.name}</td>
                  <td className="px-5 py-4 text-gray-600">{v.phone || <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-4 text-right font-semibold text-gray-700">
                    {formatCurrency(v.total_sales)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {isCredit ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                        Credit {formatCurrency(Math.abs(v.outstanding))}
                      </span>
                    ) : (
                      <span className={`font-semibold ${v.outstanding > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {formatCurrency(v.outstanding)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <button
                          onClick={() => openEdit(v)}
                          className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition"
                        >
                          {t('common.edit')}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => openDelete(v)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition"
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
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
