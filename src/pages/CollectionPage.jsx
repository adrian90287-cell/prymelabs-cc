import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import CartSidebar from '../components/CartSidebar'
import Footer from '../components/Footer'
import { ProductGrid } from '../components/ProductGrid'
import { useCart } from '../context/CartContext'
import { useT } from '../context/LanguageContext'
import { authHeaders } from '../lib/authHeaders'
import {
  DEPARTMENT_COLLECTIONS,
  departmentFromSlug, collectionFromSlug, slugify,
  filterByCollection, departmentOf,
} from '../lib/collections'

const inStock = (p) => p.in_stock !== 0 && p.in_stock !== false

export default function CollectionPage() {
  const { deptSlug, colSlug } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const { reconcilePrices } = useCart()
  const [products, setProducts] = useState([])
  const [coaDocs, setCoaDocs] = useState([])
  const [showWasPrice, setShowWasPrice] = useState(true)
  const [loading, setLoading] = useState(true)

  const department = departmentFromSlug(deptSlug || '')
  const collection = department && colSlug ? collectionFromSlug(department, colSlug) : null

  useEffect(() => {
    fetch('/api/products', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = data.products || []
        setProducts(list); setShowWasPrice(data.show_was_price !== false); setLoading(false)
        reconcilePrices(list)
      })
      .catch(() => setLoading(false))
    fetch('/api/coa', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setCoaDocs(data.documents || []))
      .catch(() => {})
  }, [])

  // Unknown department slug → fall back to the shop
  useEffect(() => {
    if (!loading && !department) navigate('/shop', { replace: true })
  }, [loading, department, navigate])
  if (!department) {
    return (
      <div className="min-h-screen bg-zinc-950"><Navbar /><CartSidebar />
        <div className="flex justify-center py-24"><div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        <Footer />
      </div>
    )
  }

  const deptName = t.shop.departmentNames?.[department] || department
  const colName  = collection ? (t.shop.departmentNames?.[collection] || collection) : null
  const deptSubtitle = t.home.departmentBlurbs?.[department] || t.shop.subtitle

  const shown = filterByCollection(products, department, collection).filter(inStock)
  const countIn = (col) => filterByCollection(products, department, col).filter(inStock).length

  // Collection cards for the department landing (Shop All + each sub-collection)
  const cards = [{ name: t.collections.shopAll, target: '', count: products.filter(p => departmentOf(p) === department && inStock(p)).length }]
    .concat((DEPARTMENT_COLLECTIONS[department] || []).map(c => ({ name: c, target: slugify(c), count: countIn(c) })))

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <CartSidebar />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb when viewing a specific collection */}
        {collection && (
          <button onClick={() => navigate(`/collections/${deptSlug}`)}
            className="text-zinc-500 hover:text-white text-sm font-medium transition-colors mb-3 inline-flex items-center gap-1">
            ← {t.collections.backTo} {deptName}
          </button>
        )}

        {/* Section title */}
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white">{collection ? colName : deptName}</h1>
          <p className="text-zinc-500 mt-1">
            {collection ? `${deptName} · ${colName}` : deptSubtitle}
          </p>
        </div>

        {/* Research disclaimers — Peptides department only */}
        {department === 'Peptides' && (
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-3.5 mb-6 text-center">
            <p className="text-amber-400/90 text-xs font-semibold">{t.collections.peptideNotice}</p>
          </div>
        )}

        {/* Collection cards — only on the department landing */}
        {!collection && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
            {cards.map(card => (
              <button key={card.name}
                onClick={() => navigate(card.target ? `/collections/${deptSlug}/${card.target}` : `/collections/${deptSlug}`)}
                className="text-left bg-zinc-900 border border-zinc-800 hover:border-blue-700/50 rounded-xl p-4 transition-colors">
                <div className="text-white font-bold text-sm leading-snug">{card.name}</div>
                <div className="text-zinc-500 text-xs mt-1">{t.home.products(card.count)}</div>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24"><div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <ProductGrid products={shown} coaDocs={coaDocs} showWasPrice={showWasPrice} emptyLabel={t.collections.empty} />
        )}
      </main>

      <Footer />
    </div>
  )
}
