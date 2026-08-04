// Accepts EITHER the legacy plaintext-password scheme (Bearer admin:<ADMIN_PASSWORD>)
// or a valid JWT issued by /api/admin/session (Bearer <jwt>), verified via adminAuth.js.
// This lets older endpoints keep working during the migration to JWT-only auth
// without depending on the client keeping two separate credentials in sync.
import { verifyAdminToken } from './adminAuth.js';

export async function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (auth === `Bearer admin:${env.ADMIN_PASSWORD}`) return true;
  const result = await verifyAdminToken(request, env);
  return result.valid;
}
