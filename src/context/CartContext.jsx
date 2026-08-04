import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [items, setItems] = useState([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('pl_cart')
    if (saved) {
      try { setItems(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('pl_cart', JSON.stringify(items))
  }, [items])

  const addItem = (product) => {
    const max = Number(product.stock_qty) || 0
    const existing = items.find(i => i.id === product.id)
    const currentQty = existing ? existing.qty : 0
    if (max > 0 && currentQty >= max) return { added: false, max }

    setItems(prev => {
      const ex = prev.find(i => i.id === product.id)
      if (ex) return prev.map(i => i.id === product.id ? { ...i, qty: ex.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
    setIsOpen(true)
    return { added: true, max }
  }

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id))

  const updateQty = (id, qty) => {
    if (qty <= 0) { removeItem(id); return { qty: 0, capped: false } }
    const item = items.find(i => i.id === id)
    const max = item ? Number(item.stock_qty) || 0 : 0
    const capped = max > 0 && qty > max
    const finalQty = capped ? max : qty
    setItems(prev => prev.map(i => i.id === id ? { ...i, qty: finalQty } : i))
    return { qty: finalQty, capped }
  }

  const clearCart = () => setItems([])

  // Re-price cart items against the live product feed so the amount charged
  // always matches the current storefront price (e.g. an active sale). The cart
  // persists in localStorage and would otherwise keep the price captured at
  // add-time, causing customers to be charged a stale/pre-sale price.
  const reconcilePrices = useCallback((products) => {
    if (!Array.isArray(products) || products.length === 0) return
    const byId = new Map(products.map(p => [p.id, p]))
    setItems(prev => {
      let changed = false
      const next = prev.map(i => {
        const p = byId.get(i.id)
        if (!p) return i // product no longer in feed — leave the stored copy alone
        const price = Number(p.price)
        const compare_at_price = p.compare_at_price != null ? Number(p.compare_at_price) : null
        const no_discount = p.no_discount ?? i.no_discount
        if (i.price === price && i.compare_at_price === compare_at_price && i.no_discount === no_discount) return i
        changed = true
        return { ...i, price, compare_at_price, no_discount, stock_qty: p.stock_qty ?? i.stock_qty, in_stock: p.in_stock ?? i.in_stock }
      })
      return changed ? next : prev
    })
  }, [])

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0)

  return (
    <CartContext.Provider value={{ items, isOpen, setIsOpen, addItem, removeItem, updateQty, clearCart, reconcilePrices, total, itemCount }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
