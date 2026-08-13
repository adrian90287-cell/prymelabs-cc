import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CartContext = createContext(null)

const CART_TYPES = {
  MAIN: 'main',
  PEPTIDES: 'peptides',
}

function cartTypeFor(product) {
  return (product?.department || 'Peptides') === 'Peptides' ? CART_TYPES.PEPTIDES : CART_TYPES.MAIN
}

function safeCart(json) {
  try {
    const parsed = JSON.parse(json || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function cartTotal(items) {
  return items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.qty || 0), 0)
}

function cartCount(items) {
  return items.reduce((sum, i) => sum + Number(i.qty || 0), 0)
}

export function CartProvider({ children }) {
  const [mainItems, setMainItems] = useState([])
  const [peptideItems, setPeptideItems] = useState([])
  const [activeCart, setActiveCart] = useState(CART_TYPES.MAIN)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const savedMain = safeCart(localStorage.getItem('pl_cart_main'))
    const savedPeptides = safeCart(localStorage.getItem('pl_cart_peptides'))
    const legacy = safeCart(localStorage.getItem('pl_cart'))

    if (savedMain.length || savedPeptides.length) {
      setMainItems(savedMain)
      setPeptideItems(savedPeptides)
    } else if (legacy.length) {
      setMainItems(legacy.filter(i => cartTypeFor(i) === CART_TYPES.MAIN))
      setPeptideItems(legacy.filter(i => cartTypeFor(i) === CART_TYPES.PEPTIDES))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('pl_cart_main', JSON.stringify(mainItems))
  }, [mainItems])

  useEffect(() => {
    localStorage.setItem('pl_cart_peptides', JSON.stringify(peptideItems))
  }, [peptideItems])

  const items = activeCart === CART_TYPES.PEPTIDES ? peptideItems : mainItems
  const cartItems = (type = activeCart) => type === CART_TYPES.PEPTIDES ? peptideItems : mainItems
  const cartTotals = (type = activeCart) => {
    const selected = cartItems(type)
    return { total: cartTotal(selected), itemCount: cartCount(selected) }
  }

  const addItem = (product) => {
    const type = cartTypeFor(product)
    const currentItems = type === CART_TYPES.PEPTIDES ? peptideItems : mainItems
    const setTargetItems = type === CART_TYPES.PEPTIDES ? setPeptideItems : setMainItems
    const max = Number(product.stock_qty) || 0
    const existing = currentItems.find(i => i.id === product.id)
    const currentQty = existing ? existing.qty : 0
    if (max > 0 && currentQty >= max) return { added: false, max }

    setTargetItems(prev => {
      const ex = prev.find(i => i.id === product.id)
      if (ex) return prev.map(i => i.id === product.id ? { ...i, qty: ex.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
    setActiveCart(type)
    setIsOpen(true)
    return { added: true, max, cartType: type }
  }

  const removeItem = (id, type = activeCart) => {
    const setter = type === CART_TYPES.PEPTIDES ? setPeptideItems : setMainItems
    setter(prev => prev.filter(i => i.id !== id))
  }

  const updateQty = (id, qty, type = activeCart) => {
    const selectedItems = cartItems(type)
    const setter = type === CART_TYPES.PEPTIDES ? setPeptideItems : setMainItems
    if (qty <= 0) { removeItem(id, type); return { qty: 0, capped: false } }
    const item = selectedItems.find(i => i.id === id)
    const max = item ? Number(item.stock_qty) || 0 : 0
    const capped = max > 0 && qty > max
    const finalQty = capped ? max : qty
    setter(prev => prev.map(i => i.id === id ? { ...i, qty: finalQty } : i))
    return { qty: finalQty, capped }
  }

  const clearCart = (type = activeCart) => {
    const setter = type === CART_TYPES.PEPTIDES ? setPeptideItems : setMainItems
    setter([])
  }

  // Re-price cart items against the live product feed so the amount charged
  // always matches the current storefront price (e.g. an active sale). The cart
  // persists in localStorage and would otherwise keep the price captured at
  // add-time, causing customers to be charged a stale/pre-sale price.
  const reconcilePrices = useCallback((products) => {
    if (!Array.isArray(products) || products.length === 0) return
    const byId = new Map(products.map(p => [p.id, p]))
    const reconcile = (prev) => {
      let changed = false
      const next = prev.map(i => {
        const p = byId.get(i.id)
        if (!p) return i // product no longer in feed — leave the stored copy alone
        const price = Number(p.price)
        const compare_at_price = p.compare_at_price != null ? Number(p.compare_at_price) : null
        const no_discount = p.no_discount ?? i.no_discount
        const department = p.department ?? i.department
        if (i.price === price && i.compare_at_price === compare_at_price && i.no_discount === no_discount && i.department === department) return i
        changed = true
        return { ...i, price, compare_at_price, no_discount, department, stock_qty: p.stock_qty ?? i.stock_qty, in_stock: p.in_stock ?? i.in_stock }
      })
      return changed ? next : prev
    }
    setMainItems(reconcile)
    setPeptideItems(reconcile)
  }, [])

  const total = cartTotal(items)
  const itemCount = cartCount(items)
  const mainCount = cartCount(mainItems)
  const peptideCount = cartCount(peptideItems)
  const totalItemCount = mainCount + peptideCount

  return (
    <CartContext.Provider value={{
      items,
      mainItems,
      peptideItems,
      activeCart,
      setActiveCart,
      cartItems,
      cartTotals,
      isOpen,
      setIsOpen,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      reconcilePrices,
      total,
      itemCount,
      mainCount,
      peptideCount,
      totalItemCount,
      CART_TYPES,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
