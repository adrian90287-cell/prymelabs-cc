// Sync endpoint: Replicate products from unified DB to prymelabs.store KV
// Called by prymelabs-cc admin when products are updated
import { isSyncAuthed } from '../../_utils/syncAuth.js';

export async function onRequest({ request, env }) {
  // Only accept POST from authenticated sources
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify authorization — must match the shared SYNC_SECRET (presence of any
  // Bearer token is NOT sufficient).
  if (!isSyncAuthed(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Fetch all products from unified DB
    const productsResult = await env.UNIFIED_DB
      .prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY code ASC')
      .all();

    const products = productsResult?.results || [];

    if (products.length === 0) {
      return Response.json({ error: 'No products to sync' }, { status: 400 });
    }

    // Format products for prymelabs.store compatibility
    const formattedProducts = products.map(p => ({
      code: p.code,
      name: p.name,
      size: p.size,
      price: p.price,
      stockQuantity: p.stock_qty,
      lowStockThreshold: p.low_stock_threshold,
      outOfStock: p.in_stock === 0,
      tagline: p.tagline,
      description: p.description,
      description_es: p.description_es || '',
      researchArea: p.research_area || 'Research',
      handlingNotes: p.handling_notes || '',
      cas: p.cas_number || 'See Certificate of Analysis',
      purity: p.purity || '≥99% by HPLC',
      storage: p.storage || '−20°C · Lyophilized',
      form: p.form || 'Lyophilized Powder',
      photos: p.photos_json ? JSON.parse(p.photos_json) : [p.image_url],
      wasPrice: p.was_price || 0,
      saleBadge: p.sale_badge || ''
    }));

    // Call prymelabs.store sync API
    const syncPayload = {
      products: formattedProducts,
      adjustmentReason: 'Sync from prymelabs-unified database',
      timestamp: new Date().toISOString()
    };

    // For now, return the payload so it can be manually uploaded or queued
    // In production, this would trigger a webhook/queue to prymelabs.store

    return Response.json({
      success: true,
      message: 'Products ready to sync',
      products_count: formattedProducts.length,
      payload: syncPayload,
      instructions: 'POST this payload to https://prymelabs.store/api/admin-products with Bearer token'
    }, { status: 200 });

  } catch (e) {
    console.error('Sync error:', e);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
