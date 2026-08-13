import { corsHeaders, json } from '../../_utils/cors.js'
import { getContentAccess } from '../../_utils/contentAuth.js'
import { ensureProductLaunchColumns } from '../../_utils/productLaunch.js'

const LEGACY_ASSET_HOST = 'https://prymelabs.cc'
const CANONICAL_ASSET_HOST = 'https://prymelabs.net'

function canonicalAssetUrl(value) {
  return typeof value === 'string' ? value.split(LEGACY_ASSET_HOST).join(CANONICAL_ASSET_HOST) : value
}

function publicLaunchProduct(p) {
  let photos = []
  try {
    const parsed = JSON.parse(p.photos_json || '[]')
    if (Array.isArray(parsed)) photos = parsed.filter(Boolean)
  } catch {}
  if (photos.length === 0 && p.image_url) photos = [p.image_url]

  return {
    id: p.id,
    name: p.name,
    size: p.size || '',
    tagline: p.tagline || '',
    department: p.department || 'Peptides',
    category: p.category || '',
    release_at: Number(p.release_at) || 0,
    image_url: canonicalAssetUrl(p.image_url || photos[0] || ''),
  }
}

export async function onRequestGet({ request, env }) {
  await ensureProductLaunchColumns(env)
  const access = await getContentAccess(request, env)
  const now = Math.floor(Date.now() / 1000)

  const { results } = await env.DB.prepare(
    `SELECT id, name, size, tagline, image_url, photos_json, category, department, is_draft, release_at
     FROM products
     WHERE is_draft = 0 AND release_at IS NOT NULL AND release_at > ?
     ORDER BY release_at ASC, display_order ASC, id ASC
     LIMIT 8`
  ).bind(now).all()

  const launches = (results || [])
    .filter(p => access.peptide || (p.department || 'Peptides') !== 'Peptides')
    .map(publicLaunchProduct)
    .slice(0, 4)

  return json({ launches, now })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
