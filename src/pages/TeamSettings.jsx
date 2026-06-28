import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const ROLES = ['owner', 'manager', 'farm_supervisor', 'accountant', 'viewer']

const ROLE_META = {
  owner:           { label: 'Owner',           color: 'bg-gray-800 text-white',       desc: 'Full access, manages users and settings' },
  manager:         { label: 'Manager',         color: 'bg-blue-100 text-blue-700',    desc: 'Full operational access, no user management, no delete' },
  farm_supervisor: { label: 'Farm Supervisor', color: 'bg-green-100 text-green-700',  desc: 'Record distributions and sales, sees all farms, no financials' },
  accountant:      { label: 'Accountant',      color: 'bg-amber-100 text-amber-700',  desc: 'Read-only access to all financial data' },
  viewer:          { label: 'Viewer',          color: 'bg-gray-100 text-gray-600',    desc: 'Read-only access to everything' },
}

function RoleBadge({ role }) {
  const { t } = useTranslation()
  const m = ROLE_META[role] || { label: role, color: 'bg-gray-100 text-gray-600' }
  const label = t(`team.roles.${role}`, { defaultValue: m.label })
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${m.color}`}>{label}</span>
}

function daysAgo(dateStr) {
  const d = Math.floor((Date.now() - new Date(dateStr)) / 86400000)
  return d === 0 ? 'Today' : `${d}d ago`
}
function daysUntil(dateStr) {
  const d = Math.ceil((new Date(dateStr) - Date.now()) / 86400000)
  if (d < 0) return 'Expired'
  if (d === 0) return 'Expires today'
  return `Expires in ${d}d`
}
function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ orgId, inviterId, maxUsers, onClose, onSaved }) {
  const { t } = useTranslation()
  const [form,    setForm]    = useState({ email: '', role: 'manager', message: '' })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const [existingInv, setExistingInv] = useState(null)

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function checkEmail(email) {
    if (!email.includes('@')) return
    const { data } = await supabase
      .from('invitations')
      .select('id, email, role, expires_at, accepted_at')
      .eq('organization_id', orgId)
      .eq('email', email.trim().toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    setExistingInv(data)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email.trim()) { setError(t('errors.required')); return }
    setSaving(true); setError('')

    // Insert invitation; Supabase will auto-generate the token
    const { data: inv, error: invErr } = await supabase
      .from('invitations')
      .insert({
        organization_id: orgId,
        email:           form.email.trim().toLowerCase(),
        role:            form.role,
        invited_by:      inviterId,
      })
      .select('id')
      .single()
    if (invErr) {
      // DB hard-enforces max_users on the organization_users insert (invite/accept path);
      // surface a friendly message instead of the raw error.
      const friendly = invErr.message?.includes('USER_LIMIT_REACHED')
        ? (maxUsers != null
            ? `User limit reached (${maxUsers} / ${maxUsers}). Upgrade your plan to add members.`
            : 'User limit reached. Upgrade your plan to add members.')
        : invErr.message
      setError(friendly); setSaving(false); return
    }

    // Send invitation email via edge function
    const { error: fnErr } = await supabase.functions.invoke('send-invitation', {
      body: { invitation_id: inv.id, app_url: window.location.origin },
    })
    if (fnErr) console.error('send-invitation error:', fnErr)

    setSuccess(true)
    setTimeout(() => { onSaved(); onClose() }, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('team.inviteMember')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-semibold text-gray-800">{t('toasts.inviteSent')}</p>
            <p className="text-sm text-gray-500 mt-1">{form.email}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.inviteEmail')} *</label>
              <input required type="email" value={form.email}
                onChange={e => { set('email')(e); checkEmail(e.target.value) }}
                placeholder="colleague@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              {existingInv && (
                <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  ⚠ A pending invitation already exists for this email. Submitting will create a new one.
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.inviteRole')} *</label>
              <select value={form.role} onChange={set('role')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].label} — {ROLE_META[r].desc}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.inviteMessage')}</label>
              <textarea value={form.message} onChange={set('message')} rows={2}
                placeholder="Add a note to the invitation email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
              An invitation email will be sent to the address above. You can also copy the link from the Pending Invitations list.
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? '…' : t('team.inviteMember')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TeamSettings() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, organization, canManageUsers } = useAuth()

  const [members,     setMembers]     = useState([])
  const [invitations, setInvitations] = useState([])
  const [maxUsers,    setMaxUsers]    = useState(null) // plan limit; null = unlimited
  const [loading,     setLoading]     = useState(true)
  const [inviteModal, setInviteModal] = useState(false)
  const [error,       setError]       = useState('')

  // Redirect non-owners
  useEffect(() => {
    if (!canManageUsers) navigate('/dashboard')
  }, [canManageUsers])

  useEffect(() => { if (organization) fetchData() }, [organization])

  async function fetchData() {
    setLoading(true)
    const planKey = organization?.subscription_plan || 'free'
    const [{ data: mData }, { data: iData }, { data: planData }] = await Promise.all([
      supabase
        .from('organization_users')
        .select('id, user_id, role, is_active, joined_at, users:user_id(email, raw_user_meta_data)')
        .eq('organization_id', organization.id)
        .order('joined_at'),
      supabase
        .from('invitations')
        .select('id, email, role, created_at, expires_at, accepted_at, token')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false }),
      supabase.from('plans').select('max_users').eq('key', planKey).maybeSingle(),
    ])
    setMembers(mData || [])
    setInvitations((iData || []).filter(i => !i.accepted_at))
    setMaxUsers(planData?.max_users ?? null) // unknown plan / no limit → unlimited
    setLoading(false)
  }

  async function handleRoleChange(memberId, newRole, memberUserId) {
    if (memberUserId === user.id) return // can't change own role
    setError('')
    const { error } = await supabase
      .from('organization_users')
      .update({ role: newRole })
      .eq('id', memberId)
    if (error) { setError(error.message); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
  }

  async function handleToggleActive(memberId, currentActive, memberUserId) {
    if (memberUserId === user.id) return // can't deactivate self
    // Validate at least one active owner remains
    if (currentActive) {
      const member = members.find(m => m.id === memberId)
      if (member?.role === 'owner') {
        const activeOwners = members.filter(m => m.role === 'owner' && m.is_active && m.id !== memberId)
        if (activeOwners.length === 0) {
          setError('Cannot deactivate — there must be at least one active owner.')
          return
        }
      }
    }
    setError('')
    const { error } = await supabase
      .from('organization_users')
      .update({ is_active: !currentActive })
      .eq('id', memberId)
    if (error) { setError(error.message); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_active: !currentActive } : m))
  }

  async function handleResendInvitation(invId) {
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const newToken  = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const { error } = await supabase
      .from('invitations')
      .update({ expires_at: newExpiry, token: newToken })
      .eq('id', invId)
    if (error) { setError(error.message); return }
    await supabase.functions.invoke('send-invitation', {
      body: { invitation_id: invId, app_url: window.location.origin },
    })
    fetchData()
  }

  async function handleCancelInvitation(invId) {
    const { error } = await supabase.from('invitations').delete().eq('id', invId)
    if (error) { setError(error.message); return }
    setInvitations(prev => prev.filter(i => i.id !== invId))
  }

  async function copyInviteLink(token) {
    const link = `${window.location.origin}/invite/${token}`
    await navigator.clipboard.writeText(link)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  )

  const pendingInvitations = invitations.filter(i => new Date(i.expires_at) > new Date())

  // ── Plan limit (UX gate; DB hard-enforces active-user count via trigger) ──
  const activeUserCount = members.filter(m => m.is_active).length
  const atUserLimit     = maxUsers != null && activeUserCount >= maxUsers

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('team.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{organization?.name} · {activeUserCount} {t('team.activeMembers')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setInviteModal(true)}
            disabled={atUserLimit}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
          >
            + {t('team.inviteMember')}
          </button>
          {maxUsers != null && (
            <span className="text-xs text-gray-400">{activeUserCount} / {maxUsers} members used</span>
          )}
        </div>
      </div>

      {/* Plan limit notice */}
      {atUserLimit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>User limit reached ({activeUserCount} / {maxUsers}). Upgrade your plan to add members.</span>
          <Link to="/settings/organization" className="font-semibold text-amber-700 underline hover:text-amber-900 whitespace-nowrap">
            Upgrade plan
          </Link>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Members table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
              const isMe     = m.user_id === user.id
              const meta     = m.users?.raw_user_meta_data || {}
              const name     = meta.full_name || m.users?.email || 'Unknown'
              const email    = m.users?.email || ''
              return (
                <tr key={m.id} className={`hover:bg-gray-50 transition ${isMe ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 shrink-0">
                        {initials(name)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{name}</span>
                          {isMe && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">You</span>}
                        </div>
                        <span className="text-xs text-gray-400">{email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {isMe ? (
                      <RoleBadge role={m.role} />
                    ) : (
                      <select
                        value={m.role}
                        onChange={e => handleRoleChange(m.id, e.target.value, m.user_id)}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
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
                      <button
                        onClick={() => handleToggleActive(m.id, m.is_active, m.user_id)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition ${
                          m.is_active
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-600 hover:bg-green-50'
                        }`}
                      >
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

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">{t('team.pendingInvitations')} ({pendingInvitations.length})</h2>
          </div>
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
                const expired = expiry === 'Expired'
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 font-medium text-gray-800">{inv.email}</td>
                    <td className="px-5 py-3"><RoleBadge role={inv.role} /></td>
                    <td className="px-5 py-3 text-xs text-gray-400">{daysAgo(inv.created_at)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium ${expired ? 'text-red-500' : 'text-gray-500'}`}>{expiry}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => copyInviteLink(inv.token)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium">Copy link</button>
                        <button onClick={() => handleResendInvitation(inv.id)}
                          className="text-xs text-amber-600 hover:text-amber-700 font-medium">{t('team.resend')}</button>
                        <button onClick={() => handleCancelInvitation(inv.id)}
                          className="text-xs text-red-500 hover:text-red-600 font-medium">{t('common.cancel')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {inviteModal && (
        <InviteModal
          orgId={organization.id}
          inviterId={user.id}
          maxUsers={maxUsers}
          onClose={() => setInviteModal(false)}
          onSaved={fetchData}
        />
      )}
    </div>
  )
}
