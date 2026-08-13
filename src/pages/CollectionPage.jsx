import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import CartSidebar from '../components/CartSidebar'
import Footer from '../components/Footer'
import { ProductGrid } from '../components/ProductGrid'
import PeptideGate, { hasAckedPeptideGate } from '../components/PeptideGate'
import PhoneVerificationPrompt from '../components/PhoneVerificationPrompt'
import DepartmentNotifyBox from '../components/DepartmentNotifyBox'
import StorefrontTrustBar from '../components/StorefrontTrustBar'
import { useT } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { authHeaders } from '../lib/authHeaders'
import { useProductCatalog } from '../hooks/useProductCatalog'
import {
  DEPARTMENT_COLLECTIONS,
  departmentFromSlug, collectionFromSlug, slugify,
  filterByCollection, departmentOf,
} from '../lib/collections'
import { publicCountLabel } from '../lib/storefrontMeta'

const inStock = (p) => p.in_stock !== 0 && p.in_stock !== false

// Department landing hero photo, shown behind the department name.
const DEPT_HERO = {
  'Peptides':          '/hero/peptides.jpg',
  'Health & Wellness':  '/hero/wellness.jpg',
  'Beauty & Grooming':  '/hero/beauty.jpg',
}

// Where the actual subject sits in each source photo (as a CSS object-position),
// so cropping into the short, wide banner box keeps it centered instead of
// showing empty background. wellness.jpg in particular is a tall portrait crop
// with its capsules well below center.
const DEPT_HERO_POSITION = {
  'Peptides':          'center 60%',
  'Health & Wellness':  'center 62%',
  'Beauty & Grooming':  'center 70%',
}

const DEPT_BRAND = {
  'Peptides': 'PRYME LABS',
  'Health & Wellness': 'VYTRA',
  'Beauty & Grooming': 'VELOURIX + MATRIX',
  'Apparel & Gear': 'VYTRA',
}

function DepartmentHero({ department, title, subtitle, image }) {
  const img = image || DEPT_HERO[department]
  const brand = DEPT_BRAND[department] || 'PRYME LABS'
  const green = department === 'Health & Wellness' || department === 'Apparel & Gear'
  const beauty = department === 'Beauty & Grooming'

  return (
    <div className={`relative mb-6 h-64 overflow-hidden rounded-lg border ${green ? 'border-lime-300/25 bg-black' : beauty ? 'border-zinc-300/20 bg-zinc-950' : 'border-blue-500/25 bg-zinc-950'} sm:h-80`}>
      {img ? (
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: DEPT_HERO_POSITION[department] || 'center' }} />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(163,230,53,0.28),rgba(0,0,0,0)_44%),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:100%_100%,32px_32px]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/45 to-black/10" />
      <div className="relative flex h-full flex-col justify-end p-5 sm:p-7">
        <p className={`text-[11px] font-black uppercase tracking-[0.26em] ${green ? 'text-lime-300' : 'text-blue-300'}`}>{brand}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-5xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-200 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:text-base">{subtitle}</p>
      </div>
    </div>
  )
}

export default function CollectionPage() {
  const { deptSlug, colSlug } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const { user, loading: authLoading } = useAuth()
  const { products, showWasPrice, loading } = useProductCatalog()
  const [coaDocs, setCoaDocs] = useState([])
  const [departmentHeroes, setDepartmentHeroes] = useState({})
  const [search, setSearch] = useState('')
  const [peptideAcked, setPeptideAcked] = useState(hasAckedPeptideGate())

  const department = departmentFromSlug(deptSlug || '')
  const collection = department && colSlug ? collectionFromSlug(department, colSlug) : null
  const isAdmin = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('pl_admin_token')
  const phoneVerified = user?.phone_verified === true
  const canViewPeptides = (!!user && phoneVerified) || isAdmin

  // Re-check the ack whenever we land on a Peptides route — sessionStorage can
  // have been cleared by a login/logout since this component last mounted.
  useEffect(() => {
    if (department === 'Peptides') setPeptideAcked(hasAckedPeptideGate())
  }, [department])

  useEffect(() => {
    fetch('/api/coa', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setCoaDocs(data.documents || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/storefront/home-media', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setDepartmentHeroes(data.departmentHeroes || {}))
      .catch(() => {})
  }, [])

  // Unknown department slug → fall back to the shop
  useEffect(() => {
    if (!loading && !department) navigate('/shop', { replace: true })
  }, [loading, department, navigate])

  // Peptides stay restricted even though the rest of the storefront is public.
  useEffect(() => {
    if (!authLoading && department === 'Peptides' && !canViewPeptides && !user && !isAdmin) {
      navigate('/auth', { replace: true, state: { peptideAccess: true } })
    }
  }, [authLoading, department, canViewPeptides, user, isAdmin, navigate])

  // Clear search when navigating to a different department/collection
  useEffect(() => { setSearch('') }, [deptSlug, colSlug])
  if (!department) {
    return (
      <div className="min-h-screen bg-zinc-950"><Navbar /><CartSidebar />
        <div className="flex justify-center py-24"><div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        <Footer />
      </div>
    )
  }

  if (department === 'Peptides' && authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950"><Navbar /><CartSidebar />
        <div className="flex justify-center py-24"><div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        <Footer />
      </div>
    )
  }

  if (department === 'Peptides' && !canViewPeptides) {
    if (user && !phoneVerified && !isAdmin) {
      return (
        <div className="min-h-screen bg-zinc-950">
          <Navbar />
          <CartSidebar />
          <PhoneVerificationPrompt required />
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-zinc-950"><Navbar /><CartSidebar />
        <div className="flex justify-center py-24"><div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        <Footer />
      </div>
    )
  }

  if (department === 'Peptides' && canViewPeptides && !peptideAcked) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <CartSidebar />
        <PeptideGate
          onAgree={() => setPeptideAcked(true)}
          onDecline={() => navigate('/', { replace: true })}
        />
      </div>
    )
  }

  const deptName = t.shop.departmentNames?.[department] || department
  const colName  = collection ? (t.shop.departmentNames?.[collection] || collection) : null
  const deptSubtitle = t.home.departmentBlurbs?.[department] || t.shop.subtitle
  const showComingSoon = !search.trim() && department !== 'Peptides'

  let shown = filterByCollection(products, department, collection).filter(inStock)
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    shown = shown.filter(p => p.name?.toLowerCase().includes(q))
  }
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

        {/* Section title — premium department entry while preserving routing */}
        <DepartmentHero
          department={department}
          title={collection ? colName : deptName}
          subtitle={collection ? `${deptName} · ${colName}` : deptSubtitle}
          image={departmentHeroes[department]}
        />

        {department !== 'Peptides' && <StorefrontTrustBar compact />}

        {/* Search within this department/collection */}
        <div className="relative mb-6">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.shop.searchPlaceholder}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
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
                <div className="text-zinc-500 text-xs mt-1">{publicCountLabel(card.count, department, t)}</div>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24"><div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            <ProductGrid
              products={shown}
              coaDocs={coaDocs}
              showWasPrice={showWasPrice}
              emptyLabel={search.trim() ? t.shop.noResults : showComingSoon ? t.home.emptyDept(deptName) : t.collections.empty}
              emptyHint={showComingSoon ? t.home.emptyDeptHint : undefined}
            />
            {shown.length === 0 && showComingSoon && <DepartmentNotifyBox department={department} />}
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
