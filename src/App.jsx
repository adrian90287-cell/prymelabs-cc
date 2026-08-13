import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'
import PhoneVerificationPrompt from './components/PhoneVerificationPrompt'

const APP_BUILD_ID = '2026-08-08-restore-homepage-paint'

// Route-level code splitting — each page only downloads when a visitor
// actually navigates to it, instead of every visitor downloading every
// page's code up front. AdminPage alone is ~6,000 lines used only by the
// site owner, so this meaningfully shrinks what a customer has to fetch
// before the storefront can render.
const AuthPage          = lazy(() => import('./pages/AuthPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const HomePage          = lazy(() => import('./pages/HomePage'))
const ShopPage          = lazy(() => import('./pages/ShopPage'))
const CollectionPage    = lazy(() => import('./pages/CollectionPage'))
const CheckoutPage      = lazy(() => import('./pages/CheckoutPage'))
const OrderConfirmPage  = lazy(() => import('./pages/OrderConfirmPage'))
const OrderHistoryPage  = lazy(() => import('./pages/OrderHistoryPage'))
const OrderTrackingPage = lazy(() => import('./pages/OrderTrackingPage'))
const AdminPage         = lazy(() => import('./pages/AdminPage'))
const CompliancePage    = lazy(() => import('./pages/CompliancePage'))

function PageFallback() {
  return (
    <div data-build={APP_BUILD_ID} className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function GlobalPhoneVerificationPrompt() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/admin')) return null
  return <PhoneVerificationPrompt />
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <ScrollToTop />
            <GlobalPhoneVerificationPrompt />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/collections/:deptSlug" element={<CollectionPage />} />
                <Route path="/collections/:deptSlug/:colSlug" element={<CollectionPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/order-confirmation" element={<OrderConfirmPage />} />
                <Route path="/orders" element={<ProtectedRoute><OrderHistoryPage /></ProtectedRoute>} />
                <Route path="/track" element={<OrderTrackingPage />} />
                <Route path="/compliance" element={<CompliancePage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}
