import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const NAV = [
  { to: '/dashboard',        label: 'Dashboard',       icon: '🏠' },
  { to: '/farms',            label: 'Farms',           icon: '🏡' },
  { to: '/batches',          label: 'Batches',         icon: '🐣' },
  { to: '/procurement',      label: 'Procurement',     icon: '🛒' },
  { to: '/suppliers',        label: 'Suppliers',       icon: '🏭' },
  { to: '/stock',            label: 'Stock',           icon: '📦' },
  { to: '/vendors',          label: 'Vendors',         icon: '🤝' },
  { to: '/sales',            label: 'Sales',           icon: '💰' },
  { to: '/cash-collection',  label: 'Cash Collection', icon: '💳' },
  { to: '/expenses',         label: 'Expenses',        icon: '🧾' },
  { to: '/accounts',         label: 'Cash & Bank',     icon: '💵' },
  { to: '/reports/pl',       label: 'P&L Report',      icon: '📊' },
  { to: '/settings/catalog', label: 'Item Catalog',    icon: '⚙️' },
]

function NavItem({ to, label, icon, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isActive
            ? 'bg-amber-500 text-white shadow-sm'
            : 'text-gray-600 hover:bg-amber-50 hover:text-amber-700'
        }`
      }
    >
      <span className="text-base w-5 text-center leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

// ─── Desktop sidebar (always visible ≥ lg) ───────────────────────────────────

export function DesktopSidebar() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-gray-100 min-h-screen sticky top-0 h-screen">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center text-white text-base shrink-0">
            🐔
          </div>
          <span className="font-bold text-gray-800 text-sm leading-tight">Poultry<br />Manager</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <span className="text-base w-5 text-center">🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

// ─── Mobile header + drawer ───────────────────────────────────────────────────

export function MobileHeader() {
  const [open, setOpen]   = useState(false)
  const navigate          = useNavigate()
  const location          = useLocation()

  // Close drawer on route change
  useEffect(() => { setOpen(false) }, [location.pathname])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const currentPage = NAV.find(n => location.pathname.startsWith(n.to))?.label ?? 'Poultry Manager'

  return (
    <>
      {/* Top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-amber-500 flex items-center justify-center text-sm">🐔</div>
          <span className="font-semibold text-gray-800 text-sm">{currentPage}</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
          aria-label="Open menu"
        >
          {/* Hamburger icon */}
          <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={`lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-xl transform transition-transform duration-200 ease-in-out flex flex-col ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Drawer header */}
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center text-white text-base">🐔</div>
            <span className="font-bold text-gray-800 text-sm">Poultry Manager</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600"
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <NavItem key={item.to} {...item} onClick={() => setOpen(false)} />
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <span className="text-base w-5 text-center">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  )
}
