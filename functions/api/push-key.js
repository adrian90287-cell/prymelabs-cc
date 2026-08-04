import { corsHeaders, json } from '../_utils/cors.js'

// Public endpoint — returns VAPID public key so the browser can subscribe
export async function onRequestGet({ env }) {
  if (!env.VAPID_PUBLIC_KEY) {
    return json({ error: 'Push notifications not configured' }, 503)
  }
  return json({ publicKey: env.VAPID_PUBLIC_KEY })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
