import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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

function AdminLoginOnly() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setErr('')
    const res = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    })
    const data = await res.json()
    if (res.ok && data.token) {
      sessionStorage.setItem('pl_admin_token', data.token)
      window.location.reload()
    } else {
      setErr(data.error || 'Invalid password')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
        <h1 className="text-2xl font-bold text-white mb-4">Admin</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} autoFocus
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white" />
          {err && <div className="text-red-400 text-sm">{err}</div>}
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-lg">Sign In</button>
        </form>
      </div>
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
            <Routes>
              <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/admin" element={sessionStorage.getItem('pl_admin_token') ? <AdminPage /> : <AdminLoginOnly />} />
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
