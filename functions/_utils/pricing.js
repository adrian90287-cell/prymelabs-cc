// Single source of truth for the "display" price computation: the customer-facing
// price PLUS the "was" (compare_at_price) shown as a strikethrough/sale badge.
//
// Precedence (each step can override the previous one's `compare_at_price`):
//   1. Manual per-product "was" price (product.compare_at_price), if it's > price
//   2. Per-department global sale (overrides #1 — the sale IS the new "was")
//   3. "Was amount" cosmetic toggle (overrides #2 — psychological pricing only,
//      never changes the actual charged `price`)
//
// Fixed-price items (no_discount flag, or bundles/cases) are exempt from the
// master adjust, global sale, and was-amount toggle — but still keep their own
// manual "was" price so a case can show its own wholesale saving.
//
// This does NOT compute checkout charge amounts — see orders/index.js and
// will-call-order.js, which intentionally exclude the was-amount toggle since
// it must never affect what's actually charged.

import { saleAmountForDept } from './sale.js'

// product: { price, compare_at_price, no_discount, bundle_of_product_id, department }
// opts: { masterAdjust, saleConfig, wasAmountEnabled, wasAmount }
export function computeDisplayPricing(product, opts) {
  const { masterAdjust = 0, saleConfig = {}, wasAmountEnabled = false, wasAmount = 0 } = opts
  const noDiscount = product.no_discount === 1 || product.bundle_of_product_id != null

  let price, compare_at_price = null

  if (noDiscount) {
    price = Math.max(0.01, Number(product.price))
    const ownWas = Number(product.compare_at_price)
    if (ownWas && ownWas > price) compare_at_price = ownWas
  } else {
    price = Math.max(0.01, Number(product.price) + Number(masterAdjust))
    const ownWas = Number(product.compare_at_price)
    if (ownWas && ownWas > price) compare_at_price = ownWas
    const saleAmt = saleAmountForDept(saleConfig, product.department)
    if (saleAmt > 0) {
      compare_at_price = price
      price = Math.max(0.01, price - saleAmt)
    }
    if (wasAmountEnabled && wasAmount > 0) {
      compare_at_price = price + Number(wasAmount)
    }
  }

  return { price, compare_at_price, no_discount: noDiscount ? 1 : 0 }
}
