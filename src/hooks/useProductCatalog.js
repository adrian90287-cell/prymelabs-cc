import { useEffect, useState } from 'react'
import { authHeaders } from '../lib/authHeaders'
import { useCart } from '../context/CartContext'

// Home, Shop, and each Collection page all independently fetched the full
// product catalog on every mount — navigating Home → Shop → a department
// re-fetched the same data three times in a row. This hook shares one
// fetch (with a short TTL so admin price/stock edits still show up quickly)
// across all of them instead.
const CACHE_TTL_MS = 30_000
let cache = { data: null, promise: null, fetchedAt: 0 }

function fetchCatalog() {
  const fresh = cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS
  if (fresh) return Promise.resolve(cache.data)
  if (cache.promise) return cache.promise // a fetch is already in flight — reuse it

  cache.promise = fetch('/api/products', { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      const result = { products: data.products || [], showWasPrice: data.show_was_price !== false }
      cache = { data: result, promise: null, fetchedAt: Date.now() }
      return result
    })
    .catch(err => { cache.promise = null; throw err })

  return cache.promise
}

/** Invalidate the cache — call after an action that changes catalog data (e.g. cart checkout). */
export function invalidateProductCatalog() {
  cache = { data: null, promise: null, fetchedAt: 0 }
}

export function useProductCatalog() {
  const [state, setState] = useState({
    products: cache.data?.products || [],
    showWasPrice: cache.data?.showWasPrice ?? true,
    loading: !cache.data,
    error: null,
  })
  const { reconcilePrices } = useCart()

  useEffect(() => {
    let cancelled = false
    fetchCatalog()
      .then(result => {
        if (cancelled) return
        setState({ products: result.products, showWasPrice: result.showWasPrice, loading: false, error: null })
        reconcilePrices(result.products) // keep any persisted cart items priced at the current storefront price
      })
      .catch(() => {
        if (cancelled) return
        setState(s => ({ ...s, loading: false, error: 'load-error' }))
      })
    return () => { cancelled = true }
  }, [])

  return state
}
