import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'

const ROLE_META = {
  owner:           { label: 'Owner',           color: 'bg-gray-800 text-white' },
  manager:         { label: 'Manager',         color: 'bg-blue-100 text-blue-700' },
  farm_supervisor: { label: 'Farm Supervisor', color: 'bg-green-100 text-green-700' },
  accountant:      { label: 'Accountant',      color: 'bg-amber-100 text-amber-700' },
  viewer:          { label: 'Viewer',          color: 'bg-gray-100 text-gray-600' },
}

export default function Profile() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, organization, userRole, signOut } = useAuth()

  const [fullName,     setFullName]     = useState('')
  const [joinedAt,     setJoinedAt]     = useState('')
  const [savingName,   setSavingName]   = useState(false)
  const [nameSuccess,  setNameSuccess]  = useState(false)
  const [nameError,    setNameError]    = useState('')

  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [savingPw,   setSavingPw]   = useState(false)
  const [pwSuccess,  setPwSuccess]  = useState(false)
  const [pwError,    setPwError]    = useState('')

  useEffect(() => {
    if (user) {
      setFullName(user.user_metadata?.full_name || '')
    }
    if (user && organization) {
      supabase
        .from('organization_users')
        .select('joined_at')
        .eq('user_id', user.id)
        .eq('organization_id', organization.id)
        .single()
        .then(({ data }) => {
          if (data) setJoinedAt(data.joined_at)
        })
    }
  }, [user, organization])

  async function handleSaveName(e) {
    e.preventDefault()
    if (!fullName.trim()) { setNameError(t('errors.required')); return }
    setSavingName(true); setNameError(''); setNameSuccess(false)
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } })
    setSavingName(false)
    if (error) { setNameError(error.message); return }
    setNameSuccess(true)
    setTimeout(() => setNameSuccess(false), 3000)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPw.length < 8) { setPwError(t('errors.minPassword')); return }
    setSavingPw(true); setPwError(''); setPwSuccess(false)

    // Re-authenticate by signing in with current password first
    const { error: reAuthErr } = await supabase.auth.signInWithPassword({
      email: user.email, password: currentPw,
    })
    if (reAuthErr) { setPwError('Current password is incorrect'); setSavingPw(false); return }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (error) { setPwError(error.message); return }
    setPwSuccess(true)
    setCurrentPw(''); setNewPw('')
    setTimeout(() => setPwSuccess(false), 3000)
  }

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const roleInfo = ROLE_META[userRole] || { label: userRole, color: 'bg-gray-100 text-gray-600' }

  return (
    <div className="space-y-6 max-w-xl">

      <div>
        <h1 className="text-2xl font-bold text-gray-800">{t('profile.yourProfile')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('profile.manageAccount')}</p>
      </div>

      {/* Profile info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{t('profile.personalDetails')}</h2>
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('profile.fullName')} *</label>
            <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.email')}</label>
            <input type="email" value={user?.email || ''} disabled
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed" />
            <p className="text-xs text-gray-400 mt-1">{t('profile.emailCannotChange')}</p>
          </div>
          {nameError   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{nameError}</p>}
          {nameSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {t('profile.nameUpdated')}</p>}
          <button type="submit" disabled={savingName}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white transition">
            {savingName ? t('profile.saving') : t('profile.saveName')}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{t('profile.changePassword')}</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('profile.currentPassword')} *</label>
            <input required type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('profile.newPassword')} *</label>
            <input required type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          {pwError   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {t('profile.passwordChanged')}</p>}
          <button type="submit" disabled={savingPw}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white transition">
            {savingPw ? t('profile.saving') : t('profile.changePassword')}
          </button>
        </form>
      </div>

      {/* Language */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">{t('settings.language')}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('settings.languageDescription')}</p>
        <LanguageSwitcher />
      </div>

      {/* Appearance */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">Appearance</h2>
        <p className="text-sm text-gray-500 mb-4">Choose a light, dark, or system-matched theme.</p>
        <ThemeToggle />
      </div>

      {/* Org + role info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{t('profile.organisation')}</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{t('profile.organisation')}</dt>
            <dd className="font-medium text-gray-800">{organization?.name || '—'}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-gray-500">{t('profile.yourRole')}</dt>
            <dd><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleInfo.color}`}>{t(`team.roles.${userRole}`, { defaultValue: roleInfo.label })}</span></dd>
          </div>
          {joinedAt && (
            <div className="flex justify-between">
              <dt className="text-gray-500">{t('profile.memberSince')}</dt>
              <dd className="text-gray-700">{new Date(joinedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Sign out */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">{t('profile.account', { defaultValue: 'Account' })}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('profile.signOutHint', { defaultValue: 'Sign out of your account on this device.' })}</p>
        <button onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 px-5 py-2 text-sm font-semibold text-red-600 transition">
          <span>🚪</span> {t('auth.logout')}
        </button>
      </div>
    </div>
  )
}
