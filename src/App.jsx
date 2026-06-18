import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DesktopSidebar, MobileHeader } from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Farms from './pages/Farms'
import Batches from './pages/Batches'
import Procurement from './pages/Procurement'
import Stock from './pages/Stock'
import Vendors from './pages/Vendors'
import Sales from './pages/Sales'
import CashCollection from './pages/CashCollection'
import Expenses from './pages/Expenses'
import BatchReport from './pages/BatchReport'
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/farms"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Farms />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/batches"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Batches />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/procurement"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Procurement />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/stock"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Stock />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/vendors"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Vendors />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/sales"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Sales />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/cash-collection"
          element={
            <ProtectedRoute>
              <AppLayout>
                <CashCollection />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/expenses"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Expenses />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/batches/:id/report"
          element={
            <ProtectedRoute>
              <AppLayout>
                <BatchReport />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
