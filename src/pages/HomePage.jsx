import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import CartSidebar from '../components/CartSidebar'
import Footer from '../components/Footer'
import { useT } from '../context/LanguageContext'
import { authHeaders } from '../lib/authHeaders'
import { useProductCatalog } from '../hooks/useProductCatalog'
import { ProductGroupCard, ProductModal, groupByName } from '../components/ProductGrid'
import { departmentSlug, departmentOf } from '../lib/collections'
import { BRAND_FILTERS, HOME_DEPARTMENTS, brandForProduct, publicCountLabel } from '../lib/storefrontMeta'

const WAITLIST_DEPARTMENTS = ['Health & Wellness', 'Beauty & Grooming', 'Apparel & Gear']

const FALLBACK_DEPARTMENT_IMAGES = {
  'Health & Wellness': '/hero/wellness.jpg',
  'Beauty & Grooming': '/hero/beauty.jpg',
  'Peptides': '/hero/peptides.jpg',
}

const inStock = (p) => p.in_stock !== 0 && p.in_stock !== false

function formatLaunchDate(epoch) {
  if (!epoch) return ''
  return new Date(epoch * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function launchRemaining(epoch) {
  const total = Math.max(0, Number(epoch || 0) * 1000 - Date.now())
  const days = Math.floor(total / 86400000)
  const hours = Math.floor((total % 86400000) / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  return { days, hours, minutes, seconds }
}

function CountdownUnit({ value, label }) {
  return (
    <div className="min-w-[58px] rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-center">
      <div className="font-mono text-xl font-black tabular-nums text-white">{String(value).padStart(2, '0')}</div>
      <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">{label}</div>
    </div>
  )
}

function ProductLaunchStrip() {
  const [launches, setLaunches] = useState([])
  const [, setTick] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/storefront/launches', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setLaunches(Array.isArray(data.launches) ? data.launches : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!launches.length) return
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [launches.length])

  const launch = launches.find(p => Number(p.release_at || 0) * 1000 > Date.now()) || launches[0]
  if (!launch) return null

  const remaining = launchRemaining(launch.release_at)
  const goToLaunch = () => navigate(`/collections/${departmentSlug(launch.department)}`)

  return (
    <section className="border-y border-blue-500/20 bg-zinc-950">
      <button
        onClick={goToLaunch}
        className="group mx-auto grid w-full max-w-7xl gap-4 px-4 py-5 text-left transition-colors hover:bg-white/[0.02] md:grid-cols-[86px_1fr_auto] md:items-center"
        aria-label={`Upcoming product launch: ${launch.name}`}
      >
        <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 md:h-20 md:w-20">
          {launch.image_url ? (
            <img src={launch.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.28),rgba(0,0,0,0)_55%),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:100%_100%,18px_18px]" />
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-300">Next Product Launch</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">{launch.name}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {launch.tagline || `${launch.department} release`} <span className="text-zinc-600">•</span> Releases {formatLaunchDate(launch.release_at)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <CountdownUnit value={remaining.days} label="Days" />
          <CountdownUnit value={remaining.hours} label="Hours" />
          <CountdownUnit value={remaining.minutes} label="Min" />
          <CountdownUnit value={remaining.seconds} label="Sec" />
        </div>
      </button>
    </section>
  )
}

function SectionHeader({ eyebrow, title, body, align = 'center' }) {
  const centered = align === 'center'
  return (
    <div className={centered ? 'text-center max-w-2xl mx-auto' : 'max-w-2xl'}>
      {eyebrow && <p className="text-blue-300 text-[11px] font-black uppercase tracking-[0.24em]">{eyebrow}</p>}
      <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white tracking-tight break-words">{title}</h2>
      {body && <p className="mt-2 text-sm sm:text-base text-zinc-400 leading-relaxed">{body}</p>}
    </div>
  )
}

function StatPill({ label, children }) {
  return (
    <div className="inline-flex min-h-[36px] items-center justify-center gap-2 border border-white/10 bg-zinc-950/55 px-3 py-2 text-center text-xs font-bold text-zinc-200 backdrop-blur">
      <span className="h-4 w-4 text-blue-300">{children}</span>
      <span>{label}</span>
    </div>
  )
}

function DepartmentArtwork({ dep, image, title, onImageError }) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        loading="lazy"
        onError={onImageError}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
    )
  }

  if (dep === 'Apparel & Gear') {
    return (
      <div className="absolute inset-0 bg-black">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(163,230,53,0.28),rgba(0,0,0,0)_42%),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:100%_100%,28px_28px]" />
        <div className="absolute left-6 top-6 text-lime-300 text-[11px] font-black tracking-[0.35em]">VYTRA</div>
        <div className="absolute bottom-8 left-6 right-6">
          <div className="h-20 w-24 border border-lime-300/45 bg-zinc-950/70" />
          <div className="mt-3 h-3 w-44 bg-lime-300/80" />
          <div className="mt-2 h-3 w-28 bg-white/30" />
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 bg-zinc-950">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(59,130,246,0.22),rgba(0,0,0,0)_50%),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:100%_100%,30px_30px]" />
      <div className="absolute left-6 top-6 text-blue-300 text-[11px] font-black tracking-[0.28em]">{title}</div>
      <div className="absolute bottom-7 left-6 right-6 grid grid-cols-4 gap-2">
        <span className="h-16 border border-blue-300/30 bg-blue-400/10" />
        <span className="h-24 border border-white/15 bg-white/5" />
        <span className="h-12 border border-blue-300/25 bg-blue-400/10" />
        <span className="h-20 border border-white/15 bg-white/5" />
      </div>
    </div>
  )
}

function BeautySplitArtwork() {
  return (
    <div className="absolute inset-0 grid grid-cols-2">
      <div className="relative overflow-hidden bg-[#f4efe6] text-zinc-950">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.75),rgba(210,190,160,0.22))]" />
        <div className="absolute left-5 top-5 text-[11px] font-black tracking-[0.26em]">VELOURIX</div>
        <div className="absolute bottom-7 left-5 right-5">
          <div className="h-20 w-14 bg-white/80 border border-zinc-300" />
          <div className="mt-3 h-2 w-24 bg-zinc-950/70" />
        </div>
      </div>
      <div className="relative overflow-hidden bg-zinc-950 text-white">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(39,39,42,0.2))]" />
        <div className="absolute left-5 top-5 text-[11px] font-black tracking-[0.26em]">MATRIX</div>
        <div className="absolute bottom-7 left-5 right-5">
          <div className="h-24 w-12 border border-zinc-500 bg-black" />
          <div className="mt-3 h-2 w-20 bg-zinc-400" />
        </div>
      </div>
    </div>
  )
}

function DepartmentCard({ dep, copy, count, image, onOpen, t }) {
  const [imageFailed, setImageFailed] = useState(false)
  const badge = publicCountLabel(count, dep, t)
  const usableImage = imageFailed ? '' : image
  const hasImage = !!usableImage

  useEffect(() => { setImageFailed(false) }, [image])

  return (
    <button
      onClick={onOpen}
      className="group flex h-full min-h-[410px] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-black/30"
    >
      <div className="relative h-64 overflow-hidden bg-zinc-950">
        {dep === 'Beauty & Grooming' && !hasImage ? (
          <BeautySplitArtwork />
        ) : (
          <DepartmentArtwork dep={dep} image={usableImage} title={copy.brand || copy.name} onImageError={() => setImageFailed(true)} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/10 to-black/10" />
        <span className="absolute right-4 top-4 border border-white/15 bg-black/65 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white backdrop-blur">
          {badge}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-300">{copy.brand}</p>
        <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{copy.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{copy.description}</p>
        <span className="mt-auto inline-flex pt-6 text-sm font-black uppercase tracking-[0.12em] text-white transition-colors group-hover:text-blue-300">
          {copy.cta}
        </span>
      </div>
    </button>
  )
}

function BrandBlock({ brand }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
      <div className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">{brand.role}</div>
      <div className="mt-3 text-xl font-black tracking-tight text-white">{brand.name}</div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{brand.description}</p>
    </div>
  )
}

function FeaturedRail({ products, showWasPrice, t }) {
  const [brand, setBrand] = useState('All')
  const [modal, setModal] = useState(null)

  const groups = useMemo(() => {
    const filtered = products
      .filter(inStock)
      .filter(p => brand === 'All' || brandForProduct(p) === brand)
      .sort((a, b) => (b.id || 0) - (a.id || 0))
    return groupByName(filtered).slice(0, 10)
  }, [products, brand])

  return (
    <section className="border-y border-zinc-800/70 bg-zinc-950/70 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeader align="left" eyebrow={t.home.featuredEyebrow} title={t.home.featuredTitle} body={t.home.featuredBody} />
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {BRAND_FILTERS.map(option => (
              <button
                key={option}
                onClick={() => setBrand(option)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-colors ${
                  brand === option
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-white'
                }`}
              >
                {option === 'All' ? t.shop.allProducts : option}
              </button>
            ))}
          </div>
        </div>

        {modal && (
          <ProductModal
            group={modal.group}
            initialVariant={modal.variant}
            onClose={() => setModal(null)}
            coaDocs={[]}
            showWasPrice={showWasPrice}
          />
        )}

        {groups.length > 0 ? (
          <div className="mt-7 flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
            {groups.map((group, i) => (
              <div key={`${group[0].name}-${i}`} className="w-[220px] shrink-0 sm:w-[240px]">
                <ProductGroupCard
                  group={group}
                  onOpenModal={(g, v) => setModal({ group: g, variant: v })}
                  showWasPrice={showWasPrice}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-7 border border-zinc-800 bg-zinc-900/60 px-4 py-10 text-center">
            <p className="text-sm font-bold text-zinc-400">{t.home.featuredEmpty}</p>
          </div>
        )}
      </div>
    </section>
  )
}

function VytraFeature({ t, image, onWellness, onApparel }) {
  const [imageFailed, setImageFailed] = useState(false)
  const usableImage = imageFailed ? '' : image

  useEffect(() => { setImageFailed(false) }, [image])

  return (
    <section data-storefront-slot="vytra-feature" className="bg-black py-12 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[1fr_0.85fr] lg:items-center">
        <div>
          <p className="text-lime-300 text-[11px] font-black uppercase tracking-[0.34em]">VYTRA</p>
          <h2 className="mt-3 text-4xl font-black leading-none tracking-tight text-white sm:text-6xl">
            {t.home.vytraLine1}<br />
            <span className="text-lime-300">{t.home.vytraLine2}</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-300">{t.home.vytraBody}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button onClick={onWellness} className="rounded-lg bg-lime-300 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-black transition-colors hover:bg-lime-200">
              {t.home.shopWellness}
            </button>
            <button onClick={onApparel} className="rounded-lg border border-lime-300/50 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-lime-200 transition-colors hover:bg-lime-300/10">
              {t.home.shopApparel}
            </button>
          </div>
        </div>
        <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-lime-300/25 bg-zinc-950">
          {usableImage ? (
            <img
              src={usableImage}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(163,230,53,0.35),rgba(0,0,0,0)_38%),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:100%_100%,32px_32px]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/15" />
          <div className="absolute left-8 top-8 text-[12px] font-black tracking-[0.4em] text-lime-200">FUEL BETTER</div>
          {!usableImage && (
            <div className="absolute bottom-8 left-8 right-8">
              <div className="h-28 w-24 border border-lime-300/40 bg-black/60" />
              <div className="mt-4 h-3 w-56 max-w-full bg-lime-300" />
              <div className="mt-2 h-3 w-36 bg-white/25" />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function WhyPryme({ t }) {
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <SectionHeader title={t.home.whyTitle} body={t.home.whyBody} />
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t.home.whyItems.map(item => (
            <div key={item.title} className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <div className="h-1 w-10 bg-blue-500" />
              <h3 className="mt-4 text-base font-black text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PrymeListSignup({ t }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')

  const submit = async (e) => {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setStatus('error')
      return
    }
    setStatus('loading')
    try {
      const responses = await Promise.all(WAITLIST_DEPARTMENTS.map(department => fetch('/api/departments/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, email: clean }),
      })))
      if (responses.some(r => !r.ok)) throw new Error('waitlist failed')
      setEmail('')
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section className="border-t border-zinc-800 bg-zinc-950 py-12 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-7 px-4 lg:grid-cols-[0.9fr_1fr] lg:items-center">
        <div>
          <p className="text-blue-300 text-[11px] font-black uppercase tracking-[0.24em]">{t.home.joinEyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white">{t.home.joinTitle}</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">{t.home.joinBody}</p>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="sr-only" htmlFor="pryme-list-email">{t.checkout.email}</label>
          <input
            id="pryme-list-email"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); if (status !== 'loading') setStatus('idle') }}
            placeholder={t.home.joinPlaceholder}
            className="min-h-[46px] rounded-lg border border-zinc-800 bg-zinc-900 px-4 text-white placeholder-zinc-500 outline-none transition-colors focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="min-h-[46px] rounded-lg bg-blue-600 px-5 text-sm font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            {status === 'loading' ? t.home.joinLoading : t.home.joinButton}
          </button>
          <p className={`sm:col-span-2 text-sm ${status === 'success' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-zinc-600'}`} aria-live="polite">
            {status === 'success' ? t.home.joinSuccess : status === 'error' ? t.home.joinError : t.home.joinNote}
          </p>
        </form>
      </div>
    </section>
  )
}

export default function HomePage() {
  const { products, showWasPrice } = useProductCatalog()
  const [heroes, setHeroes] = useState({})
  const [homeHero, setHomeHero] = useState('')
  const navigate = useNavigate()
  const t = useT()
  const departmentsRef = useRef(null)

  useEffect(() => {
    fetch('/api/storefront/home-media', { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        setHeroes(data.heroes || {})
        setHomeHero(data.homeHero || '')
      })
      .catch(() => {})
  }, [])

  const countFor = (dep) => new Set(products.filter(p => departmentOf(p) === dep && inStock(p)).map(p => p.name)).size
  const scrollToDepartments = () => departmentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const openDepartment = (dep) => navigate(`/collections/${departmentSlug(dep)}`)

  return (
    <div data-canonical-domain="prymelabs.net" className="min-h-screen bg-[#07080b] text-white">
      <Navbar />
      <CartSidebar />

      <section className="relative overflow-hidden border-b border-zinc-800/70">
        <div className="pointer-events-none absolute inset-0">
          <img
            src={homeHero || '/hero/main-lab-sm.jpg'}
            srcSet={homeHero ? undefined : '/hero/main-lab-sm.jpg 1100w, /hero/main-lab.jpg 2200w'}
            sizes="100vw"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,11,0.45),rgba(7,8,11,0.78)_52%,#07080b_100%)]" />
          <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(90deg,#ffffff_1px,transparent_1px),linear-gradient(180deg,#ffffff_1px,transparent_1px)] bg-[length:42px_42px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-blue-300 text-[11px] font-black uppercase tracking-[0.28em]">{t.home.heroEyebrow}</p>
            <h1 className="mt-4 text-5xl font-black leading-[0.92] tracking-tight text-white sm:text-7xl">
              PRYME<span className="text-blue-500">LABS</span>
            </h1>
            <p className="mt-5 max-w-[22rem] text-2xl font-black leading-tight text-zinc-100 sm:max-w-2xl sm:text-4xl">
              {(t.home.heroStatementLines || [t.home.heroStatement]).map((line, index, lines) => (
                <span key={line} className="block sm:inline">
                  {line}{index < lines.length - 1 && <span className="hidden sm:inline"> </span>}
                </span>
              ))}
            </p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t.home.heroSubcopy}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={scrollToDepartments}
                className="min-h-[46px] rounded-lg bg-blue-600 px-6 text-sm font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-blue-500"
              >
                {t.home.browse}
              </button>
              <button
                onClick={() => navigate('/shop')}
                className="min-h-[46px] rounded-lg border border-zinc-700 bg-zinc-950/70 px-6 text-sm font-black uppercase tracking-[0.12em] text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
              >
                {t.home.fullCatalog}
              </button>
            </div>

            <div className="mt-8 grid max-w-[22rem] grid-cols-2 gap-2 sm:flex sm:max-w-none sm:flex-wrap">
              <StatPill label={t.home.pills.coa}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4M12 3l7 4v5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V7l7-4z" /></svg>
              </StatPill>
              <StatPill label={t.home.pills.shipping}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 7h11v10H3V7zm11 3h4l3 3v4h-7v-7zM7 20a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" /></svg>
              </StatPill>
              <StatPill label={t.home.pills.checkout}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M7 11V8a5 5 0 0110 0v3M6 11h12l-1 10H7L6 11z" /></svg>
              </StatPill>
              <StatPill label={t.home.pills.reviews}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 17.5L6.8 20l1-5.7L3.6 10.2l5.8-.8L12 4.2l2.6 5.2 5.8.8-4.2 4.1 1 5.7L12 17.5z" /></svg>
              </StatPill>
            </div>
          </div>
        </div>
      </section>

      <ProductLaunchStrip />

      <main ref={departmentsRef} className="scroll-mt-24">
        <section className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
          <SectionHeader eyebrow={t.home.departmentsEyebrow} title={t.home.shopByDepartment} body={t.home.chooseDepartment} />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {HOME_DEPARTMENTS.map(dep => (
              <DepartmentCard
                key={dep}
                dep={dep}
                copy={t.home.departmentCards[dep]}
                count={countFor(dep)}
                image={heroes[dep] || FALLBACK_DEPARTMENT_IMAGES[dep]}
                onOpen={() => openDepartment(dep)}
                t={t}
              />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-12 sm:pb-16">
          <SectionHeader title={t.home.brandsTitle} body={t.home.brandsBody} />
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {t.home.brandBlocks.map(brand => <BrandBlock key={brand.name} brand={brand} />)}
          </div>
        </section>

        <FeaturedRail products={products} showWasPrice={showWasPrice} t={t} />

        <VytraFeature
          t={t}
          image={heroes['VYTRA Feature']}
          onWellness={() => openDepartment('Health & Wellness')}
          onApparel={() => openDepartment('Apparel & Gear')}
        />

        <WhyPryme t={t} />

        <PrymeListSignup t={t} />
      </main>

      <Footer />
    </div>
  )
}
