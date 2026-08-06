import { corsHeaders, json } from '../../_utils/cors.js'
import { isContentAuthed } from '../../_utils/contentAuth.js'

// Home-page department hero images. Kept on its own endpoint (only the home page
// fetches it) so these — potentially large — images never weigh down the global
// storefront config that loads on every page.
const KEYS = {
  'Peptides':          'home_hero_peptides',
  'Health & Wellness': 'home_hero_supplements',
  'Beauty & Grooming': 'home_hero_skincare',
  'Apparel & Gear':    'home_hero_apparel',
}

export async function onRequestGet({ request, env }) {
  if (!(await isContentAuthed(request, env))) return json({ error: 'Unauthorized' }, 401)
  const { results } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('home_hero_peptides','home_hero_supplements','home_hero_skincare','home_hero_apparel')"
  ).all()
  const map = {}
  for (const r of (results || [])) map[r.key] = r.value
  const heroes = {}
  for (const [dep, key] of Object.entries(KEYS)) {
    if (map[key]) heroes[dep] = map[key]
  }
  return json({ heroes })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
