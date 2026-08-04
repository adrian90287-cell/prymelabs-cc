// Per-department sale configuration. Source of truth is the `sale_config`
// setting: a JSON object mapping department → dollars-off, e.g.
//   { "Peptides": 10, "Health & Wellness": 5 }
// A department that's absent (or 0) is simply not on sale. Each department's
// amount is independent of the others.
//
// Backward compatibility: if `sale_config` isn't set, we derive it from the old
// single-amount model (sale_mode_enabled + sale_discount_amount + sale_departments).

export const SALE_DEPARTMENTS = ['Peptides', 'Health & Wellness', 'Beauty & Grooming']

// cfg is a plain { key: value } map of settings.
export function resolveSaleConfig(cfg = {}) {
  if (typeof cfg.sale_config === 'string' && cfg.sale_config.trim()) {
    try {
      const c = JSON.parse(cfg.sale_config)
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        const out = {}
        for (const d of SALE_DEPARTMENTS) { const a = Number(c[d]) || 0; if (a > 0) out[d] = a }
        return out
      }
    } catch { /* fall through to legacy */ }
  }
  // Legacy single-amount model
  if (cfg.sale_mode_enabled === '1') {
    const amt = Number(cfg.sale_discount_amount) || 0
    if (amt > 0) {
      let depts = null
      if (typeof cfg.sale_departments === 'string' && cfg.sale_departments.trim()) {
        try { const a = JSON.parse(cfg.sale_departments); if (Array.isArray(a)) depts = a } catch {}
      }
      const targets = depts || SALE_DEPARTMENTS
      const out = {}
      for (const d of targets) if (SALE_DEPARTMENTS.includes(d)) out[d] = amt
      return out
    }
  }
  return {}
}

// Dollars off for a product's department (0 = not on sale).
export function saleAmountForDept(saleConfig, department) {
  const dept = SALE_DEPARTMENTS.includes(department) ? department : 'Peptides'
  const a = Number(saleConfig?.[dept]) || 0
  return a > 0 ? a : 0
}
