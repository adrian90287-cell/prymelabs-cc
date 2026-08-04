import { verifyJWT } from './jwt.js'

// Gate for storefront CONTENT endpoints (catalog, prices, certificates, config).
// Access requires either a valid customer JWT (logged-in customer) or the admin
// password bearer (so the admin storefront preview keeps working). This is the
// server-side enforcement behind the client-side ProtectedRoute — the login
// screen alone is not real security; this is.
export async function isContentAuthed(request, env) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return false
  const token = auth.slice(7)
  if (env.ADMIN_PASSWORD && token === `admin:${env.ADMIN_PASSWORD}`) return true
  const payload = await verifyJWT(token, env.JWT_SECRET)
  return !!payload
}
