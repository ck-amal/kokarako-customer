import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const ROLE_LABELS = {
  owner: 'Owner', manager: 'Manager', farm_supervisor: 'Farm Supervisor',
  accountant: 'Accountant', viewer: 'Viewer',
}

export default function InviteAccept() {
  const { token }   = useParams()
  const navigate    = useNavigate()
  const { user, refreshOrg } = useAuth()

  const [invitation, setInvitation] = useState(null)
  const [org,        setOrg]        = useState(null)
  const [status,     setStatus]     = useState('loading') // loading | valid | invalid | expired | accepted
  const [email,      setEmail]      = useState('')
  const [otp,        setOtp]        = useState('')
  const [step,       setStep]       = useState('email')   // email | otp
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [resendIn,   setResendIn]   = useState(0)

  function startResendTimer() {
    setResendIn(30)
    const iv = setInterval(() => {
      setResendIn(n => { if (n <= 1) { clearInterval(iv); return 0 } return n - 1 })
    }, 1000)
  }

  useEffect(() => {
    async function validateToken() {
      const { data: inv } = await supabase
        .from('invitations')
        .select('id, organization_id, role, email, expires_at, accepted_at, organizations(name)')
        .eq('token', token)
        .single()

      if (!inv)             { setStatus('invalid');  return }
      if (inv.accepted_at)  { setStatus('accepted'); return }
      if (new Date(inv.expires_at) < new Date()) { setStatus('expired'); return }

      setInvitation(inv)
      setOrg(inv.organizations)
      setStatus('valid')

      // Pre-fill email from the invitation
      if (inv.email) setEmail(inv.email)

      // Already logged in → accept immediately
      if (user) acceptInvitation(user.id)
    }
    validateToken()
  }, [token])

  async function acceptInvitation(userId) {
    const { data, error: rpcErr } = await supabase.rpc('accept_invitation', {
      p_token:   token,
      p_user_id: userId,
    })
    if (rpcErr)       { setError(rpcErr.message); setLoading(false); return }
    if (data?.error)  { setError(data.error);     setLoading(false); return }
    await refreshOrg()
    navigate('/dashboard')
  }

  async function handleSendOtp(e) {
    e.preventDefault()
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email address')
      return
    }
    setError(''); setLoading(true)
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setLoading(false)
    if (err) { setError(err.message); return }
    setStep('otp')
    startResendTimer()
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    if (otp.length !== 6) { setError('Enter the 6-digit code'); return }
    setError(''); setLoading(true)
    const { data: authData, error: authErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type:  'email',
    })
    if (authErr) { setError(authErr.message); setLoading(false); return }
    await acceptInvitation(authData.user.id)
  }

  async function handleResend() {
    if (resendIn > 0 || loading) return
    setError(''); setLoading(true)
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setLoading(false)
    if (err) { setError(err.message); return }
    startResendTimer()
  }

  // ── Status screens ───────────────────────────────────────────────────────────

  if (status === 'loading') return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  )

  if (status === 'invalid') return (
    <CenteredCard icon="❌" title="Invalid Invitation">
      <p className="text-sm text-gray-600 text-center">This invitation code is invalid or does not exist.</p>
    </CenteredCard>
  )

  if (status === 'expired') return (
    <CenteredCard icon="⏰" title="Invitation Expired">
      <p className="text-sm text-gray-600 text-center">This invitation has expired. Ask the organisation owner to send a new one.</p>
    </CenteredCard>
  )

  if (status === 'accepted') return (
    <CenteredCard icon="✅" title="Already Accepted">
      <p className="text-sm text-gray-600 text-center">This invitation has already been used.</p>
      <button onClick={() => navigate('/login')}
        className="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg px-4 py-2 text-sm transition">
        Sign In
      </button>
    </CenteredCard>
  )

  // Already logged in → waiting for acceptInvitation to resolve
  if (user) return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-600">Joining organisation…</p>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    </div>
  )

  // ── Main invite acceptance flow ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500 shadow-lg mb-4">
            <span className="text-3xl">🐔</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">You're invited!</h1>
          <p className="text-sm text-gray-500 mt-1">
            Join <strong>{org?.name}</strong> as <strong>{ROLE_LABELS[invitation?.role]}</strong>
          </p>
        </div>

        {invitation?.email && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 text-center mb-4">
            This invitation is for <strong>{invitation.email}</strong>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {step === 'email' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Email Address</label>
                <input required type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
                <p className="text-xs text-gray-400 mt-1.5">We'll send a 6-digit code to verify your email</p>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <button type="submit" disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition">
                {loading ? 'Sending…' : 'Send OTP'}
              </button>
            </form>

          ) : (

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">6-digit OTP</label>
                  <button type="button" onClick={() => { setStep('email'); setOtp(''); setError('') }}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium">
                    Change email
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">Sent to {email}</p>
                <input
                  type="tel"
                  required
                  inputMode="numeric"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="——————"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center
                             text-2xl font-bold tracking-[0.6em] text-gray-900 placeholder-gray-300
                             focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <button type="submit" disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition">
                {loading ? 'Verifying…' : 'Verify & Accept Invitation'}
              </button>

              <div className="text-center pt-1">
                <button type="button" onClick={handleResend} disabled={resendIn > 0 || loading}
                  className="text-sm text-amber-600 hover:text-amber-700 disabled:text-gray-400 disabled:cursor-not-allowed font-medium">
                  {resendIn > 0 ? `Resend OTP in ${resendIn}s` : 'Resend OTP'}
                </button>
              </div>
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
