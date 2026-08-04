import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import AgeGate from './components/AgeGate'
import ProtectedRoute from './components/ProtectedRoute'
import AuthPage from './pages/AuthPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import HomePage from './pages/HomePage'
import ShopPage from './pages/ShopPage'
import CollectionPage from './pages/CollectionPage'
import CheckoutPage from './pages/CheckoutPage'
import OrderConfirmPage from './pages/OrderConfirmPage'
import OrderHistoryPage from './pages/OrderHistoryPage'
import OrderTrackingPage from './pages/OrderTrackingPage'
import AdminPage from './pages/AdminPage'
import CompliancePage from './pages/CompliancePage'
import ScrollToTop from './components/ScrollToTop'

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <AgeGate />
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/test" element={<div className="flex items-center justify-center min-h-screen text-white text-4xl">TEST ROUTE WORKS</div>} />
              <Route path="/shop" element={<ProtectedRoute><ShopPage /></ProtectedRoute>} />
              <Route path="/collections/:deptSlug" element={<ProtectedRoute><CollectionPage /></ProtectedRoute>} />
              <Route path="/collections/:deptSlug/:colSlug" element={<ProtectedRoute><CollectionPage /></ProtectedRoute>} />
              <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
              <Route path="/order-confirmation" element={<ProtectedRoute><OrderConfirmPage /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute><OrderHistoryPage /></ProtectedRoute>} />
              <Route path="/track" element={<OrderTrackingPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}
