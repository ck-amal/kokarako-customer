import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const ROLE_LABELS = {
  owner:           { label: 'Owner',           color: 'bg-gray-800 text-white' },
  manager:         { label: 'Manager',         color: 'bg-blue-100 text-blue-700' },
  farm_supervisor: { label: 'Farm Supervisor', color: 'bg-green-100 text-green-700' },
  accountant:      { label: 'Accountant',      color: 'bg-amber-100 text-amber-700' },
  viewer:          { label: 'Viewer',          color: 'bg-gray-100 text-gray-600' },
}

export default function OrgSelector() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, selectOrganization } = useAuth()
  const [orgs,    setOrgs]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('organization_users')
      .select('organization_id, role, organizations(id, name, is_active)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .then(({ data }) => {
        setOrgs(data || [])
        setLoading(false)
      })
  }, [user])

  async function handleSelect(orgId) {
    await selectOrganization(orgId)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500 shadow-lg mb-4">
            <span className="text-3xl">🐔</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{t('org.selectOrg')}</h1>
          <p className="text-sm text-gray-500 mt-1">You belong to multiple organisations. Choose one to continue.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {orgs.map(row => {
              const org  = row.organizations
              const role = ROLE_LABELS[row.role] || { label: row.role, color: 'bg-gray-100 text-gray-600' }
              return (
                <button
                  key={org.id}
                  onClick={() => handleSelect(org.id)}
                  className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-left hover:border-amber-400 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">{org.name}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${role.color}`}>{role.label}</span>
                  </div>
                  {!org.is_active && (
                    <p className="text-xs text-red-500 mt-2">⚠ This organisation is currently inactive</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
