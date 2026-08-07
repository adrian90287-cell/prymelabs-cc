// Auth header for the now-gated storefront content APIs (products, coa,
// storefront config, reviews). Prefers the logged-in customer's JWT; falls back
// to the admin token so the admin storefront preview keeps working. Returns an
// empty object when neither is present (the request will 401, as intended).
export function authHeaders() {
  try {
    const adminToken = sessionStorage.getItem('pl_admin_token')
    if (adminToken) return { Authorization: `Bearer ${adminToken}` }
    const token = localStorage.getItem('pl_token')
    if (token) return { Authorization: `Bearer ${token}` }
  } catch { /* storage unavailable */ }
  return {}
}
