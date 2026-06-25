import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export default function OrgSettings() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { organization, canManageUsers, refreshOrg, signOut } = useAuth()

  const [form, setForm] = useState({
    name:          '',
    business_name: '',
    phone:         '',
    address:       '',
  })
  const [saving,        setSaving]        = useState(false)
  const [saveSuccess,   setSaveSuccess]   = useState(false)
  const [error,         setError]         = useState('')
  // Danger zone
  const [confirmName,   setConfirmName]   = useState('')
  const [deactivating,  setDeactivating]  = useState(false)
  const [dangerError,   setDangerError]   = useState('')

  useEffect(() => {
    if (!canManageUsers) navigate('/dashboard')
  }, [canManageUsers])

  useEffect(() => {
    if (organization) {
      setForm({
        name:          organization.name          || '',
        business_name: organization.business_name || '',
        phone:         organization.phone         || '',
        address:       organization.address       || '',
      })
    }
  }, [organization])

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError(t('org.orgNameRequired')); return }
    setSaving(true); setError(''); setSaveSuccess(false)

    const { error: err } = await supabase
      .from('organizations')
      .update({
        name:          form.name.trim(),
        business_name: form.business_name.trim() || null,
        phone:         form.phone.trim()         || null,
        address:       form.address.trim()       || null,
      })
      .eq('id', organization.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    setSaveSuccess(true)
    await refreshOrg()
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  async function handleDeactivate() {
    if (confirmName !== organization.name) {
      setDangerError(t('org.orgNameMismatch')); return
    }
    setDeactivating(true); setDangerError('')

    const { error: err } = await supabase
      .from('organizations')
      .update({ is_active: false })
      .eq('id', organization.id)

    if (err) { setDangerError(err.message); setDeactivating(false); return }
    await signOut()
    navigate('/login')
  }

  if (!organization) return null

  return (
    <div className="space-y-6 max-w-2xl">

      <div>
        <h1 className="text-2xl font-bold text-gray-800">{t('org.orgSettings')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('org.manageBusinessDetails')}</p>
      </div>

      {/* Business Details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{t('org.businessDetails')}</h2>
        <form onSubmit={handleSave} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.organisationName')} *</label>
            <input required type="text" value={form.name} onChange={set('name')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.businessName')}</label>
            <input type="text" value={form.business_name} onChange={set('business_name')}
              placeholder={t('org.tradingName')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.phone')}</label>
            <input type="tel" value={form.phone} onChange={set('phone')}
              placeholder="+91 98765 43210"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.address')}</label>
            <textarea value={form.address} onChange={set('address')} rows={2}
              placeholder={t('org.farmAddress')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {saveSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {t('org.savedSuccessfully')}</p>}

          <button type="submit" disabled={saving}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white transition">
            {saving ? t('org.saving') : t('org.saveChanges')}
          </button>
        </form>
      </div>

      {/* Subscription */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{t('org.subscription')}</h2>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full text-sm font-semibold">
            {(organization.subscription_plan || 'free').charAt(0).toUpperCase() + (organization.subscription_plan || 'free').slice(1)} {t('org.plan_label')}
          </span>
          <span className="text-sm text-gray-400">{t('org.billingComingSoon')}</span>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6">
        <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wider mb-4">{t('org.dangerZone')}</h2>
        <div className="space-y-3">
          <p className="text-sm text-gray-700 font-medium">{t('org.deactivateOrg')}</p>
          <p className="text-sm text-gray-500">
            {t('org.deactivateWarning')}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('org.typeToConfirm', { name: organization.name })}
            </label>
            <input type="text" value={confirmName} onChange={e => setConfirmName(e.target.value)}
              placeholder={t('org.orgNamePlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          {dangerError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{dangerError}</p>}
          <button
            onClick={handleDeactivate}
            disabled={deactivating || confirmName !== organization.name}
            className="rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 px-5 py-2 text-sm font-semibold text-white transition"
          >
            {deactivating ? t('org.deactivating') : t('org.deactivateButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
