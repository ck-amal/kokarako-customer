import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DesktopSidebar, MobileHeader } from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'

// Public pages
import Login        from './pages/Login'
import Signup       from './pages/Signup'
import OrgSetup     from './pages/OrgSetup'
import OrgSelector  from './pages/OrgSelector'
import InviteAccept from './pages/InviteAccept'

// Protected pages
import Dashboard       from './pages/Dashboard'
import Farms           from './pages/Farms'
import Batches         from './pages/Batches'
import Procurement     from './pages/Procurement'
import Stock           from './pages/Stock'
import Vendors         from './pages/Vendors'
import Sales           from './pages/Sales'
import CashCollection  from './pages/CashCollection'
import Expenses        from './pages/Expenses'
import BatchReport     from './pages/BatchReport'
import FarmDetail      from './pages/FarmDetail'
import BatchDetail     from './pages/BatchDetail'
import CatalogSettings from './pages/CatalogSettings'
import Suppliers       from './pages/Suppliers'
import SupplierDetail  from './pages/SupplierDetail'
import AccountsPage    from './pages/AccountsPage'
import PLReport        from './pages/PLReport'
import FCRReport       from './pages/FCRReport'
import GrowingFees         from './pages/GrowingFees'
import GrowingFeeSettings  from './pages/GrowingFeeSettings'
import TeamSettings        from './pages/TeamSettings'
import OrgSettings         from './pages/OrgSettings'
import Profile             from './pages/Profile'

import './index.css'

function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <DesktopSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

function P({ children }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Public ──────────────────────────────────────────────────── */}
        <Route path="/login"          element={<Login />} />
        <Route path="/signup"         element={<Signup />} />
        <Route path="/setup"          element={<OrgSetup />} />
        <Route path="/select-org"     element={<OrgSelector />} />
        <Route path="/invite/:token"  element={<InviteAccept />} />

        {/* ── Protected ───────────────────────────────────────────────── */}
        <Route path="/dashboard"       element={<P><Dashboard /></P>} />
        <Route path="/farms"           element={<P><Farms /></P>} />
        <Route path="/farms/:id"       element={<P><FarmDetail /></P>} />
        <Route path="/farms/:farmId/batches/:batchId" element={<P><BatchDetail /></P>} />
        <Route path="/batches"         element={<P><Batches /></P>} />
        <Route path="/batches/:id/report" element={<P><BatchReport /></P>} />
        <Route path="/procurement"     element={<P><Procurement /></P>} />
        <Route path="/stock"           element={<P><Stock /></P>} />
        <Route path="/vendors"         element={<P><Vendors /></P>} />
        <Route path="/sales"           element={<P><Sales /></P>} />
        <Route path="/cash-collection" element={<P><CashCollection /></P>} />
        <Route path="/expenses"        element={<P><Expenses /></P>} />
        <Route path="/suppliers"       element={<P><Suppliers /></P>} />
        <Route path="/suppliers/:id"   element={<P><SupplierDetail /></P>} />
        <Route path="/accounts"        element={<P><AccountsPage /></P>} />
        <Route path="/reports/pl"      element={<P><PLReport /></P>} />
        <Route path="/reports/fcr"     element={<P><FCRReport /></P>} />
        <Route path="/growing-fees"    element={<P><GrowingFees /></P>} />

        {/* Settings */}
        <Route path="/settings/catalog"      element={<P><CatalogSettings /></P>} />
        <Route path="/settings/growing-fee"  element={<P><GrowingFeeSettings /></P>} />
        <Route path="/settings/team"         element={<P><TeamSettings /></P>} />
        <Route path="/settings/organization" element={<P><OrgSettings /></P>} />
        <Route path="/settings/profile"      element={<P><Profile /></P>} />

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
