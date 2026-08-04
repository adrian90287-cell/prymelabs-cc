import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import CartSidebar from '../components/CartSidebar'
import Footer from '../components/Footer'
import { useCart } from '../context/CartContext'
import { useT } from '../context/LanguageContext'
import { authHeaders } from '../lib/authHeaders'
import { DEPARTMENTS, DEPARTMENT_META } from '../components/ProductGrid'
import { departmentSlug, departmentOf } from '../lib/collections'

function StatPill({ icon, label }) {
  return (
    <div className="flex items-center gap-2 bg-zinc-900/70 border border-zinc-800 rounded-full px-3.5 py-1.5">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-zinc-300 text-xs font-semibold whitespace-nowrap">{label}</span>
    </div>
  )
}

// Home-page departments, Peptides first (the populated line)
const HOME_DEPARTMENTS = ['Peptides', 'Health & Wellness', 'Beauty & Grooming']

// Large, image-forward entry card. Shows a hero photo when configured, else a
// clean branded panel in the existing theme (no external/stock imagery).
function DepartmentCard({ dep, name, blurb, count, image, onOpen, productsLabel }) {
  const [imgOk, setImgOk] = useState(true)
  const meta = DEPARTMENT_META[dep]
  const showImg = !!image && imgOk
  return (
    <button onClick={onOpen}
      className="group relative text-left rounded-2xl overflow-hidden border border-zinc-800 hover:border-blue-700/50 bg-zinc-900 transition-all">
      {/* Media — 1:1 square */}
      <div className="relative aspect-square bg-zinc-950 overflow-hidden">
        {showImg ? (
          <img src={image} alt={name} onError={() => setImgOk(false)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <span className="text-[7rem] leading-none opacity-20 select-none">{meta?.icon}</span>
          </div>
        )}
        {/* Legibility scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        {/* Count chip */}
        <span className="absolute top-3 right-3 bg-zinc-950/70 backdrop-blur text-zinc-200 text-xs font-semibold px-2.5 py-1 rounded-full border border-white/10">
          {productsLabel}
        </span>
      </div>
      {/* Caption */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
        <div className="text-white font-black text-xl sm:text-2xl leading-tight">{name}</div>
        <div className="text-zinc-300 text-sm mt-1 leading-snug line-clamp-2">{blurb}</div>
        <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-blue-300 group-hover:text-blue-200 transition-colors">
          {name} →
        </div>
      </div>
    </button>
  )
}

export default function HomePage() {
  const [products, setProducts] = useState([])
  const [heroes, setHeroes] = useState({})
  const { reconcilePrices } = useCart()
  const navigate = useNavigate()
  const t = useT()
  const departmentsRef = useRef(null)

  useEffect(() => {
    fetch('/api/products', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { const list = data.products || []; setProducts(list); reconcilePrices(list) })
      .catch(() => {})
    fetch('/api/storefront/home-media', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setHeroes(data.heroes || {}))
      .catch(() => {})
  }, [])

  const inStock = (p) => p.in_stock !== 0 && p.in_stock !== false
  const countFor = (dep) => new Set(products.filter(p => departmentOf(p) === dep && inStock(p)).map(p => p.name)).size
  const deptName = (dep) => t.shop.departmentNames?.[dep] || dep
  const deptBlurb = (dep) => t.home.departmentBlurbs?.[dep] || ''

  const scrollToDepartments = () => departmentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <CartSidebar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-zinc-800/60">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full bg-blue-600/15 blur-[120px]" />
          <div className="absolute top-40 -right-20 w-[380px] h-[380px] rounded-full bg-indigo-500/10 blur-[100px]" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 pt-16 pb-14 sm:pt-24 sm:pb-20 text-center">
          <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tight leading-[0.95]">
            PRYME<span className="text-blue-500">LABS</span>
          </h1>
          <p className="mt-5 text-zinc-400 text-base sm:text-xl max-w-2xl mx-auto leading-relaxed">
            {t.home.tagline}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button onClick={scrollToDepartments}
              className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-900/40 text-base">
              {t.home.browse}
            </button>
            <button onClick={() => navigate('/shop')}
              className="px-6 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-2xl transition-colors text-base">
              {t.home.fullCatalog}
            </button>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
            <StatPill icon="🔬" label={t.home.pills.coa} />
            <StatPill icon="🚚" label={t.home.pills.shipping} />
            <StatPill icon="🧾" label={t.home.pills.checkout} />
            <StatPill icon="⭐" label={t.home.pills.reviews} />
          </div>
        </div>
      </section>

      {/* ── Department entry cards (catalog lives inside each department) ──── */}
      <main ref={departmentsRef} className="max-w-7xl mx-auto px-4 py-12 sm:py-16 scroll-mt-20">
        <div className="mb-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-white">{t.home.shopByDepartment}</h2>
          <p className="text-zinc-500 mt-1 text-sm">{t.home.chooseDepartment}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HOME_DEPARTMENTS.map(dep => (
            <DepartmentCard
              key={dep}
              dep={dep}
              name={deptName(dep)}
              blurb={deptBlurb(dep)}
              count={countFor(dep)}
              productsLabel={t.home.products(countFor(dep))}
              image={heroes[dep]}
              onOpen={() => navigate(`/collections/${departmentSlug(dep)}`)}
            />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
