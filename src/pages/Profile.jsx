import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import PlanCard from '../components/PlanCard'
import { subscribeToPlan } from '../lib/razorpay'
import { getSubscriptionState, formatSubDate } from '../lib/subscription'
import { formatCurrencyRound } from '../utils/format'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = ['owner', 'manager', 'farm_supervisor', 'accountant', 'viewer']

const ROLE_META = {
  owner:           { label: 'Owner',           color: 'bg-gray-800 text-white',      desc: 'Full access, manages users and settings' },
  manager:         { label: 'Manager',         color: 'bg-blue-100 text-blue-700',   desc: 'Full operational access, no user management, no delete' },
  farm_supervisor: { label: 'Farm Supervisor', color: 'bg-green-100 text-green-700', desc: 'Record distributions and sales, no financials' },
  accountant:      { label: 'Accountant',      color: 'bg-amber-100 text-amber-700', desc: 'Read-only access to all financial data' },
  viewer:          { label: 'Viewer',          color: 'bg-gray-100 text-gray-600',   desc: 'Read-only access to everything' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function planPriceLabel(plan) {
  const n = Number(plan?.price_monthly)
  return !n ? 'Free' : `${formatCurrencyRound(n)}/mo`
}
function limitLabel(max) { return max == null ? 'Unlimited' : max }
function daysAgo(d) {
  const n = Math.floor((Date.now() - new Date(d)) / 86400000)
  return n === 0 ? 'Today' : `${n}d ago`
}
function daysUntil(d) {
  const n = Math.ceil((new Date(d) - Date.now()) / 86400000)
  if (n < 0)  return 'Expired'
  if (n === 0) return 'Expires today'
  return `Expires in ${n}d`
}
function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ─── RoleBadge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const { t } = useTranslation()
  const m = ROLE_META[role] || { label: role, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${m.color}`}>
      {t(`team.roles.${role}`, { defaultValue: m.label })}
    </span>
  )
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ orgId, inviterId, maxUsers, onClose, onSaved }) {
  const { t } = useTranslation()
  const [form,        setForm]        = useState({ email: '', role: 'manager' })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [inviteToken, setInviteToken] = useState(null) // shown after creation
  const [copied,      setCopied]      = useState(false)

  function setField(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const email = form.email.trim().toLowerCase()
    if (!email || !/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address'); return }
    setSaving(true); setError('')

    // Check for existing pending invitation for this email in this org
    const { data: dupInv } = await supabase
      .from('invitations')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (dupInv) { setError('A pending invitation already exists for this email.'); setSaving(false); return }

    // Check if this email already belongs to an active member
    const { data: memberRows } = await supabase
      .from('organization_users')
      .select('id, users:user_id(email)')
      .eq('organization_id', orgId)
      .eq('is_active', true)
    if ((memberRows || []).some(m => m.users?.email === email)) {
      setError('This email is already an active member of the organisation.')
      setSaving(false); return
    }

    const { data: inv, error: invErr } = await supabase
      .from('invitations')
      .insert({ organization_id: orgId, email, role: form.role, invited_by: inviterId })
      .select('id, token').single()
    if (invErr) {
      const msg = invErr.message?.includes('USER_LIMIT_REACHED')
        ? (maxUsers != null ? `User limit reached (${maxUsers} / ${maxUsers}). Upgrade your plan.` : 'User limit reached.')
        : invErr.message
      setError(msg); setSaving(false); return
    }

    // Send invitation email (non-blocking)
    supabase.functions.invoke('send-invitation', {
      body: { invitation_id: inv.id, app_url: window.location.origin },
    }).catch(console.error)

    setInviteToken(inv.token)
    onSaved()
    setSaving(false)
  }

  function copyLink() {
    const url = `${window.location.origin}/invite/${inviteToken}`
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('team.inviteMember')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {inviteToken ? (
          /* ── Success: show the invite link for sharing ── */
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="text-4xl mb-2">✅</p>
              <p className="font-semibold text-gray-800">Invitation sent!</p>
              <p className="text-sm text-gray-500 mt-1">An email was sent to {form.email}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1 font-medium">Invite link (backup)</p>
              <p className="text-xs text-gray-700 break-all font-mono">
                {window.location.origin}/invite/{inviteToken}
              </p>
            </div>
            <button onClick={copyLink}
              className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition">
              {copied ? '✓ Copied!' : 'Copy Invite Link'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              Link expires in 7 days.
            </p>
            <button onClick={onClose}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Done
            </button>
          </div>
        ) : (
          /* ── Invite form ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
              <input required type="email" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="invitee@example.com"
                autoComplete="off"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <p className="text-xs text-gray-400 mt-1">An invitation email will be sent automatically</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.inviteRole')} *</label>
              <select value={form.role} onChange={setField('role')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].label} — {ROLE_META[r].desc}</option>)}
              </select>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? '…' : 'Send Invitation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── MY PROFILE tab ───────────────────────────────────────────────────────────

function ProfileSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, organization, userRole, signOut } = useAuth()

  const [fullName,    setFullName]    = useState('')
  const [joinedAt,    setJoinedAt]    = useState('')
  const [savingName,  setSavingName]  = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [nameError,   setNameError]   = useState('')
  const [currentPw,   setCurrentPw]   = useState('')
  const [newPw,       setNewPw]       = useState('')
  const [savingPw,    setSavingPw]    = useState(false)
  const [pwSuccess,   setPwSuccess]   = useState(false)
  const [pwError,     setPwError]     = useState('')

  useEffect(() => {
    if (user) setFullName(user.user_metadata?.full_name || '')
    if (user && organization) {
      supabase.from('organization_users').select('joined_at')
        .eq('user_id', user.id).eq('organization_id', organization.id).single()
        .then(({ data }) => { if (data) setJoinedAt(data.joined_at) })
    }
  }, [user, organization])

  async function handleSaveName(e) {
    e.preventDefault()
    if (!fullName.trim()) { setNameError(t('errors.required')); return }
    setSavingName(true); setNameError(''); setNameSuccess(false)
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } })
    setSavingName(false)
    if (error) { setNameError(error.message); return }
    setNameSuccess(true); setTimeout(() => setNameSuccess(false), 3000)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPw.length < 8) { setPwError(t('errors.minPassword')); return }
    setSavingPw(true); setPwError(''); setPwSuccess(false)
    const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw })
    if (reAuthErr) { setPwError('Current password is incorrect'); setSavingPw(false); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (error) { setPwError(error.message); return }
    setPwSuccess(true); setCurrentPw(''); setNewPw('')
    setTimeout(() => setPwSuccess(false), 3000)
  }

  const roleInfo = ROLE_META[userRole] || { label: userRole, color: 'bg-gray-100 text-gray-600' }

  return (
    <div className="space-y-5">

      {/* Personal details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{t('profile.personalDetails')}</h2>
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

      {/* Membership */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{t('profile.organisation')}</h2>
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

      {/* Change Password */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{t('profile.changePassword')}</h2>
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
      <div data-tour="profile_language" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('settings.language')}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('settings.languageDescription')}</p>
        <LanguageSwitcher />
      </div>

      {/* Appearance */}
      <div data-tour="profile_appearance" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Appearance</h2>
        <p className="text-sm text-gray-500 mb-4">Choose a light, dark, or system-matched theme.</p>
        <ThemeToggle />
      </div>

      {/* Sign out */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('profile.account', { defaultValue: 'Account' })}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('profile.signOutHint', { defaultValue: 'Sign out of your account on this device.' })}</p>
        <button onClick={async () => { await signOut(); navigate('/login') }}
          className="flex items-center gap-2 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 px-5 py-2 text-sm font-semibold text-red-600 transition">
          <span>🚪</span> {t('auth.logout')}
        </button>
      </div>

    </div>
  )
}

// ─── ORGANISATION tab ─────────────────────────────────────────────────────────

function OrgSection() {
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const { t } = useTranslation()
  const { user, organization, isOwner, refreshOrg, signOut } = useAuth()

  const [form,         setFormState]  = useState({ name: '', phone: '', address: '' })
  const [saving,       setSaving]     = useState(false)
  const [saveSuccess,  setSaveSuccess]= useState(false)
  const [error,        setError]      = useState('')
  const [confirmName,  setConfirmName]= useState('')
  const [deactivating, setDeactivating] = useState(false)
  const [dangerError,  setDangerError]= useState('')
  const [plans,        setPlans]      = useState([])
  const [usage,        setUsage]      = useState({ farms: 0, users: 0 })
  const [showPlanModal,setShowPlanModal] = useState(false)
  const [planError,    setPlanError]  = useState('')
  const [billingByPlan,setBillingByPlan] = useState({})
  const [busyPlan,     setBusyPlan]   = useState('')

  useEffect(() => {
    supabase.from('plans').select('*').order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setPlans(data) })
  }, [])

  useEffect(() => {
    if (!organization) return
    let cancelled = false
    ;(async () => {
      const [farmsRes, usersRes] = await Promise.all([
        supabase.from('farms').select('*', { count: 'exact', head: true }).eq('organization_id', organization.id),
        supabase.from('organization_users').select('*', { count: 'exact', head: true }).eq('organization_id', organization.id).eq('is_active', true),
      ])
      if (!cancelled) setUsage({ farms: farmsRes.count || 0, users: usersRes.count || 0 })
    })()
    return () => { cancelled = true }
  }, [organization])

  useEffect(() => {
    if (organization) setFormState({
      name: organization.name || '',
      phone: organization.phone || '', address: organization.address || '',
    })
  }, [organization])

  const currentPlan = plans.find(p => p.key === (organization?.subscription_plan || 'free')) || null
  const activePlans  = plans.filter(p => p.is_active)
  const sub          = getSubscriptionState(organization)
  const isPaidPlan   = currentPlan ? Number(currentPlan.price_monthly) > 0 : false

  function openPlanModal() {
    const cur = organization?.subscription_plan || 'free'
    setBillingByPlan({ [cur]: organization?.billing_period || 'monthly' })
    setPlanError(''); setBusyPlan(''); setShowPlanModal(true)
  }
  const billingFor = key => billingByPlan[key] || 'monthly'
  const setBilling = (key, period) => setBillingByPlan(b => ({ ...b, [key]: period }))

  async function choosePlan(plan) {
    if (busyPlan) return
    setBusyPlan(plan.key); setPlanError('')
    const billing = billingFor(plan.key)
    try {
      if (Number(plan.price_monthly) > 0) {
        await subscribeToPlan({ supabase, organization, user, planKey: plan.key, billing })
      } else {
        const { data, error: rpcErr } = await supabase.rpc('change_organization_plan', {
          p_org_id: organization.id, p_user_id: user.id, p_plan_key: plan.key, p_billing_period: billing,
        })
        if (rpcErr)      throw new Error(rpcErr.message)
        if (data?.error) throw new Error(data.error)
      }
      await refreshOrg(); setShowPlanModal(false)
    } catch (e) {
      if (e.message !== 'DISMISSED') setPlanError(e.message || String(e))
      setBusyPlan('')
    }
  }

  function setField(f) { return e => setFormState(p => ({ ...p, [f]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError(t('org.orgNameRequired')); return }
    setSaving(true); setError(''); setSaveSuccess(false)
    const { error: err } = await supabase.from('organizations').update({
      name: form.name.trim(),
      phone: form.phone.trim() || null, address: form.address.trim() || null,
    }).eq('id', organization.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaveSuccess(true); await refreshOrg()
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  async function handleDeactivate() {
    if (confirmName !== organization.name) { setDangerError(t('org.orgNameMismatch')); return }
    setDeactivating(true); setDangerError('')
    const { error: err } = await supabase.from('organizations').update({ is_active: false }).eq('id', organization.id)
    if (err) { setDangerError(err.message); setDeactivating(false); return }
    await signOut(); navigate('/login')
  }

  if (!organization) return null

  return (
    <div className="space-y-5">

      {/* Business Details */}
      <div data-tour="profile_org" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{t('org.businessDetails')}</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.organisationName')} *</label>
              <input required type="text" value={form.name} onChange={setField('name')} disabled={!isOwner}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50 disabled:cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.phone')}</label>
              <input type="tel" value={form.phone} onChange={setField('phone')} disabled={!isOwner}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50 disabled:cursor-not-allowed" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.address')}</label>
            <textarea value={form.address} onChange={setField('address')} rows={2} disabled={!isOwner}
              placeholder={t('org.farmAddress')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed" />
          </div>
          {!isOwner && <p className="text-xs text-gray-400">Only owners can edit organisation details.</p>}
          {error      && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {saveSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {t('org.savedSuccessfully')}</p>}
          {isOwner && (
            <button type="submit" disabled={saving}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white transition">
              {saving ? t('org.saving') : t('org.saveChanges')}
            </button>
          )}
        </form>
      </div>

      {/* Subscription */}
      <div data-tour="profile_plan" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('org.subscription')}</h2>
          {isOwner && (
            <button onClick={openPlanModal}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition">
              Change plan
            </button>
          )}
        </div>

        {/* Plan tile — mirrors PlanCard visual */}
        {(() => {
          const trialEnd      = organization.trial_ends_at ? new Date(organization.trial_ends_at) : null
          const inTrial       = trialEnd != null && trialEnd > new Date()
          const trialExpired  = trialEnd != null && trialEnd <= new Date()
          const trialDaysLeft = inTrial ? Math.max(0, Math.ceil((trialEnd - Date.now()) / 86400000)) : null

          const priceFree  = !isPaidPlan
          const priceMain  = priceFree ? 'Free' : (
            organization.billing_period === 'yearly' && currentPlan?.price_yearly
              ? formatCurrencyRound(Number(currentPlan.price_yearly))
              : formatCurrencyRound(Number(currentPlan?.price_monthly || 0))
          )
          const priceUnit  = priceFree ? '' : organization.billing_period === 'yearly' ? '/yr' : '/mo'

          const farmsLabel = currentPlan?.max_farms == null ? 'Unlimited farms' : `${currentPlan.max_farms} farm${currentPlan.max_farms === 1 ? '' : 's'}`
          const usersLabel = currentPlan?.max_users == null ? 'Unlimited team members' : `${currentPlan.max_users} team member${currentPlan.max_users === 1 ? '' : 's'}`

          const FEATURES = ['Batch & flock tracking', 'Sales, procurement & expenses', 'P&L, FCR & growing-fee reports', 'Mobile app access']

          function Tick({ muted }) {
            return (
              <svg className={`h-4 w-4 mt-0.5 shrink-0 ${muted ? 'text-amber-300' : 'text-amber-500'}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.42 0L3.3 9.7a1 1 0 011.4-1.42l3.29 3.3 6.8-6.8a1 1 0 011.42 0z" clipRule="evenodd" />
              </svg>
            )
          }

          return (
            <div className={`relative rounded-xl border-2 p-5 ${isPaidPlan ? 'border-amber-400 bg-amber-50/20' : 'border-gray-200 bg-gray-50/30'}`}>
              {isPaidPlan && (
                <span className="absolute -top-3 left-5 whitespace-nowrap rounded-full bg-amber-500 px-3 py-0.5 text-[11px] font-bold tracking-wide text-white shadow">
                  CURRENT PLAN
                </span>
              )}

              {/* Name + status */}
              <div className="flex items-start justify-between gap-2 mt-1">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{currentPlan?.name || 'Free'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                    {currentPlan?.description || 'Get started at no cost'}
                  </p>
                </div>
                {status && (
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                    status === 'active'     ? 'bg-green-100 text-green-700' :
                    status === 'cancelled' || status === 'expired' ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>{status}</span>
                )}
              </div>

              {/* Price */}
              <div className="mt-4 mb-1 flex items-end gap-1">
                <span className="text-3xl font-extrabold text-gray-900 leading-none">{priceMain}</span>
                {priceUnit && <span className="text-sm font-medium text-gray-400 mb-0.5">{priceUnit}</span>}
              </div>
              <p className="text-xs text-gray-400 mb-4">
                {priceFree ? 'free forever' : `billed ${organization.billing_period || 'monthly'}`}
              </p>

              {/* Free trial — active */}
              {inTrial && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-green-700">🎁 Free trial active</p>
                    <span className="px-2 py-0.5 rounded-full bg-green-200 text-green-800 text-xs font-bold">{trialDaysLeft}d left</span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Trial ends on <span className="font-semibold">{formatSubDate(trialEnd)}</span>. No charge until then.
                  </p>
                  {/* Mini countdown bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-green-200 overflow-hidden">
                    <div className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.max(4, Math.min(100, (trialDaysLeft / 90) * 100))}%` }} />
                  </div>
                </div>
              )}

              {/* Free trial — expired, not yet on paid plan */}
              {trialExpired && !isPaidPlan && (
                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800">⏰ Free trial ended {formatSubDate(trialEnd)}</p>
                  <p className="text-xs text-amber-700 mt-0.5">Subscribe to a plan to continue using all features.</p>
                  {isOwner && (
                    <button onClick={openPlanModal} className="mt-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition">
                      Choose a plan
                    </button>
                  )}
                </div>
              )}

              {/* Renewal info — paid subscription, billing has started */}
              {sub.hasSubscription && !inTrial && (
                <p className="text-xs text-gray-500 mb-4">
                  {sub.ended ? 'Ended on' : 'Renews on'}{' '}
                  <span className="font-semibold text-gray-700">{formatSubDate(sub.periodEnd)}</span>
                </p>
              )}

              {/* No period_end yet → billing hasn't started → still in trial */}
              {!sub.hasSubscription && isPaidPlan && !inTrial && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                  <p className="text-sm font-semibold text-green-700">🎁 Free trial active</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    You won't be charged until your trial period ends. Billing starts automatically after the trial.
                  </p>
                </div>
              )}

              {/* Features */}
              <ul className="space-y-2 mb-5">
                <li className="flex items-start gap-2 text-sm font-semibold text-gray-800"><Tick /> {farmsLabel}</li>
                <li className="flex items-start gap-2 text-sm font-semibold text-gray-800"><Tick /> {usersLabel}</li>
                {FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2 text-xs text-gray-500"><Tick muted /> {f}</li>
                ))}
              </ul>

              {/* Usage */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Farms', used: usage.farms, max: currentPlan?.max_farms },
                  { label: 'Users', used: usage.users, max: currentPlan?.max_users },
                ].map(({ label, used, max }) => (
                  <div key={label} className="rounded-xl border border-white bg-white/80 px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-lg font-bold text-gray-800 mt-0.5">
                      {used} <span className="text-sm font-normal text-gray-400">/ {limitLabel(max)}</span>
                    </p>
                    {max != null && (
                      <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${used / max > 0.8 ? 'bg-red-400' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(100, Math.round((used / max) * 100))}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Alerts below the tile */}
        {sub.endingSoon && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">⏳ Subscription ends in {sub.daysLeft} day{sub.daysLeft === 1 ? '' : 's'}.</p>
            <p className="text-xs text-amber-700 mt-0.5">Renew before {formatSubDate(sub.periodEnd)} to avoid interruption.</p>
          </div>
        )}
        {sub.inGrace && (
          <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">⚠️ Subscription has ended.</p>
            <p className="text-xs text-red-600 mt-0.5">Service stops in {sub.graceDaysLeft} day{sub.graceDaysLeft === 1 ? '' : 's'}.</p>
            {isOwner && <button onClick={openPlanModal} className="mt-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-1.5 text-sm font-semibold text-white transition">Renew now</button>}
          </div>
        )}
      </div>

      {/* Danger Zone — owner only */}
      {isOwner && (
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6">
          <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-4">{t('org.dangerZone')}</h2>
          <p className="text-sm font-medium text-gray-700 mb-1">{t('org.deactivateOrg')}</p>
          <p className="text-sm text-gray-500 mb-3">{t('org.deactivateWarning')}</p>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('org.typeToConfirm', { name: organization.name })}</label>
            <input type="text" value={confirmName} onChange={e => setConfirmName(e.target.value)}
              placeholder={t('org.orgNamePlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          {dangerError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{dangerError}</p>}
          <button onClick={handleDeactivate} disabled={deactivating || confirmName !== organization.name}
            className="rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 px-5 py-2 text-sm font-semibold text-white transition">
            {deactivating ? t('org.deactivating') : t('org.deactivateButton')}
          </button>
        </div>
      )}

      {/* Change-plan modal */}
      {showPlanModal && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-lg font-semibold text-gray-800">Change plan</h2>
              <button onClick={() => setShowPlanModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-5">Pick the plan that fits your operation. Downgrades blocked while over the limit.</p>
            {planError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-5">{planError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
              {activePlans.map(plan => {
                const isCurrent     = (organization.subscription_plan || 'free') === plan.key
                const isCurrentSame = isCurrent && billingFor(plan.key) === (organization.billing_period || 'monthly')
                return (
                  <PlanCard key={plan.key} plan={plan} billing={billingFor(plan.key)} onBilling={p => setBilling(plan.key, p)}
                    onChoose={() => choosePlan(plan)} busy={busyPlan === plan.key} disabled={!!busyPlan}
                    ctaDisabled={isCurrentSame} current={isCurrent} popular={plan.key === 'pro'} showTrial={false}
                    ctaLabel={isCurrent ? (isCurrentSame ? 'Current plan' : 'Update billing') : undefined} />
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TEAM tab ─────────────────────────────────────────────────────────────────

function TeamSection() {
  const { t } = useTranslation()
  const [, setSearchParams] = useSearchParams()
  const { user, organization } = useAuth()
  const { stepDone } = useOnboarding()

  const [members,     setMembers]     = useState([])
  const [invitations, setInvitations] = useState([])
  const [maxUsers,    setMaxUsers]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [inviteModal, setInviteModal] = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => { if (organization) fetchData() }, [organization])

  async function fetchData() {
    setLoading(true)
    const planKey = organization?.subscription_plan || 'free'
    const [{ data: mData }, { data: iData }, { data: planData }] = await Promise.all([
      supabase.from('organization_users')
        .select('id, user_id, role, is_active, joined_at, users:user_id(email, raw_user_meta_data)')
        .eq('organization_id', organization.id).order('joined_at'),
      supabase.from('invitations')
        .select('id, email, role, created_at, expires_at, accepted_at, token')
        .eq('organization_id', organization.id).order('created_at', { ascending: false }),
      supabase.from('plans').select('max_users').eq('key', planKey).maybeSingle(),
    ])
    setMembers(mData || [])
    setInvitations((iData || []).filter(i => !i.accepted_at))
    setMaxUsers(planData?.max_users ?? null)
    setLoading(false)
  }

  async function handleRoleChange(memberId, newRole, memberUserId) {
    if (memberUserId === user.id) return
    setError('')
    const { error } = await supabase.from('organization_users').update({ role: newRole }).eq('id', memberId)
    if (error) { setError(error.message); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
  }

  async function handleToggleActive(memberId, currentActive, memberUserId) {
    if (memberUserId === user.id) return
    if (currentActive) {
      const member = members.find(m => m.id === memberId)
      if (member?.role === 'owner') {
        const activeOwners = members.filter(m => m.role === 'owner' && m.is_active && m.id !== memberId)
        if (activeOwners.length === 0) { setError('Cannot deactivate — at least one active owner required.'); return }
      }
    }
    setError('')
    const { error } = await supabase.from('organization_users').update({ is_active: !currentActive }).eq('id', memberId)
    if (error) { setError(error.message); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_active: !currentActive } : m))
  }

  async function handleResendInvitation(invId) {
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const newToken  = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const { error } = await supabase.from('invitations').update({ expires_at: newExpiry, token: newToken }).eq('id', invId)
    if (error) { setError(error.message); return }
    supabase.functions.invoke('send-invitation', {
      body: { invitation_id: invId, app_url: window.location.origin },
    }).catch(console.error)
    fetchData()
  }

  async function handleCancelInvitation(invId) {
    const { error } = await supabase.from('invitations').delete().eq('id', invId)
    if (error) { setError(error.message); return }
    setInvitations(prev => prev.filter(i => i.id !== invId))
  }

  async function copyInviteLink(token) {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  )

  const pendingInvitations = invitations.filter(i => new Date(i.expires_at) > new Date())
  const activeUserCount    = members.filter(m => m.is_active).length
  const atUserLimit        = maxUsers != null && activeUserCount >= maxUsers

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{organization?.name} · {activeUserCount} {t('team.activeMembers')}</p>
        <div className="flex flex-col items-end gap-1">
          <button data-tour="team" onClick={() => setInviteModal(true)} disabled={atUserLimit}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition">
            + {t('team.inviteMember')}
          </button>
          {maxUsers != null && <span className="text-xs text-gray-400">{activeUserCount} / {maxUsers} members used</span>}
        </div>
      </div>

      {atUserLimit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>User limit reached ({activeUserCount} / {maxUsers}). Upgrade your plan to add members.</span>
          <button onClick={() => setSearchParams({ tab: 'org' })}
            className="font-semibold text-amber-700 underline hover:text-amber-900 whitespace-nowrap">
            Upgrade plan
          </button>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Members */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">{t('team.title')} <span className="text-gray-400 font-normal">({members.length})</span></h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">{t('team.role')}</th>
                <th className="px-5 py-3">{t('common.status')}</th>
                <th className="px-5 py-3">{t('team.joined')}</th>
                <th className="px-5 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map(m => {
                const isMe  = m.user_id === user.id
                const meta  = m.users?.raw_user_meta_data || {}
                const name  = meta.full_name || m.users?.email || 'Unknown'
                const email = m.users?.email || ''
                return (
                  <tr key={m.id} className={`hover:bg-gray-50/60 transition ${isMe ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 shrink-0">
                          {initials(name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-800">{name}</span>
                            {isMe && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">You</span>}
                          </div>
                          <span className="text-xs text-gray-400">{email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {isMe ? <RoleBadge role={m.role} /> : (
                        <select value={m.role} onChange={e => handleRoleChange(m.id, e.target.value, m.user_id)}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400">
                          {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {new Date(m.joined_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3">
                      {!isMe && (
                        <button onClick={() => handleToggleActive(m.id, m.is_active, m.user_id)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition ${
                            m.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'
                          }`}>
                          {m.is_active ? t('team.deactivate') : t('team.reactivate')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">{t('team.pendingInvitations')} <span className="text-gray-400 font-normal">({pendingInvitations.length})</span></h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">{t('team.role')}</th>
                  <th className="px-5 py-3">Sent</th>
                  <th className="px-5 py-3">{t('team.expires')}</th>
                  <th className="px-5 py-3">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pendingInvitations.map(inv => {
                  const expiry  = daysUntil(inv.expires_at)
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/60 transition">
                      <td className="px-5 py-3 text-sm text-gray-800">
                        {inv.email || '—'}
                      </td>
                      <td className="px-5 py-3"><RoleBadge role={inv.role} /></td>
                      <td className="px-5 py-3 text-xs text-gray-400">{daysAgo(inv.created_at)}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium ${expiry === 'Expired' ? 'text-red-500' : 'text-gray-500'}`}>{expiry}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => copyInviteLink(inv.token)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Copy link</button>
                          <button onClick={() => handleResendInvitation(inv.id)} className="text-xs text-amber-600 hover:text-amber-700 font-medium">{t('team.resend')}</button>
                          <button onClick={() => handleCancelInvitation(inv.id)} className="text-xs text-red-500 hover:text-red-600 font-medium">{t('common.cancel')}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inviteModal && (
        <InviteModal orgId={organization.id} inviterId={user.id} maxUsers={maxUsers}
          onClose={() => setInviteModal(false)}
          onSaved={() => { fetchData(); stepDone('team') }} />
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function Profile() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { userRole, isOwner } = useAuth()
  const { t } = useTranslation()

  const TABS = [
    { key: 'profile', label: 'My Profile',   icon: '👤' },
    { key: 'org',     label: 'Organisation', icon: '🏢' },
    { key: 'team',    label: 'Team',         icon: '👥', ownerOnly: true },
  ]

  const visibleTabs = TABS.filter(tab => !tab.ownerOnly || isOwner)
  const activeTab   = searchParams.get('tab') || 'profile'
  const isWide      = activeTab === 'team'

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Account Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your profile, organisation, and team in one place.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSearchParams({ tab: tab.key })}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={isWide ? 'max-w-4xl' : 'max-w-xl'}>
        {activeTab === 'profile' && <ProfileSection />}
        {activeTab === 'org'     && <OrgSection />}
        {activeTab === 'team'    && isOwner && <TeamSection />}
      </div>
    </div>
  )
}
