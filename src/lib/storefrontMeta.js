export const HOME_DEPARTMENTS = ['Health & Wellness', 'Beauty & Grooming', 'Apparel & Gear', 'Peptides']

export const BRAND_FILTERS = ['All', 'VYTRA', 'VELOURIX', 'MATRIX', 'Pryme Labs']

const MATRIX_TERMS = ['hair', 'beard', 'styling', 'grooming', 'pomade', 'gel', 'cream wax', 'clay']
const MATRIX_CATEGORIES = new Set(['Hair Care', 'Hair Styling', 'Beard Care'])

export function brandForProduct(product) {
  const department = product?.department || 'Peptides'
  if (department === 'Health & Wellness' || department === 'Apparel & Gear') return 'VYTRA'
  if (department === 'Peptides') return 'Pryme Labs'
  if (department === 'Beauty & Grooming') {
    const category = product?.category || ''
    const haystack = `${category} ${product?.name || ''}`.toLowerCase()
    if (MATRIX_CATEGORIES.has(category) || MATRIX_TERMS.some(term => haystack.includes(term))) return 'MATRIX'
    return 'VELOURIX'
  }
  return 'Pryme Labs'
}

export function publicCountLabel(count, department, t) {
  if (count > 0) return t.home.products(count)
  if (department === 'Peptides') return t.home.researchAccess || 'Research Access'
  return t.home.comingSoon || 'COMING SOON'
}
