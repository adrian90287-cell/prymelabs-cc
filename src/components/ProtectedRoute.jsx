import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  // Logged-in admin browsing the storefront should pass through without
  // being redirected to the customer auth page.
  const isAdmin = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('pl_admin_token')

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user && !isAdmin) return <Navigate to="/auth" replace />
  return children
}
