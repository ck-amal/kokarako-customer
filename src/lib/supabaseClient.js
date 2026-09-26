import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let _currentOrgId = null
export function setCurrentOrgId(orgId) { _currentOrgId = orgId ?? null }

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      const headers = { ...options.headers }
      if (_currentOrgId) headers['x-org-id'] = _currentOrgId
      return fetch(url, { ...options, headers })
    },
  },
})
