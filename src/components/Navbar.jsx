import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const links = [
  { to: '/dashboard',   label: 'Dashboard' },
  { to: '/farms',       label: 'Farms' },
  { to: '/batches',     label: 'Batches' },
  { to: '/procurement', label: 'Procurement' },
  { to: '/stock',       label: 'Stock' },
  { to: '/vendors',          label: 'Vendors' },
  { to: '/sales',            label: 'Sales' },
  { to: '/cash-collection',  label: 'Cash' },
  { to: '/expenses',         label: 'Expenses' },
]

export default function Navbar() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <nav className="bg-amber-500 text-white px-6 py-3 shadow flex items-center gap-6">
      <span className="text-base font-bold tracking-tight mr-2">🐔 Poultry Manager</span>

      <div className="flex items-center gap-1 flex-1">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-amber-700 text-white'
                  : 'text-amber-100 hover:bg-amber-600'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>

      <button
        onClick={handleLogout}
        className="text-sm bg-amber-600 hover:bg-amber-700 px-4 py-1.5 rounded-lg transition font-medium"
      >
        Logout
      </button>
    </nav>
  )
}
