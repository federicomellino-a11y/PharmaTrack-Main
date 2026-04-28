import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from './components/ui/sonner'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DriverAuthProvider, useDriverAuth } from './contexts/DriverAuthContext'
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext'
import { SocketProvider } from './contexts/SocketContext'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail'))
const PharmacyDashboard = lazy(() => import('./pages/pharmacy/Dashboard'))
const CustomersPage = lazy(() => import('./pages/pharmacy/Customers'))
const DeliveriesPage = lazy(() => import('./pages/pharmacy/Deliveries'))
const DriversPage = lazy(() => import('./pages/pharmacy/Drivers'))
const ChatPage = lazy(() => import('./pages/pharmacy/Chat'))
const ArchivePage = lazy(() => import('./pages/pharmacy/Archive'))
const SettingsPage = lazy(() => import('./pages/pharmacy/Settings'))
const TrackingPage = lazy(() => import('./pages/pharmacy/Tracking'))
const ReportsPage = lazy(() => import('./pages/pharmacy/Reports'))
const DoctorsPage = lazy(() => import('./pages/pharmacy/Doctors'))
const UsefulNumbersPage = lazy(() => import('./pages/pharmacy/UsefulNumbers'))
const NotesPage = lazy(() => import('./pages/pharmacy/Notes'))
const ShiftsPage = lazy(() => import('./pages/pharmacy/Shifts'))
const DriverLogin = lazy(() => import('./pages/driver/Login'))
const DriverDashboard = lazy(() => import('./pages/driver/Dashboard'))
const DriverDeliveryDetail = lazy(() => import('./pages/driver/DeliveryDetail'))
const DriverChat = lazy(() => import('./pages/driver/Chat'))
const AdminLoginPage = lazy(() => import('./pages/admin/Login'))
const AdminDashboardPage = lazy(() => import('./pages/admin/Dashboard'))

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
    <Route path="/tracking" element={<PharmacyProtectedPage><TrackingPage /></PharmacyProtectedPage>} />
    <Route path="/drivers" element={<PharmacyProtectedPage><DriversPage /></PharmacyProtectedPage>} />
    <Route path="/chat" element={<PharmacyProtectedPage><ChatPage /></PharmacyProtectedPage>} />
    <Route path="/chat/:driverId" element={<PharmacyProtectedPage><ChatPage /></PharmacyProtectedPage>} />
    <Route path="/archive" element={<PharmacyProtectedPage><ArchivePage /></PharmacyProtectedPage>} />
    <Route path="/reports" element={<PharmacyProtectedPage><ReportsPage /></PharmacyProtectedPage>} />
    <Route path="/doctors" element={<PharmacyProtectedPage><DoctorsPage /></PharmacyProtectedPage>} />
    <Route path="/useful-numbers" element={<PharmacyProtectedPage><UsefulNumbersPage /></PharmacyProtectedPage>} />
    <Route path="/notes" element={<PharmacyProtectedPage><NotesPage /></PharmacyProtectedPage>} />
    <Route path="/shifts" element={<PharmacyProtectedPage><ShiftsPage /></PharmacyProtectedPage>} />
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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <ErrorBoundary>
          <AppRouter />
          <Toaster position="top-right" richColors />
        </ErrorBoundary>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
