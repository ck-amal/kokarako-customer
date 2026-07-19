import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'

export default function Signup() {
  const { t } = useTranslation()
  const [fullName, setFullName] = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [step,     setStep]     = useState(1) // 1 = form, 2 = confirm email
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Enter your full name'); return }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setError(''); setLoading(true)
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim() || undefined } },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setStep(2)
  }

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500 shadow-lg mb-4">
            <span className="text-3xl">🐔</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{t('auth.createAccount')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === 1 ? 'Create your account' : 'Check your inbox'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {step === 1 ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.fullName')} *</label>
                <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder={t('auth.namePlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210" autoComplete="tel"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 characters" autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition">
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>

          ) : (

            <div className="text-center space-y-4">
              <p className="text-5xl">📬</p>
              <div>
                <p className="font-semibold text-gray-800 text-base">Confirm your email</p>
                <p className="text-sm text-gray-500 mt-1">
                  We sent a confirmation link to<br />
                  <span className="font-medium text-gray-700">{email}</span>
                </p>
              </div>
              <p className="text-xs text-gray-400">
                Click the link in the email to activate your account. Check your spam folder if you don't see it.
              </p>
              <button type="button" onClick={() => { setStep(1); setError('') }}
                className="text-xs text-gray-400 hover:text-gray-600 block w-full">
                Use a different email
              </button>
            </div>
          )}

        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-amber-600 hover:text-amber-700 font-medium">{t('auth.login')}</Link>
        </p>
      </div>
    </div>
  )
}
