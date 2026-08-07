import { createContext, useContext, useState, useEffect } from 'react'
import { invalidateProductCatalog } from '../hooks/useProductCatalog'

const AuthContext = createContext(null)

// Decode JWT payload and check exp claim — no library required
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    )
    return !!(payload.exp && Date.now() / 1000 > payload.exp)
  } catch {
    return true // malformed token — treat as expired
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('pl_token')
    const savedUser  = localStorage.getItem('pl_user')
    if (savedToken && savedUser) {
      try {
        if (isTokenExpired(savedToken)) {
          // Token is expired — clear it so the user is redirected to login
          localStorage.removeItem('pl_token')
          localStorage.removeItem('pl_user')
        } else {
          setToken(savedToken)
          setUser(JSON.parse(savedUser))
        }
      } catch {
        localStorage.removeItem('pl_token')
        localStorage.removeItem('pl_user')
      }
    }
    setLoading(false)
  }, [])

  const login = (tokenValue, userValue) => {
    invalidateProductCatalog()
    localStorage.setItem('pl_token', tokenValue)
    localStorage.setItem('pl_user', JSON.stringify(userValue))
    sessionStorage.removeItem('pl_peptide_ack')
    setToken(tokenValue)
    setUser(userValue)
    // Sync language preference from server on login
    if (userValue.lang && ['en', 'es'].includes(userValue.lang)) {
      localStorage.setItem('pl_lang', userValue.lang)
      window.dispatchEvent(new Event('pl_lang_change'))
    }
  }

  const updateSession = (tokenValue, userValue) => {
    if (tokenValue) {
      localStorage.setItem('pl_token', tokenValue)
      setToken(tokenValue)
    }
    if (userValue) {
      localStorage.setItem('pl_user', JSON.stringify(userValue))
      setUser(userValue)
    }
  }

  const logout = () => {
    invalidateProductCatalog()
    localStorage.removeItem('pl_token')
    localStorage.removeItem('pl_user')
    sessionStorage.removeItem('pl_peptide_ack')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
