import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useLanguage, useT } from '../context/LanguageContext'
import PromoBanner from './PromoBanner'
import { DEPARTMENTS, DEPARTMENT_COLLECTIONS, slugify } from '../lib/collections'

function LangToggle() {
  const { lang, setLanguage } = useLanguage()
  return (
    <div className="flex rounded-lg overflow-hidden border border-zinc-800">
      {['en', 'es'].map(l => (
        <button key={l} onClick={() => setLanguage(l)}
          className={`px-2.5 py-1.5 text-xs font-bold transition-colors uppercase ${lang === l ? 'bg-blue-600 text-white' : 'bg-transparent text-zinc-500 hover:text-white'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const { itemCount, setIsOpen } = useCart()
  const navigate = useNavigate()
  const t = useT()
  const [openDept, setOpenDept] = useState(null)   // desktop dropdown
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileDept, setMobileDept] = useState(null) // mobile accordion

  const handleLogout = () => { logout(); navigate('/auth') }
  const deptName = (dep) => t.shop.departmentNames?.[dep] || dep
  const go = (path) => { setOpenDept(null); setMobileOpen(false); setMobileDept(null); navigate(path) }

  // Menu links for a department: "Shop All" + its sub-collections
  const deptLinks = (dep) => {
    const slug = slugify(dep)
    return [
      { name: `${t.collections.shopAll} ${deptName(dep)}`, path: `/collections/${slug}` },
      ...(DEPARTMENT_COLLECTIONS[dep] || []).map(c => ({ name: c, path: `/collections/${slug}/${slugify(c)}` })),
    ]
  }

  return (
    <div className="sticky top-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <PromoBanner />
      <nav className="bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/60" data-build="cache-bust-1">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-2">

          {/* Left: mobile menu button + logo + desktop department nav */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            {/* Mobile hamburger */}
            <button onClick={() => setMobileOpen(o => !o)}
              className="sm:hidden p-2 -ml-2 text-zinc-300 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
              aria-label="Menu" aria-expanded={mobileOpen}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>

            {/* Logo */}
            <button onClick={() => go('/')}
              className="flex items-center gap-1.5 text-lg sm:text-xl font-black text-white tracking-widest hover:opacity-80 transition-opacity shrink-0">
              <img src="/logo-mark.png" alt="" className="h-6 sm:h-7 w-auto" />
              PRYME<span className="text-blue-500">LABS</span>
            </button>

            {/* Desktop department nav with dropdowns */}
            <div className="hidden sm:flex items-center gap-0.5">
              <button onClick={() => go('/')}
                className="text-sm text-zinc-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 font-medium">
                {t.nav?.home || 'Home'}
              </button>
              {DEPARTMENTS.map(dep => (
                <div key={dep} className="relative"
                  onMouseEnter={() => setOpenDept(dep)} onMouseLeave={() => setOpenDept(null)}>
                  <button onClick={() => go(`/collections/${slugify(dep)}`)}
                    className={`flex items-center gap-1 text-sm transition-colors px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 font-medium ${openDept === dep ? 'text-white bg-zinc-800' : 'text-zinc-400 hover:text-white'}`}>
                    {deptName(dep)}
                    <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDept === dep && (
                    <div className="absolute left-0 top-full pt-1 z-40">
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1.5 min-w-[230px] max-h-[70vh] overflow-y-auto">
                        {deptLinks(dep).map((l, i) => (
                          <button key={l.path} onClick={() => go(l.path)}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-zinc-800 ${i === 0 ? 'text-white font-semibold' : 'text-zinc-400 hover:text-white'}`}>
                            {l.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            {user && (
              <span className="text-zinc-400 text-sm hidden lg:block mr-1">
                {t.nav.hey} <span className="text-white font-medium">{user.name.split(' ')[0]}</span>
              </span>
            )}

            {user && (
              <>
                <button onClick={() => navigate('/orders')}
                  className="text-sm text-zinc-500 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-zinc-800 hidden sm:block">
                  {t.nav.myOrders}
                </button>
                <button onClick={() => navigate('/orders')}
                  className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800 sm:hidden"
                  aria-label={t.nav.myOrders}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </button>
              </>
            )}

            <LangToggle />

            <button onClick={() => setIsOpen(true)}
              className="relative p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
              aria-label="Open cart">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold leading-none">
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              )}
            </button>

            {user ? (
              <button onClick={handleLogout}
                className="text-xs sm:text-sm text-zinc-500 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-zinc-800">
                {t.nav.logout}
              </button>
            ) : (
              <button onClick={() => navigate('/auth')}
                className="text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors px-3 py-1.5 rounded-lg">
                {t.nav.signIn}
              </button>
            )}
          </div>
        </div>

        {/* Mobile menu panel — accordion of departments + collections */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-zinc-800/60 bg-zinc-950 max-h-[70vh] overflow-y-auto">
            <div className="px-4 py-2">
              <button onClick={() => go('/')}
                className="w-full text-left py-2.5 text-sm font-semibold text-white border-b border-zinc-800/60">
                {t.nav?.home || 'Home'}
              </button>
              {DEPARTMENTS.map(dep => {
                const expanded = mobileDept === dep
                return (
                  <div key={dep} className="border-b border-zinc-800/60">
                    <button onClick={() => setMobileDept(expanded ? null : dep)}
                      className="w-full flex items-center justify-between py-2.5 text-sm font-semibold text-white">
                      {deptName(dep)}
                      <svg className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expanded && (
                      <div className="pb-2">
                        {deptLinks(dep).map((l, i) => (
                          <button key={l.path} onClick={() => go(l.path)}
                            className={`w-full text-left py-2 pl-3 text-sm transition-colors ${i === 0 ? 'text-blue-400 font-semibold' : 'text-zinc-400 hover:text-white'}`}>
                            {l.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <button onClick={() => go('/shop')}
                className="w-full text-left py-2.5 text-sm font-semibold text-white">
                {t.nav?.shop || 'Shop'}
              </button>
            </div>
          </div>
        )}
      </nav>
    </div>
  )
}
