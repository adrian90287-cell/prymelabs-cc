// TEMPORARY diagnostic endpoint — verifies the OneDrive connection is live
// by writing one small file to a clearly-separate test folder, then reports
// success/failure as JSON. Removed after the check.
import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { json } from '../../_utils/cors.js'
import { uploadToOneDrive } from '../../_utils/onedrive.js'

export async function onRequestGet({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  const result = await uploadToOneDrive(env, {
    folderPath: 'prymelabs-cc/_diagnostics',
    filename: `connectivity-check-${Date.now()}.txt`,
    content: `OneDrive connectivity check — ${new Date().toISOString()}`,
    contentType: 'text/plain; charset=utf-8',
  })

  return json({ uploadResult: result })
}
