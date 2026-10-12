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
        .rpc('lookup_invitation_by_token', { p_token: token })
        .single()

      if (!inv)             { setStatus('invalid');  return }
      if (inv.accepted_at)  { setStatus('accepted'); return }
      if (new Date(inv.expires_at) < new Date()) { setStatus('expired'); return }

      setInvitation(inv)
      setOrg({ name: inv.org_name })
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

  async function handleGoogleSignIn() {
    setError(''); setLoading(true)
    localStorage.setItem('kokarako_invite_token', token)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (err) {
      localStorage.removeItem('kokarako_invite_token')
      setError(err.message)
      setLoading(false)
    }
    // On success, Google redirects away — no further action needed here
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
            <div className="space-y-4">
              {/* Google sign-in (fastest path) */}
              <button type="button" onClick={handleGoogleSignIn} disabled={loading}
                className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition">
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or use OTP</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

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
            </div>

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
