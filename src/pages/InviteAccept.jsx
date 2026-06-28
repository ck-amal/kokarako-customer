import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const ROLE_LABELS = {
  owner:           'Owner',
  manager:         'Manager',
  farm_supervisor: 'Farm Supervisor',
  accountant:      'Accountant',
  viewer:          'Viewer',
}

export default function InviteAccept() {
  const { token }    = useParams()
  const navigate     = useNavigate()
  const { t } = useTranslation()
  const { user, refreshOrg } = useAuth()

  const [invitation, setInvitation] = useState(null)
  const [org,        setOrg]        = useState(null)
  const [status,     setStatus]     = useState('loading') // loading | valid | invalid | expired | accepted
  const [authMode,   setAuthMode]   = useState('login')   // login | signup
  const [form, setForm] = useState({ fullName: '', password: '', confirmPw: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  useEffect(() => {
    async function validateToken() {
      const { data: inv } = await supabase
        .from('invitations')
        .select('id, organization_id, role, email, expires_at, accepted_at, organizations(name)')
        .eq('token', token)
        .single()

      if (!inv) { setStatus('invalid'); return }
      if (inv.accepted_at) { setStatus('accepted'); return }
      if (new Date(inv.expires_at) < new Date()) { setStatus('expired'); return }

      setInvitation(inv)
      setOrg(inv.organizations)
      setStatus('valid')

      // If already logged in — complete acceptance immediately
      if (user) acceptInvitation(inv, user.id)
    }
    validateToken()
  }, [token])

  async function acceptInvitation(inv, userId) {
    const { data, error: fnErr } = await supabase.rpc('accept_invitation', {
      p_token: token,
      p_user_id: userId,
    })
    if (fnErr) { setError(fnErr.message); setLoading(false); return }
    if (data?.error) { setError(data.error); setLoading(false); return }
    await refreshOrg()
    navigate('/dashboard')
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: invitation.email, password: form.password,
    })
    if (authErr) { setError(authErr.message); setLoading(false); return }
    await acceptInvitation(invitation, data.user.id)
  }

  async function handleSignup(e) {
    e.preventDefault()
    if (form.password.length < 8) { setError(t('errors.minPassword')); return }
    if (form.password !== form.confirmPw) { setError(t('errors.passwordMismatch')); return }
    setLoading(true); setError('')

    // Create the invited user pre-confirmed + join the org via the edge function
    // (the invite email already verified ownership), then sign in. Keeps
    // "Confirm email" ON for public signups without breaking the invite flow.
    const { data, error: fnErr } = await supabase.functions.invoke('accept-invitation', {
      body: { token, password: form.password, full_name: form.fullName.trim() },
    })
    if (fnErr) { setError(fnErr.message); setLoading(false); return }
    if (data?.error) {
      if (data.code === 'ACCOUNT_EXISTS') {
        setError('You already have an account for this email — switch to "I have an account" to sign in.')
        setAuthMode('login')
      } else {
        setError(data.error)
      }
      setLoading(false)
      return
    }

    // User now exists and is confirmed → sign in; AuthContext loads the org
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: invitation.email, password: form.password,
    })
    if (signInErr) { setError(signInErr.message); setLoading(false); return }
    await refreshOrg()
    navigate('/dashboard')
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  )

  if (status === 'invalid') return (
    <CenteredCard title="Invalid Invitation" icon="❌">
      <p className="text-sm text-gray-600 text-center">This invitation link is invalid or does not exist.</p>
    </CenteredCard>
  )

  if (status === 'expired') return (
    <CenteredCard title="Invitation Expired" icon="⏰">
      <p className="text-sm text-gray-600 text-center">This invitation has expired. Ask the organisation owner to send a new one.</p>
    </CenteredCard>
  )

  if (status === 'accepted') return (
    <CenteredCard title="Already Accepted" icon="✅">
      <p className="text-sm text-gray-600 text-center">This invitation has already been used.</p>
      <button onClick={() => navigate('/login')} className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg px-4 py-2 text-sm transition">
        {t('auth.login')}
      </button>
    </CenteredCard>
  )

  // If user is already logged in, acceptInvitation was called in useEffect
  if (user) return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-600">Joining organisation…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500 shadow-lg mb-4">
            <span className="text-3xl">🐔</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">You're invited!</h1>
          <p className="text-sm text-gray-500 mt-1">Join <strong>{org?.name}</strong> as <strong>{ROLE_LABELS[invitation?.role]}</strong></p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 text-center mb-4">
          Invitation for <strong>{invitation?.email}</strong>
        </div>

        <div className="flex gap-2 mb-4">
          {['login', 'signup'].map(m => (
            <button key={m} onClick={() => setAuthMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${authMode === m ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {m === 'login' ? 'I have an account' : t('auth.createAccount')}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.password')}</label>
                <input required type="password" value={form.password} onChange={set('password')}
                  placeholder="Your password"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition">
                {loading ? t('auth.signingIn') : 'Accept & Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.fullName')} *</label>
                <input required type="text" value={form.fullName} onChange={set('fullName')}
                  placeholder={t('auth.namePlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.password')} *</label>
                <input required type="password" value={form.password} onChange={set('password')}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.confirmPassword')} *</label>
                <input required type="password" value={form.confirmPw} onChange={set('confirmPw')}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition">
                {loading ? t('auth.creatingAccount') : 'Accept & Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function CenteredCard({ title, icon, children }) {
  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <p className="text-5xl mb-4">{icon}</p>
        <h1 className="text-xl font-bold text-gray-800 mb-3">{title}</h1>
        {children}
      </div>
    </div>
  )
}
