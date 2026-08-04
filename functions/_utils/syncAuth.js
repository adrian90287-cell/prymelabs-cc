// Server-to-server auth for the cross-site sync endpoints (the UNIFIED_DB /
// prymelabs.store integration). Requires a Bearer token that matches
// env.SYNC_SECRET. DEFAULT-DENY: if SYNC_SECRET isn't configured, every request
// is refused — an unset secret must never mean "open". Uses a length-safe,
// constant-time comparison to avoid leaking the secret via timing.
export function isSyncAuthed(request, env) {
  const secret = env.SYNC_SECRET
  if (!secret) return false
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer ')) return false
  const token = header.slice(7)
  if (typeof token !== 'string' || token.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i)
  return diff === 0
}
