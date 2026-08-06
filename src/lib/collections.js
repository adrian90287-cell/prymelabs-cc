// ── Storefront taxonomy ──────────────────────────────────────────────────────
// Single source of truth for the department → collection navigation, the
// collection landing pages, and the admin product-tagging UI. Membership in a
// named collection is stored on each product's `collections` array (multi-value,
// so one product can appear in several collections without duplicate listings).
//
// Two collections are COMPUTED, not tag-based:
//   • "Shop All …"  → every product in the department (implicit)
//   • "New Arrivals" → the most recently added products in the department
// Everything else (incl. Best Sellers, Bundles) is a manual tag set in admin.

export const DEPARTMENTS = ['Health & Wellness', 'Beauty & Grooming', 'Apparel & Gear', 'Peptides']

// Per-department sub-collections, in menu order. "Shop All" is prepended in the
// UI; "New Arrivals" is dynamic; the rest are tag-based.
export const DEPARTMENT_COLLECTIONS = {
  'Health & Wellness': [
    'Daily Wellness',
    'Hydration',
    'Energy & Performance',
    'Recovery',
    'Sleep & Stress',
    'Digestive Wellness',
    'Hair, Skin & Nails',
    'Vitamins & Minerals',
    'New Arrivals',
    'Best Sellers',
  ],
  'Beauty & Grooming': [
    'Face Care',
    'Hair Care',
    'Hair Styling',
    'Beard Care',
    'Body Care',
    'Cleansers',
    'Toners',
    'Serums',
    'Moisturizers',
    'Face Creams',
    'Soaps',
    'Kits & Bundles',
    'New Arrivals',
    'Best Sellers',
  ],
  'Peptides': [
    'New Arrivals',
    'Best Sellers',
  ],
  'Apparel & Gear': [
    'Apparel',
    'Drinkware',
    'Gym Accessories',
    'Bags & Carry',
    'Stickers & Extras',
    'New Arrivals',
    'Best Sellers',
  ],
}

// Collections computed on the fly rather than read from product tags.
export const DYNAMIC_COLLECTIONS = new Set(['New Arrivals'])
// How many of the newest products count as "New Arrivals" within a department.
export const NEW_ARRIVALS_LIMIT = 24

// Collections an admin can tag a product with (dynamic ones excluded).
export function taggableCollections(department) {
  return (DEPARTMENT_COLLECTIONS[department] || []).filter(c => !DYNAMIC_COLLECTIONS.has(c))
}

// ── URL slugs ────────────────────────────────────────────────────────────────
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
export function departmentSlug(dep) { return slugify(dep) }

export function departmentFromSlug(slug) {
  return DEPARTMENTS.find(d => departmentSlug(d) === slug) || null
}
export function collectionFromSlug(department, slug) {
  return (DEPARTMENT_COLLECTIONS[department] || []).find(c => slugify(c) === slug) || null
}

// ── Membership + filtering (client-side; catalog is already loaded) ──────────
export function departmentOf(p) {
  return DEPARTMENTS.includes(p?.department) ? p.department : 'Peptides'
}
export function productCollections(p) {
  const c = p?.collections
  if (Array.isArray(c)) return c
  if (typeof c === 'string') { try { const a = JSON.parse(c); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}

// Products belonging to a given department + (optional) collection.
export function filterByCollection(products, department, collection) {
  let list = products.filter(p => departmentOf(p) === department)
  if (!collection || collection === 'Shop All') return list
  if (collection === 'New Arrivals') {
    return [...list].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, NEW_ARRIVALS_LIMIT)
  }
  return list.filter(p => productCollections(p).includes(collection))
}
