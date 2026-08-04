import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import AgeGate from './components/AgeGate'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'

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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <AgeGate />
            <ScrollToTop />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/shop" element={<ProtectedRoute><ShopPage /></ProtectedRoute>} />
                <Route path="/collections/:deptSlug" element={<ProtectedRoute><CollectionPage /></ProtectedRoute>} />
                <Route path="/collections/:deptSlug/:colSlug" element={<ProtectedRoute><CollectionPage /></ProtectedRoute>} />
                <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
                <Route path="/order-confirmation" element={<ProtectedRoute><OrderConfirmPage /></ProtectedRoute>} />
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
