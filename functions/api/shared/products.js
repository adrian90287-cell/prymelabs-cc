// Shared products endpoint - source of truth for both sites
// Used by both prymelabs.cc and prymelabs.store to fetch current inventory
import { isSyncAuthed } from '../../_utils/syncAuth.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!isSyncAuthed(request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return getProducts(request, env);
}

async function getProducts(request, env) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const all = url.searchParams.get('all') === 'true';

    let query = 'SELECT * FROM products';
    const params = [];

    if (code) {
      query += ' WHERE code = ?';
      params.push(code.toUpperCase());
    } else if (!all) {
      query += ' WHERE in_stock = 1';
    }

    query += ' ORDER BY code ASC';

    const stmt = env.UNIFIED_DB.prepare(query);
    const result = code
      ? await stmt.bind(...params).first()
      : await stmt.bind(...params).all();

    const products = code ? (result ? [result] : []) : (result?.results || []);

    // Format for API response
    const formatted = products.map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      size: p.size,
      tagline: p.tagline,
      description: p.description,
      description_es: p.description_es || '',
      price: p.price,
      compare_at_price: p.compare_at_price,
      image_url: p.image_url,
      photos: p.photos_json ? JSON.parse(p.photos_json) : [p.image_url],
      category: p.category,
      stock_qty: p.stock_qty,
      low_stock_threshold: p.low_stock_threshold,
      in_stock: p.in_stock === 1,
      research_area: p.research_area,
      handling_notes: p.handling_notes,
      documentation: p.documentation,
      cas_number: p.cas_number,
      purity: p.purity,
      storage: p.storage,
      form: p.form,
      was_price: p.was_price,
      sale_badge: p.sale_badge,
      synced_at: p.synced_at,
      source_site: p.source_site
    }));

    return Response.json({
      products: formatted,
      count: formatted.length,
      timestamp: new Date().toISOString(),
      source: 'prymelabs-unified'
    });

  } catch (e) {
    console.error('Shared products error:', e);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
