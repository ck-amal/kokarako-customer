import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'

function PasswordStrength({ password }) {
  const checks = [
    { label: '8+ chars',   pass: password.length >= 8 },
    { label: 'Uppercase',  pass: /[A-Z]/.test(password) },
    { label: 'Number',     pass: /[0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.pass).length
  const colors = ['bg-red-400', 'bg-amber-400', 'bg-green-400']
  const labels = ['Weak', 'Fair', 'Strong']
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < score ? colors[score - 1] : 'bg-gray-200'}`} />
        ))}
      </div>
      <div className="flex gap-3">
        {checks.map(c => (
          <span key={c.label} className={`text-xs ${c.pass ? 'text-green-600' : 'text-gray-400'}`}>
            {c.pass ? '✓' : '○'} {c.label}
          </span>
        ))}
        {password.length > 0 && <span className={`text-xs font-medium ml-auto ${score === 3 ? 'text-green-600' : score === 2 ? 'text-amber-600' : 'text-red-500'}`}>{labels[score - 1] || 'Too short'}</span>}
      </div>
    </div>
  )
}

export default function Signup() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPw: '' })
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError(t('errors.minPassword')); return }
    if (form.password !== form.confirmPw) { setError(t('errors.passwordMismatch')); return }

    setLoading(true)

    // Create the account only — the organisation + plan are set up in the next steps.
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email:    form.email.trim(),
      password: form.password,
      options:  { data: { full_name: form.fullName.trim() } },
    })
    if (authErr) { setError(authErr.message); setLoading(false); return }
    if (!authData.user) { setError('Signup failed — please try again'); setLoading(false); return }

    // Email confirmation required → no session yet. Show "check your email".
    if (!authData.session) { setEmailSent(true); setLoading(false); return }

    // Signed in but no organisation yet → go create one (then pick a plan).
    window.location.href = '/setup'
  }

  if (emailSent) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500 shadow-lg mb-6">
            <span className="text-3xl">📧</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Check your email</h1>
          <p className="text-sm text-gray-500 mb-6">
            We sent a verification link to <strong>{form.email}</strong>.<br />
            Click the link to verify your account, then come back to sign in.
          </p>
          <p className="text-xs text-gray-400">
            After verifying, you'll set up your organisation and choose a plan.
          </p>
          <Link to="/login" className="mt-6 inline-block text-sm text-amber-600 hover:text-amber-700 font-medium">
            {t('common.back')} {t('auth.login')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500 shadow-lg mb-4">
            <span className="text-3xl">🐔</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{t('auth.createAccount')}</h1>
          <p className="text-sm text-gray-500 mt-1">Step 1 of 3 — create your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.fullName')} *</label>
              <input required type="text" value={form.fullName} onChange={set('fullName')}
                placeholder={t('auth.namePlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.email')} *</label>
              <input required type="email" autoComplete="email" value={form.email} onChange={set('email')}
                placeholder={t('auth.emailPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.password')} *</label>
              <input required type="password" autoComplete="new-password" value={form.password} onChange={set('password')}
                placeholder={t('auth.passwordPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              {form.password && <PasswordStrength password={form.password} />}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.confirmPassword')} *</label>
              <input required type="password" autoComplete="new-password" value={form.confirmPw} onChange={set('confirmPw')}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              {form.confirmPw && form.confirmPw !== form.password && (
                <p className="text-xs text-red-500 mt-1">{t('errors.passwordMismatch')}</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition">
              {loading ? t('auth.creatingAccount') : t('auth.signup')}
            </button>

          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="text-amber-600 hover:text-amber-700 font-medium">{t('auth.login')}</Link>
        </p>
      </div>
    </div>
  )
}
