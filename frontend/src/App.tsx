import { lazyWithRetry } from './lib/lazyWithRetry';
import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { Toaster } from './components/ui/sonner'
import ConfirmHost from './components/ConfirmDialog'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DriverAuthProvider, useDriverAuth } from './contexts/DriverAuthContext'
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext'
import { SocketProvider } from './contexts/SocketContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProGate from './components/ProGate'
import FunzioneGate from './components/FunzioneGate'
import './App.css'

const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'))
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'))
const RegisterPage = lazyWithRetry(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazyWithRetry(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'))
const VerifyEmailPage = lazyWithRetry(() => import('./pages/VerifyEmail'))
const QuickAddPage = lazyWithRetry(() => import('./pages/QuickAdd'))
const DockPage = lazyWithRetry(() => import('./pages/DockPage'))
const PublicTrackingPage = lazyWithRetry(() => import('./pages/PublicTracking'))
const PharmacyDashboard = lazyWithRetry(() => import('./pages/pharmacy/Dashboard'))
const CustomersPage = lazyWithRetry(() => import('./pages/pharmacy/Customers'))
const DeliveriesPage = lazyWithRetry(() => import('./pages/pharmacy/Deliveries'))
const DriversPage = lazyWithRetry(() => import('./pages/pharmacy/Drivers'))
const ChatPage = lazyWithRetry(() => import('./pages/pharmacy/Chat'))
const ArchivePage = lazyWithRetry(() => import('./pages/pharmacy/Archive'))
const SettingsPage = lazyWithRetry(() => import('./pages/pharmacy/Settings'))
import TrackingPage from './pages/pharmacy/Tracking'
const ReportsPage = lazyWithRetry(() => import('./pages/pharmacy/Reports'))
const DoctorsPage = lazyWithRetry(() => import('./pages/pharmacy/Doctors'))
const UsefulNumbersPage = lazyWithRetry(() => import('./pages/pharmacy/UsefulNumbers'))
const NotesPage = lazyWithRetry(() => import('./pages/pharmacy/Notes'))
const ShiftsPage = lazyWithRetry(() => import('./pages/pharmacy/Shifts'))
const IntegrationsPage = lazyWithRetry(() => import('./pages/pharmacy/Integrations'))
const DriverLogin = lazyWithRetry(() => import('./pages/driver/Login'))
const DriverDashboard = lazyWithRetry(() => import('./pages/driver/Dashboard'))
const DriverDeliveryDetail = lazyWithRetry(() => import('./pages/driver/DeliveryDetail'))
const DriverChat = lazyWithRetry(() => import('./pages/driver/Chat'))
const AdminLoginPage = lazyWithRetry(() => import('./pages/admin/Login'))
const AdminDashboardPage = lazyWithRetry(() => import('./pages/admin/Dashboard'))

const FullscreenLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="spinner" />
  </div>
)

const SECRET_ADMIN_LOGIN_PATH = '/console-federico'
const SECRET_ADMIN_DASHBOARD_PATH = '/console-federico/dashboard'

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<FullscreenLoader />}>{children}</Suspense>
)

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth() as any
  const location = useLocation()

  if (loading) return <FullscreenLoader />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return (
    <SocketProvider userId={user.user_id} userType="pharmacy" settings={user.settings}>
      {children}
    </SocketProvider>
  )
}

const DriverProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { driver, loading } = useDriverAuth() as any
  const location = useLocation()

  if (loading) return <FullscreenLoader />
  if (!driver) return <Navigate to="/driver/login" state={{ from: location }} replace />

  return <SocketProvider userId={driver.driver_id} userType="driver">{children}</SocketProvider>
}

const AdminProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { admin, loading } = useAdminAuth() as any
  const location = useLocation()
  const loginPath = location.pathname.startsWith(SECRET_ADMIN_LOGIN_PATH) ? SECRET_ADMIN_LOGIN_PATH : '/admin/login'

  if (loading) return <FullscreenLoader />
  if (!admin) return <Navigate to={loginPath} state={{ from: location }} replace />

  return <>{children}</>
}

const PharmacyPublicPage = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <PageShell>{children}</PageShell>
  </AuthProvider>
)

const PharmacyProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <ProtectedRoute>
      <PageShell>{children}</PageShell>
    </ProtectedRoute>
  </AuthProvider>
)

const DriverPublicPage = ({ children }: { children: React.ReactNode }) => (
  <DriverAuthProvider>
    <PageShell>{children}</PageShell>
  </DriverAuthProvider>
)

const DriverProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <DriverAuthProvider>
    <DriverProtectedRoute>
      <PageShell>{children}</PageShell>
    </DriverProtectedRoute>
  </DriverAuthProvider>
)

const AdminPublicPage = ({ children }: { children: React.ReactNode }) => (
  <AdminAuthProvider>
    <PageShell>{children}</PageShell>
  </AdminAuthProvider>
)

const AdminProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <AdminAuthProvider>
    <AdminProtectedRoute>
      <PageShell>{children}</PageShell>
    </AdminProtectedRoute>
  </AdminAuthProvider>
)

const AppRouter = () => (
  <Routes>
    <Route path="/" element={<PageShell><LandingPage /></PageShell>} />
    <Route path="/login" element={<PharmacyPublicPage><LoginPage /></PharmacyPublicPage>} />
    <Route path="/register" element={<PharmacyPublicPage><RegisterPage /></PharmacyPublicPage>} />
    <Route path="/forgot-password" element={<PharmacyPublicPage><ForgotPasswordPage /></PharmacyPublicPage>} />
    <Route path="/reset-password" element={<PharmacyPublicPage><ResetPasswordPage /></PharmacyPublicPage>} />
    <Route path="/verify-email" element={<PharmacyPublicPage><VerifyEmailPage /></PharmacyPublicPage>} />
    <Route path="/dashboard" element={<PharmacyProtectedPage><PharmacyDashboard /></PharmacyProtectedPage>} />
    <Route path="/customers" element={<PharmacyProtectedPage><CustomersPage /></PharmacyProtectedPage>} />
    <Route path="/deliveries" element={<PharmacyProtectedPage><DeliveriesPage /></PharmacyProtectedPage>} />
    <Route path="/tracking" element={<PharmacyProtectedPage><ProGate funzione="tracking_live"><TrackingPage /></ProGate></PharmacyProtectedPage>} />
    <Route path="/quick" element={<PharmacyProtectedPage><QuickAddPage /></PharmacyProtectedPage>} />
    <Route path="/dock" element={<PharmacyProtectedPage><DockPage /></PharmacyProtectedPage>} />
    <Route path="/t/:token" element={<PublicTrackingPage />} />
    <Route path="/drivers" element={<PharmacyProtectedPage><DriversPage /></PharmacyProtectedPage>} />
    <Route path="/chat" element={<PharmacyProtectedPage><FunzioneGate funzione="chat"><ChatPage /></FunzioneGate></PharmacyProtectedPage>} />
    <Route path="/chat/:driverId" element={<PharmacyProtectedPage><FunzioneGate funzione="chat"><ChatPage /></FunzioneGate></PharmacyProtectedPage>} />
    <Route path="/archive" element={<PharmacyProtectedPage><ArchivePage /></PharmacyProtectedPage>} />
    <Route path="/reports" element={<PharmacyProtectedPage><ProGate funzione="report_avanzati"><ReportsPage /></ProGate></PharmacyProtectedPage>} />
    <Route path="/doctors" element={<PharmacyProtectedPage><FunzioneGate funzione="medici"><DoctorsPage /></FunzioneGate></PharmacyProtectedPage>} />
    <Route path="/useful-numbers" element={<PharmacyProtectedPage><FunzioneGate funzione="numeri_utili"><UsefulNumbersPage /></FunzioneGate></PharmacyProtectedPage>} />
    <Route path="/notes" element={<PharmacyProtectedPage><FunzioneGate funzione="block_notes"><NotesPage /></FunzioneGate></PharmacyProtectedPage>} />
    <Route path="/shifts" element={<PharmacyProtectedPage><ProGate funzione="turni_cassa"><ShiftsPage /></ProGate></PharmacyProtectedPage>} />
    <Route path="/integrations" element={<PharmacyProtectedPage><IntegrationsPage /></PharmacyProtectedPage>} />
    <Route path="/settings" element={<PharmacyProtectedPage><SettingsPage /></PharmacyProtectedPage>} />
    <Route path="/driver/login" element={<DriverPublicPage><DriverLogin /></DriverPublicPage>} />
    <Route path="/driver" element={<DriverProtectedPage><DriverDashboard /></DriverProtectedPage>} />
    <Route path="/driver/delivery/:deliveryId" element={<DriverProtectedPage><DriverDeliveryDetail /></DriverProtectedPage>} />
    <Route path="/driver/chat" element={<DriverProtectedPage><DriverChat /></DriverProtectedPage>} />
    <Route path="/admin/login" element={<AdminPublicPage><AdminLoginPage /></AdminPublicPage>} />
    <Route path={SECRET_ADMIN_LOGIN_PATH} element={<AdminPublicPage><AdminLoginPage /></AdminPublicPage>} />
    <Route path="/admin" element={<AdminProtectedPage><AdminDashboardPage /></AdminProtectedPage>} />
    <Route path={SECRET_ADMIN_DASHBOARD_PATH} element={<AdminProtectedPage><AdminDashboardPage /></AdminProtectedPage>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
)

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ErrorBoundary>
            <AppRouter />
            <Toaster position="top-right" richColors />
            <ConfirmHost />
          </ErrorBoundary>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}

export default App
