import { corsHeaders, json } from '../../_utils/cors.js'

export async function onRequestGet({ request, env }) {
  const [{ results: rates }, { results: settingsRows }] = await Promise.all([
    env.DB.prepare(
      'SELECT id, name, price, min_days, max_days FROM shipping_rates WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
    ).all(),
    env.DB.prepare(
      "SELECT key, value FROM settings WHERE key IN ('free_shipping_threshold','tax_rate','tax_label','google_maps_key','banner_enabled','banner_pre_text','banner_code','banner_post_text','banner_style','banner_expires_at','local_delivery_enabled','local_delivery_radius_miles','local_delivery_hub_lat','local_delivery_hub_lng','local_delivery_flat_rate','free_shipping_banner_enabled','free_shipping_all')"
    ).all(),
  ])

  const cfg = {}
  for (const r of (settingsRows || [])) cfg[r.key] = r.value

  // Tie the promo banner to the advertised code's actual expiry so it hides the
  // moment the code expires (or is deactivated/deleted) — no need to keep a
  // separate banner-expiry setting in sync. A manual banner_expires_at, if set,
  // still applies as an additional cutoff.
  const now = Math.floor(Date.now() / 1000)
  let codeOk = true
  if (cfg.banner_code) {
    const promo = await env.DB.prepare(
      'SELECT is_active, expires_at FROM promo_codes WHERE code = ?'
    ).bind(cfg.banner_code.toUpperCase().trim()).first()
    if (promo) {
      // Code exists — banner lives only while it's active and unexpired
      codeOk = promo.is_active === 1 && (!promo.expires_at || Number(promo.expires_at) > now)
    }
    // If the code isn't found, fall back to the manual settings (don't force-hide)
  }
  const manualOk = !cfg.banner_expires_at || Number(cfg.banner_expires_at) > now
  const bannerEnabled = cfg.banner_enabled === '1' && codeOk && manualOk

  return json({
    shipping_rates: rates || [],
    free_shipping_threshold: Number(cfg.free_shipping_threshold) || 0,
    tax_rate: Number(cfg.tax_rate) || 0,
    tax_label: cfg.tax_label || 'Tax',
    google_maps_key: env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || cfg.google_maps_key || '',
    local_delivery: {
      enabled: cfg.local_delivery_enabled === '1',
      radius_miles: Number(cfg.local_delivery_radius_miles) || 15,
      hub_lat: Number(cfg.local_delivery_hub_lat) || 29.7065,
      hub_lng: Number(cfg.local_delivery_hub_lng) || -95.3127,
      flat_rate: Number(cfg.local_delivery_flat_rate) || 50,
    },
    free_shipping_banner_enabled: cfg.free_shipping_banner_enabled === '1',
    free_shipping_all: cfg.free_shipping_all === '1',
    banner: {
      enabled: bannerEnabled,
      pre_text: cfg.banner_pre_text ?? "Don't forget to use code",
      code: cfg.banner_code || '',
      post_text: cfg.banner_post_text ?? 'for a special discount on your order!',
      style: cfg.banner_style || 'fire',
    },
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
