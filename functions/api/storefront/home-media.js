import { corsHeaders, json } from '../../_utils/cors.js'

const LEGACY_ASSET_HOST = 'https://prymelabs.cc'
const CANONICAL_ASSET_HOST = 'https://prymelabs.net'
const HOME_HEADER_KEY = 'home_header_main'

// Home-page department hero images. Kept on its own endpoint (only the home page
// fetches it) so these — potentially large — images never weigh down the global
// storefront config that loads on every page.
const KEYS = {
  'Peptides':          'home_hero_peptides',
  'Health & Wellness': 'home_hero_supplements',
  'Beauty & Grooming': 'home_hero_skincare',
  'Apparel & Gear':    'home_hero_apparel',
  'VYTRA Feature':     'home_hero_vytra',
}

const DEPARTMENT_HEADER_KEYS = {
  'Peptides':          'department_hero_peptides',
  'Health & Wellness': 'department_hero_health',
  'Beauty & Grooming': 'department_hero_beauty',
  'Apparel & Gear':    'department_hero_apparel',
}

const SETTINGS_KEYS = [
  HOME_HEADER_KEY,
  ...Object.values(KEYS),
  ...Object.values(DEPARTMENT_HEADER_KEYS),
]

function canonicalAssetUrl(value) {
  return typeof value === 'string' ? value.split(LEGACY_ASSET_HOST).join(CANONICAL_ASSET_HOST) : value
}

export async function onRequestGet({ request, env }) {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (${SETTINGS_KEYS.map(k => `'${k}'`).join(',')})`
  ).all()
  const map = {}
  for (const r of (results || [])) map[r.key] = r.value
  const heroes = {}
  for (const [dep, key] of Object.entries(KEYS)) {
    if (map[key]) heroes[dep] = canonicalAssetUrl(map[key])
  }
  const departmentHeroes = {}
  for (const [dep, key] of Object.entries(DEPARTMENT_HEADER_KEYS)) {
    if (map[key]) departmentHeroes[dep] = canonicalAssetUrl(map[key])
  }
  return json({
    heroes,
    homeHero: canonicalAssetUrl(map[HOME_HEADER_KEY] || ''),
    departmentHeroes,
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
