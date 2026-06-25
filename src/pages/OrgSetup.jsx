import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export default function OrgSetup() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, refreshOrg, signOut } = useAuth()
  const [mode,    setMode]    = useState('') // 'create' | 'join'
  const [token,   setToken]   = useState('')
  const [name,    setName]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) { setError(t('errors.required')); return }
    setLoading(true); setError('')

    const { error: orgErr } = await supabase.rpc('create_organization', {
      p_name:          name.trim(),
      p_business_name: name.trim(),
      p_user_id:       user.id,
    })
    if (orgErr) { setError(orgErr.message); setLoading(false); return }

    // Full reload so AuthContext reinitialises and picks up the new org
    window.location.href = '/dashboard'
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!token.trim()) { setError('Enter your invitation token'); return }
    setLoading(true); setError('')

    const { data: inv, error: invErr } = await supabase
      .from('invitations')
      .select('id, organization_id, role, expires_at, accepted_at, email')
      .eq('token', token.trim())
      .single()

    if (invErr || !inv) { setError('Invalid invitation token'); setLoading(false); return }
    if (inv.accepted_at) { setError('This invitation has already been accepted'); setLoading(false); return }
    if (new Date(inv.expires_at) < new Date()) { setError('This invitation has expired. Ask the owner to resend it.'); setLoading(false); return }

    const { error: ouErr } = await supabase
      .from('organization_users')
      .insert({ organization_id: inv.organization_id, user_id: user.id, role: inv.role })
    if (ouErr) { setError(ouErr.message); setLoading(false); return }

    await supabase.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id)
    await refreshOrg()
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500 shadow-lg mb-4">
            <span className="text-3xl">🐔</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{t('org.setup')}</h1>
          <p className="text-sm text-gray-500 mt-1">Create a new organisation or join one with an invite</p>
        </div>

        {!mode && (
          <div className="space-y-3">
            <button onClick={() => setMode('create')}
              className="w-full bg-white rounded-2xl border-2 border-amber-400 p-5 text-left hover:bg-amber-50 transition">
              <p className="font-semibold text-gray-800">🏢 {t('org.createOrg')}</p>
              <p className="text-sm text-gray-500 mt-1">Start fresh — you'll be the owner</p>
            </button>
            <button onClick={() => setMode('join')}
              className="w-full bg-white rounded-2xl border border-gray-200 p-5 text-left hover:border-amber-400 transition">
              <p className="font-semibold text-gray-800">📨 {t('org.joinOrg')}</p>
              <p className="text-sm text-gray-500 mt-1">Enter your invitation token manually</p>
            </button>
            <button onClick={signOut} className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition">
              {t('auth.logout')}
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="font-semibold text-gray-800 mb-4">{t('org.createOrg')}</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('auth.businessName')} *</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. ABC Poultry Farm"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setMode(''); setError('') }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">{t('common.back')}</button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2 text-sm transition">
                  {loading ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        )}

        {mode === 'join' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="font-semibold text-gray-800 mb-4">{t('org.joinOrg')}</h2>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Invitation Token *</label>
                <input required type="text" value={token} onChange={e => setToken(e.target.value)}
                  placeholder="Paste your token here"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
                <p className="text-xs text-gray-400 mt-1">Found in the invitation email you received</p>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setMode(''); setError('') }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">{t('common.back')}</button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2 text-sm transition">
                  {loading ? t('common.loading') : t('common.confirm')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
