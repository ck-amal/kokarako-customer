import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'

// ─── Nav structure ────────────────────────────────────────────────────────────

const ALL_NAV = [
  // Core — visible to all roles
  { to: '/dashboard',        labelKey: 'nav.dashboard',    icon: '🏠', roles: null },
  { to: '/farms',            labelKey: 'nav.farms',        icon: '🏡', roles: null },
  { to: '/batches',          labelKey: 'nav.batches',      icon: '🐣', roles: null },
  { to: '/sales',            labelKey: 'nav.sales',        icon: '💰', roles: null },

  // Manager+
  { to: '/cash-collection', labelKey: 'nav.cashCollection',icon: '💳', roles: ['owner','manager','accountant'] },
  { to: '/expenses',        labelKey: 'nav.expenses',      icon: '🧾', roles: ['owner','manager','accountant'] },

  // Financial
  { to: '/growing-fees', labelKey: 'nav.growingFees', icon: '🌿', roles: ['owner','manager','accountant'] },

  // Settings
  { to: '/settings/profile', labelKey: 'nav.profile', icon: '👤', roles: null },
]

// Inventory group — Stock visible to all, Procurement/Suppliers owner+manager only
const INVENTORY_GROUP = {
  labelKey: 'nav.inventory',
  label:    'Inventory',
  icon:     '📦',
  children: [
    { to: '/stock',       labelKey: 'nav.stock',       icon: '🗂️',  roles: null },
    { to: '/procurement', labelKey: 'nav.procurement', icon: '🛒',  roles: ['owner','manager'] },
    { to: '/suppliers',   labelKey: 'nav.suppliers',   icon: '🏭',  roles: ['owner','manager'] },
  ],
}

// Reports group
const REPORTS_GROUP = {
  labelKey: 'nav.reports',
  label:    'Reports',
  icon:     '📊',
  children: [
    { to: '/accounts',    labelKey: 'nav.cashBank',  icon: '💵', roles: ['owner','manager','accountant'] },
    { to: '/reports/pl',  labelKey: 'nav.plReport',  icon: '📈', roles: ['owner','manager','accountant'] },
    { to: '/reports/fcr', labelKey: 'nav.fcrReport', icon: '🌾', roles: ['owner','manager','accountant'] },
  ],
}

// Config group — rendered separately as a collapsible submenu
const CONFIG_GROUP = {
  labelKey: 'nav.config',
  label:    'Config',
  icon:     '⚙️',
  children: [
    { to: '/settings/catalog',     labelKey: 'nav.itemCatalog', icon: '📋', roles: ['owner','manager'] },
    { to: '/settings/growing-fee', labelKey: 'nav.feeConfig',   icon: '🔧', roles: ['owner'] },
  ],
}

function roleAllowed(roles, userRole) {
  if (!roles) return true
  if (!userRole) return false
  return roles.includes(userRole)
}

// ─── Components ───────────────────────────────────────────────────────────────

function NavItem({ to, label, icon, onClick, sub = false }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl text-sm font-medium transition-all ${
          sub ? 'px-3 py-2' : 'px-3 py-2.5'
        } ${
          isActive
            ? 'bg-amber-500 text-white shadow-sm'
            : 'text-gray-600 hover:bg-amber-50 hover:text-amber-700'
        }`
      }
    >
      <span className={`text-base w-5 text-center leading-none ${sub ? 'text-sm' : ''}`}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

function NavGroup({ group, userRole, onChildClick }) {
  const { t }    = useTranslation()
  const location = useLocation()

  const visibleChildren = group.children.filter(c => roleAllowed(c.roles, userRole))
  if (visibleChildren.length === 0) return null

  const isAnyChildActive = visibleChildren.some(c => location.pathname.startsWith(c.to))
  const [open, setOpen]  = useState(isAnyChildActive)

  useEffect(() => {
    if (isAnyChildActive) setOpen(true)
  }, [location.pathname])

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isAnyChildActive
            ? 'bg-amber-50 text-amber-700'
            : 'text-gray-600 hover:bg-amber-50 hover:text-amber-700'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-base w-5 text-center leading-none">{group.icon}</span>
          <span>{t(group.labelKey, { defaultValue: group.label })}</span>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-0.5 ml-4 pl-3 border-l-2 border-amber-100 space-y-0.5">
          {visibleChildren.map(child => (
            <NavItem
              key={child.to}
              to={child.to}
              label={t(child.labelKey)}
              icon={child.icon}
              onClick={onChildClick}
              sub
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Read-only banner ──────────────────────────────────────────────────────────

function RoleBanner({ userRole }) {
  if (userRole === 'accountant') return (
    <div className="mx-3 mb-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
      📊 Read-only access to financial data
    </div>
  )
  if (userRole === 'viewer') return (
    <div className="mx-3 mb-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
      👁 View-only access
    </div>
  )
  return null
}

// ─── Shared nav renderer ──────────────────────────────────────────────────────

function NavList({ userRole, onItemClick }) {
  const { t } = useTranslation()
  const filteredNav = ALL_NAV.filter(item => roleAllowed(item.roles, userRole))

  // Split: items before profile (all main items), profile last
  const mainItems    = filteredNav.filter(i => i.to !== '/settings/profile')
  const profileItem  = filteredNav.find(i => i.to === '/settings/profile')

  return (
    <>
      <div className="space-y-0.5">
        {mainItems.map(item => (
          <NavItem key={item.to} to={item.to} label={t(item.labelKey)} icon={item.icon} onClick={onItemClick} />
        ))}
        <NavGroup group={INVENTORY_GROUP} userRole={userRole} onChildClick={onItemClick} />
        <NavGroup group={REPORTS_GROUP}   userRole={userRole} onChildClick={onItemClick} />
        <NavGroup group={CONFIG_GROUP}    userRole={userRole} onChildClick={onItemClick} />
      </div>
      {profileItem && (
        <div className="mt-auto pt-2 border-t border-gray-100">
          <NavItem to={profileItem.to} label={t(profileItem.labelKey)} icon={profileItem.icon} onClick={onItemClick} />
        </div>
      )}
    </>
  )
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

export function DesktopSidebar() {
  const { organization, userRole } = useAuth()

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-gray-100 min-h-screen sticky top-0 h-screen">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center text-white text-base shrink-0">
            🐔
          </div>
          <div className="min-w-0">
            <span className="font-bold text-gray-800 text-sm leading-tight block truncate">
              {organization?.name || 'Kokarako'}
            </span>
            <span className="text-xs text-gray-400 leading-tight block">Kokarako</span>
          </div>
        </div>
      </div>

      {/* Role banner */}
      <div className="pt-3">
        <RoleBanner userRole={userRole} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-4 overflow-y-auto flex flex-col">
        <NavList userRole={userRole} />
      </nav>
    </aside>
  )
}

// ─── Mobile header + drawer ───────────────────────────────────────────────────

export function MobileHeader() {
  const [open, setOpen] = useState(false)
  const location        = useLocation()
  const { t }           = useTranslation()
  const { organization, userRole } = useAuth()

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Find current page label from flat nav + config children
  const allFlat = [
    ...ALL_NAV,
    ...INVENTORY_GROUP.children,
    ...REPORTS_GROUP.children,
    ...CONFIG_GROUP.children,
  ]
  const currentPage = allFlat.find(n => location.pathname.startsWith(n.to))?.labelKey ?? null

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-amber-500 flex items-center justify-center text-sm">🐔</div>
          <span className="font-semibold text-gray-800 text-sm">
            {currentPage ? t(currentPage) : 'Kokarako'}
          </span>
        </div>
        <button onClick={() => setOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 transition" aria-label="Open menu">
          <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {open && <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />}

      <div className={`lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-xl transform transition-transform duration-200 ease-in-out flex flex-col ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center text-white text-base">🐔</div>
            <span className="font-bold text-gray-800 text-sm truncate max-w-[140px]">{organization?.name || 'Kokarako'}</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <RoleBanner userRole={userRole} />

        <nav className="flex-1 px-3 py-4 overflow-y-auto flex flex-col">
          <NavList userRole={userRole} onItemClick={() => setOpen(false)} />
        </nav>
      </div>
    </>
  )
}
