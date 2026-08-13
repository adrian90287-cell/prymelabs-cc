import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import CartSidebar from '../components/CartSidebar'
import Footer from '../components/Footer'
import { useT } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { authHeaders } from '../lib/authHeaders'
import { useProductCatalog } from '../hooks/useProductCatalog'
import PeptideGate, { hasAckedPeptideGate } from '../components/PeptideGate'
import PhoneVerificationPrompt from '../components/PhoneVerificationPrompt'
import DepartmentNotifyBox from '../components/DepartmentNotifyBox'
import StorefrontTrustBar from '../components/StorefrontTrustBar'
import {
  ProductModal, ProductGroupCard, groupByName,
  CATEGORY_ORDER, DEPARTMENTS, DEPARTMENT_META, departmentOf,
} from '../components/ProductGrid'

// ─── Suggestion / Feedback Box ────────────────────────────────────────────────
function SuggestionBox() {
  const t = useT()
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error

  const submit = async () => {
    if (!message.trim()) return
    setStatus('loading')
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: message.trim() }),
      })
      if (res.ok) {
        setStatus('success')
        setMessage('')
        setTimeout(() => { setStatus('idle'); setOpen(false) }, 3000)
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (!token) return null

  return (
    <div className="mb-6">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors group">
          <span className="w-7 h-7 rounded-full bg-zinc-800 group-hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center transition-colors text-base">💡</span>
          {t.suggestions.toggle}
          <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 max-w-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <span className="text-base">💡</span>{t.suggestions.title}
            </h3>
            <button onClick={() => { setOpen(false); setMessage(''); setStatus('idle') }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {status === 'success' ? (
            <div className="flex items-center gap-2 py-3 text-green-400">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">{t.suggestions.success}</span>
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t.suggestions.placeholder}
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white placeholder-zinc-500 text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
              />
              {status === 'error' && (
                <p className="text-red-400 text-xs mt-1.5">{t.suggestions.error}</p>
              )}
              <div className="flex items-center justify-end gap-2 mt-2.5">
                <button
                  onClick={() => { setOpen(false); setMessage(''); setStatus('idle') }}
                  className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-semibold transition-colors">
                  {t.suggestions.cancel}
                </button>
                <button
                  onClick={submit}
                  disabled={!message.trim() || status === 'loading'}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">
                  {status === 'loading' ? t.suggestions.submitting : t.suggestions.submit}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ShopPage() {
  const { products, showWasPrice, loading, error: catalogError } = useProductCatalog()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialDept = DEPARTMENTS.includes(searchParams.get('dept')) ? searchParams.get('dept') : 'All'
  const [department, setDepartment] = useState(initialDept)
  const [category, setCategory] = useState('All')
  const [stockFilter, setStockFilter] = useState('instock')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // { group, variant }
  const [coaDocs, setCoaDocs] = useState([])
  const [peptideAcked, setPeptideAcked] = useState(hasAckedPeptideGate())
  const t = useT()
  const { user, loading: authLoading } = useAuth()
  const isAdmin = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('pl_admin_token')
  const phoneVerified = user?.phone_verified === true
  const canViewPeptides = (!!user && phoneVerified) || isAdmin
  const error = catalogError ? t.shop.loadError : ''

  // Re-check whenever the department filter lands on Peptides — a login/logout
  // since this page last mounted can have cleared the sessionStorage ack.
  useEffect(() => {
    if (department === 'Peptides') setPeptideAcked(hasAckedPeptideGate())
  }, [department])

  useEffect(() => {
    if (!authLoading && department === 'Peptides' && !canViewPeptides && !user && !isAdmin) {
      selectDepartment('All')
      navigate('/auth', { state: { peptideAccess: true } })
    }
  }, [authLoading, department, canViewPeptides, user, isAdmin])

  useEffect(() => {
    fetch('/api/coa', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setCoaDocs(data.documents || []))
      .catch(() => {})
  }, [])

  const openModal = useCallback((group, variant) => setModal({ group, variant }), [])
  const closeModal = useCallback(() => setModal(null), [])

  // Selecting a department resets the sub-category and syncs the URL (?dept=)
  const selectDepartment = (dep) => {
    if (dep === 'Peptides' && !canViewPeptides && !user && !isAdmin) {
      navigate('/auth', { state: { peptideAccess: true } })
      return
    }
    setDepartment(dep)
    setCategory('All')
    const next = new URLSearchParams(searchParams)
    if (dep === 'All') next.delete('dept'); else next.set('dept', dep)
    setSearchParams(next, { replace: true })
  }

  // Department filter first (top-level)
  const deptFiltered = products.filter(p => department === 'All' || departmentOf(p) === department)

  // Categories present within the selected department, in canonical order
  const presentCats = new Set(deptFiltered.map(p => p.category).filter(Boolean))
  const categories = [
    'All',
    ...CATEGORY_ORDER.filter(c => presentCats.has(c)),
    ...[...presentCats].filter(c => !CATEGORY_ORDER.includes(c)).sort(),
  ]

  // Department counts for the tab badges (in-stock groups)
  const deptCount = (dep) => {
    const inDep = products.filter(p => dep === 'All' || departmentOf(p) === dep)
    return groupByName(inDep).filter(g => g.some(v => v.in_stock !== 0 && v.in_stock !== false)).length
  }

  const catFiltered = deptFiltered.filter(p => category === 'All' || p.category === category)

  const allGroups = groupByName(catFiltered).sort((a, b) =>
    (a[0].name || '').localeCompare(b[0].name || '')
  )

  let groups = stockFilter === 'instock'
    ? allGroups.filter(g => g.some(v => v.in_stock !== 0 && v.in_stock !== false))
    : allGroups

  if (search.trim()) {
    const q = search.trim().toLowerCase()
    groups = groups.filter(g => g.some(v => v.name?.toLowerCase().includes(q)))
  }

  const inStockCount = allGroups.filter(g => g.some(v => v.in_stock !== 0 && v.in_stock !== false)).length
  const showComingSoon = !search.trim() && department !== 'All' && department !== 'Peptides'
  const departmentName = t.shop.departmentNames?.[department] || department

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <CartSidebar />

      {modal && (
        <ProductModal
          group={modal.group}
          initialVariant={modal.variant}
          onClose={closeModal}
          coaDocs={coaDocs}
          showWasPrice={showWasPrice}
        />
      )}

      {department === 'Peptides' && user && !phoneVerified && !isAdmin && (
        <PhoneVerificationPrompt required />
      )}

      {department === 'Peptides' && canViewPeptides && !peptideAcked && (
        <PeptideGate
          onAgree={() => setPeptideAcked(true)}
          onDecline={() => selectDepartment('All')}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white">{t.shop.title}</h1>
          <p className="text-zinc-500 mt-1">{t.shop.subtitle}</p>
        </div>
        <StorefrontTrustBar />

        {/* Department tabs (top-level) */}
        {!loading && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
            {['All', ...DEPARTMENTS].map(dep => (
              <button key={dep} onClick={() => selectDepartment(dep)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shrink-0 ${department === dep ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
                {dep !== 'All' && <span>{DEPARTMENT_META[dep]?.icon}</span>}
                {dep === 'All' ? t.shop.allProducts : (t.shop.departmentNames?.[dep] || dep)}
                {deptCount(dep) > 0 && (
                  <span className={`text-xs rounded-full px-1.5 ${department === dep ? 'bg-white/20' : 'bg-zinc-800'}`}>{deptCount(dep)}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
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

        {/* Customer feedback box */}
        <SuggestionBox />

        {/* Stock filter tabs */}
        {!loading && (
          <div className="flex gap-2 mb-4">
            <button onClick={() => setStockFilter('instock')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${stockFilter === 'instock' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'}`}>
              <span className={`w-2 h-2 rounded-full ${stockFilter === 'instock' ? 'bg-white' : 'bg-green-400'}`} />
              {t.shop.inStock}
              {inStockCount > 0 && <span className={`text-xs rounded-full px-1.5 ${stockFilter === 'instock' ? 'bg-white/20' : 'bg-zinc-700'}`}>{inStockCount}</span>}
            </button>
            <button onClick={() => setStockFilter('all')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${stockFilter === 'all' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'}`}>
              {t.shop.allProducts}
              {allGroups.length > 0 && <span className={`ml-1.5 text-xs rounded-full px-1.5 ${stockFilter === 'all' ? 'bg-white/20' : 'bg-zinc-700'}`}>{allGroups.length}</span>}
            </button>
          </div>
        )}

        {/* Category filter (sub-filter within department) */}
        {categories.length > 1 && !loading && (
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${category === cat ? 'bg-zinc-700 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
                {cat === 'All' ? t.shop.allCategories : (t.shop.categoryNames?.[cat] || cat)}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-red-400">{error}</div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="text-center py-24">
            <p className="text-zinc-400 text-lg font-semibold">{search.trim() ? t.shop.noResults : showComingSoon ? t.home.emptyDept(departmentName) : t.shop.noProducts}</p>
            {!search.trim() && <p className="text-zinc-600 text-sm mt-1">{showComingSoon ? t.home.emptyDeptHint : t.shop.checkBack}</p>}
            {showComingSoon && <DepartmentNotifyBox department={department} />}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {groups.map((group, i) => (
            <ProductGroupCard
              key={`${group[0].name}-${i}`}
              group={group}
              onOpenModal={openModal}
              showWasPrice={showWasPrice}
            />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
