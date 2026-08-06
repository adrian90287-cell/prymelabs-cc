import { corsHeaders, json } from '../../_utils/cors.js';
import { isContentAuthed } from '../../_utils/contentAuth.js';
import { resolveSaleConfig } from '../../_utils/sale.js';
import { computeDisplayPricing } from '../../_utils/pricing.js';

export async function onRequestGet({ request, env }) {
  // Public visitors may browse the general storefront. The Peptides department
  // remains restricted: only logged-in customers or admin preview may read it.
  const authed = await isContentAuthed(request, env);

  const [{ results: products }, { results: settingsRows }] = await Promise.all([
    env.DB.prepare(
      `SELECT id, code, name, size, tagline, description, description_es,
              price, compare_at_price, image_url, photos_json, category, department, collections, in_stock, stock_qty,
              bundle_of_product_id, bundle_qty, no_discount
       FROM products
       ORDER BY display_order ASC, id ASC`
    ).all(),
    env.DB.prepare(
      "SELECT key, value FROM settings WHERE key IN ('sale_config','sale_mode_enabled','sale_discount_amount','sale_departments','show_was_price','was_amount_enabled','was_amount','master_price_adjust')"
    ).all(),
  ]);

  const cfg = {};
  for (const r of (settingsRows || [])) cfg[r.key] = r.value;

  // Per-department sale amounts (independent dollars-off per department).
  const saleConfig = resolveSaleConfig(cfg);

  // Approved-review aggregates per product (best-effort)
  const ratingMap = new Map();
  try {
    const { results: ratingRows } = await env.DB.prepare(
      "SELECT product_id, COUNT(*) AS cnt, AVG(rating) AS avg FROM reviews WHERE status = 'approved' GROUP BY product_id"
    ).all();
    for (const r of (ratingRows || [])) ratingMap.set(r.product_id, { count: r.cnt, avg: Number(r.avg) });
  } catch { /* reviews table may not exist yet */ }

  const showWasPrice = cfg.show_was_price !== '0';
  const masterAdjust = Number(cfg.master_price_adjust) || 0;
  const wasAmountEnabled = cfg.was_amount_enabled === '1';
  const wasAmount = wasAmountEnabled ? (Number(cfg.was_amount) || 0) : 0;

  // Look up table so a case can read its parent single's stock
  const byId = new Map((products || []).map(p => [p.id, p]));

  const visibleProducts = authed
    ? (products || [])
    : (products || []).filter(p => (p.department || 'Peptides') !== 'Peptides');

  const finalProducts = visibleProducts.map(p => {
    const isBundle = p.bundle_of_product_id != null;
    const { price, compare_at_price, no_discount: noDiscount } = computeDisplayPricing(p, {
      masterAdjust, saleConfig, wasAmountEnabled, wasAmount,
    });

    // A case's availability is derived from its parent's shared vial pool.
    let in_stock = p.in_stock;
    let stock_qty = p.stock_qty;
    if (isBundle) {
      const parent = byId.get(p.bundle_of_product_id);
      const per = Math.max(1, Number(p.bundle_qty) || 1);
      if (parent) {
        if (parent.stock_qty > 0) {
          stock_qty = Math.floor(parent.stock_qty / per); // whole cases available
          in_stock = parent.in_stock && stock_qty > 0 ? 1 : 0;
        } else {
          // parent untracked/unlimited → mirror its in_stock flag, stay untracked
          stock_qty = 0;
          in_stock = parent.in_stock ? 1 : 0;
        }
      }
    }

    const rt = ratingMap.get(p.id);
    let collections = [];
    try { const a = JSON.parse(p.collections || '[]'); if (Array.isArray(a)) collections = a; } catch { /* keep [] */ }
    let photos = [];
    try { const a = JSON.parse(p.photos_json || '[]'); if (Array.isArray(a)) photos = a.filter(Boolean); } catch { /* keep [] */ }
    if (photos.length === 0 && p.image_url) photos = [p.image_url];
    return {
      ...p, price, compare_at_price, in_stock, stock_qty, collections, photos,
      bundle_qty: Number(p.bundle_qty) || 1,
      no_discount: noDiscount ? 1 : 0,
      rating: rt ? Number(rt.avg.toFixed(1)) : 0,
      review_count: rt ? rt.count : 0,
    };
  });

  return json({ products: finalProducts, show_was_price: showWasPrice, restricted: authed ? [] : ['Peptides'] });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
