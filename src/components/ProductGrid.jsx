import { useState, useEffect } from 'react'
import { useCart } from '../context/CartContext'
import { useT } from '../context/LanguageContext'

// ── Storefront departments (home-page tabs) ──────────────────────────────────
export const DEPARTMENTS = ['Health & Wellness', 'Beauty & Grooming', 'Apparel & Gear', 'Peptides']
export const DEPARTMENT_META = {
  'Peptides':          { icon: '🧬', blurb: 'Research compounds & laboratory products' },
  'Health & Wellness': { icon: '💊', blurb: 'Performance nutrition, hydration & everyday wellness' },
  'Beauty & Grooming': { icon: '🧴', blurb: 'Skin, hair, beard & body care essentials' },
  'Apparel & Gear':    { icon: '🧢', blurb: 'Performance apparel, training essentials & gear' },
}
export function departmentOf(p) {
  return DEPARTMENTS.includes(p?.department) ? p.department : 'Peptides'
}

// Canonical category display order (sub-filter within a department)
export const CATEGORY_ORDER = [
  'GLP Research',
  'Recovery & Repair',
  'Peptide Hormones',
  'Neural & Cognitive',
  'Longevity Research',
  'Research Supplies',
  'Apparel',
  'Drinkware',
  'Gym Accessories',
  'Bags & Carry',
  'Stickers & Extras',
]

function bundlePackQty(p) {
  return isBundleProduct(p) ? Math.max(2, Number(p?.bundle_qty) || 2) : 1
}

// Group products by name; bundle groups sort smallest pack first, other groups in-stock-first
export function groupByName(products) {
  const map = new Map()
  for (const p of products) {
    if (!map.has(p.name)) map.set(p.name, [])
    map.get(p.name).push(p)
  }
  for (const variants of map.values()) {
    const hasBundleOptions = variants.some(isBundleProduct)
    variants.sort((a, b) => {
      if (hasBundleOptions) {
        const qtyDiff = bundlePackQty(a) - bundlePackQty(b)
        if (qtyDiff !== 0) return qtyDiff
      }
      const aIn = a.in_stock !== 0 && a.in_stock !== false
      const bIn = b.in_stock !== 0 && b.in_stock !== false
      if (aIn && !bIn) return -1
      if (!aIn && bIn) return 1
      return Number(a.id || 0) - Number(b.id || 0)
    })
  }
  return Array.from(map.values())
}

// Full-screen zoomed view of a single product photo. Works for any image src,
// so it applies uniformly to every existing and future product with zero
// per-product setup — it just displays whatever photo is passed in.
export function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 cursor-zoom-out" onClick={onClose}>
      <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-sm" />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-full flex items-center justify-center transition-colors"
        aria-label="Close">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img src={src} alt={alt} className="relative max-h-[90vh] max-w-[90vw] object-contain" onClick={e => e.stopPropagation()} />
    </div>
  )
}

export function ImageFallback({ name }) {
  const initials = name ? name.slice(0, 2).toUpperCase() : 'PL'
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 p-3 gap-2">
      <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center">
        <span className="text-blue-400 font-black text-lg">{initials}</span>
      </div>
      <span className="text-zinc-600 text-xs text-center leading-tight line-clamp-2 font-medium">{name}</span>
    </div>
  )
}

function isBundleProduct(p) {
  return p?.bundle_of_product_id != null
}

function bundleLabel(p) {
  const qty = Math.max(2, Number(p?.bundle_qty) || 2)
  return `${qty}-pack bundle`
}

export function ProductModal({ group, initialVariant, onClose, coaDocs, showWasPrice = true }) {
  const { addItem } = useCart()
  const t = useT()
  const isEs = t.lang === 'ES'
  const [selected, setSelected] = useState(initialVariant || group[0])
  const [imgFailed, setImgFailed] = useState(false)
  const [limitMsg, setLimitMsg] = useState(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const coa = (coaDocs || []).find(d => d.title.trim().toLowerCase() === selected.name.trim().toLowerCase())

  const photos = (Array.isArray(selected.photos) && selected.photos.length ? selected.photos : (selected.image_url ? [selected.image_url] : []))
  const mainSrc = photos[activePhoto] || photos[0] || selected.image_url

  useEffect(() => { setImgFailed(false); setLimitMsg(null); setActivePhoto(0) }, [selected])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const inStock = selected.in_stock !== 0 && selected.in_stock !== false
  const hasDiscount = selected.compare_at_price && Number(selected.compare_at_price) > Number(selected.price)
  const showImage = !!mainSrc && !imgFailed
  const hasMultipleSizes = group.length > 1
  const isBundle = isBundleProduct(selected)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full flex items-center justify-center transition-colors"
          aria-label="Close">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="overflow-y-auto">
          <div className="relative bg-zinc-950 flex items-center justify-center" style={{ height: '260px' }}>
            {showImage ? (
              <img src={mainSrc} alt={selected.name} className="h-full w-full object-contain p-4 cursor-zoom-in" onError={() => setImgFailed(true)} onClick={() => setLightboxOpen(true)} />
            ) : (
              <ImageFallback name={selected.name} />
            )}
            <span className={`absolute bottom-3 left-3 text-xs font-black px-2.5 py-1 rounded-full border ${inStock ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}>
              {inStock ? t.shop.inStock : t.product.outOfStock}
            </span>
            {selected.category && (
              <span className="absolute top-3 left-3 bg-zinc-950/85 backdrop-blur text-blue-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-800/40">
                {t.shop.categoryNames?.[selected.category] || selected.category}
              </span>
            )}
            {isBundle && (
              <span className="absolute bottom-3 right-3 bg-amber-500 text-zinc-950 text-xs font-black px-2 py-0.5 rounded-full">
                Bundle
              </span>
            )}
            {hasDiscount && inStock && (
              <span className="absolute top-3 right-12 bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-full">{t.shop.sale}</span>
            )}
          </div>

          {/* Thumbnail strip — multiple photos */}
          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pt-3">
              {photos.map((src, i) => (
                <button key={i} onClick={() => { setActivePhoto(i); setImgFailed(false) }}
                  className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${i === activePhoto ? 'border-blue-500' : 'border-zinc-700 hover:border-zinc-500'}`}>
                  <img src={src} alt={`${selected.name} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="p-5">
            <h2 className="text-white font-black text-xl leading-tight">{selected.name}</h2>

            {hasMultipleSizes && (
              <div className="mt-4 mb-1">
                <p className="text-zinc-500 text-xs font-semibold uppercase tracking-widest mb-2">{t.product.selectSize}</p>
                <div className="flex flex-wrap gap-2">
                  {group.map(v => {
                    const vInStock = v.in_stock !== 0 && v.in_stock !== false
                    const isActive = v.id === selected.id
                    return (
                      <button key={v.id} onClick={() => setSelected(v)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                          isActive ? 'bg-blue-600 border-blue-500 text-white'
                          : vInStock ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-blue-600/50 hover:text-white'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-600 line-through'
                        }`}>
                        {v.size || `Variant ${v.id}`}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex items-baseline gap-2.5 mt-4 mb-3">
              {hasDiscount && showWasPrice && (
                <span className="text-red-400 text-base line-through font-medium">${Number(selected.compare_at_price).toFixed(2)}</span>
              )}
              <span className="text-amber-400 font-black text-3xl">${Number(selected.price).toFixed(2)}</span>
              {isBundle && <span className="text-amber-300 text-xs font-bold uppercase tracking-wider">{bundleLabel(selected)}</span>}
            </div>

            {(selected.description || selected.description_es) && (
              <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                {isEs ? (selected.description_es || selected.description) : selected.description}
              </p>
            )}

            {isBundle && (
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 mb-4">
                <p className="text-amber-300 text-xs font-semibold">Bundle pricing · includes {Math.max(2, Number(selected.bundle_qty) || 2)} base pack{Math.max(2, Number(selected.bundle_qty) || 2) === 1 ? '' : 's'} / products</p>
              </div>
            )}

            {coa && (
              <a href={`/api/coa-file/${coa.file_key}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-blue-500/8 border border-blue-500/20 rounded-xl text-blue-400 hover:bg-blue-500/15 hover:border-blue-500/40 transition-colors text-sm font-semibold">
                📄 {t.product.viewCoa}
              </a>
            )}

            {departmentOf(selected) === 'Peptides' && (
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 mb-4">
                <p className="text-amber-400/80 text-xs font-semibold">⚠ {t.product.researchOnly} · {t.product.notForHuman}</p>
              </div>
            )}

            <button
              onClick={() => {
                if (!inStock) return
                const result = addItem(selected)
                if (result?.added === false) { setLimitMsg(t.product.onlyAvailable(result.max)); return }
                onClose()
              }}
              disabled={!inStock}
              className={`w-full py-3.5 rounded-xl font-bold text-base transition-all duration-150 ${
                inStock ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white shadow-lg shadow-blue-900/30'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}>
              {inStock ? t.product.addToCart : t.product.outOfStock}
            </button>
            {limitMsg && <p className="text-amber-400 text-xs mt-2 text-center font-medium">{limitMsg}</p>}
          </div>
        </div>
      </div>
      {lightboxOpen && showImage && (
        <ImageLightbox src={mainSrc} alt={selected.name} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  )
}

export function ProductGroupCard({ group, onOpenModal, showWasPrice = true }) {
  const { addItem } = useCart()
  const t = useT()
  const isEs = t.lang === 'ES'

  const defaultVariant = group.find(v => v.in_stock !== 0 && v.in_stock !== false) || group[0]
  const [selected, setSelected] = useState(defaultVariant)
  const [imgFailed, setImgFailed] = useState(false)
  const [limitMsg, setLimitMsg] = useState(null)

  useEffect(() => { setImgFailed(false); setLimitMsg(null) }, [selected])

  const inStock = selected.in_stock !== 0 && selected.in_stock !== false
  const hasDiscount = selected.compare_at_price && Number(selected.compare_at_price) > Number(selected.price)
  const showImage = !!selected.image_url && !imgFailed
  const hasMultipleSizes = group.length > 1
  const anyInStock = group.some(v => v.in_stock !== 0 && v.in_stock !== false)
  const isBundle = isBundleProduct(selected)

  return (
    <div className={`bg-zinc-900 border rounded-xl overflow-hidden group transition-all duration-300 flex flex-col ${anyInStock ? 'border-zinc-800 hover:border-blue-700/50' : 'border-zinc-800/50'}`}>
      <div className="relative bg-zinc-950 flex items-center justify-center overflow-hidden cursor-pointer" style={{ height: '180px' }}
        onClick={() => onOpenModal(group, selected)}>
        {showImage ? (
          <img src={selected.image_url} alt={selected.name}
            className={`h-full w-full object-contain p-2 transition-transform duration-500 ${anyInStock ? 'group-hover:scale-105' : 'opacity-60'}`}
            loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className={anyInStock ? '' : 'opacity-60'}><ImageFallback name={selected.name} /></div>
        )}
        {selected.category && (
          <span className="absolute top-2 left-2 bg-zinc-950/85 backdrop-blur text-blue-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-800/40">
            {t.shop.categoryNames?.[selected.category] || selected.category}
          </span>
        )}
        {hasDiscount && inStock && (
          <span className="absolute top-2 right-2 bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-full">{t.shop.sale}</span>
        )}
        {isBundle && (
          <span className="absolute bottom-2 right-2 bg-amber-500 text-zinc-950 text-xs font-black px-2 py-0.5 rounded-full">Bundle</span>
        )}
        <span className={`absolute bottom-2 left-2 text-xs font-black px-2 py-0.5 rounded-full border ${inStock ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-red-500/20 border-red-500/40 text-red-400'}`}>
          {inStock ? t.shop.inStock : t.product.outOfStock}
        </span>
        <div className="absolute inset-0 bg-zinc-950/0 group-hover:bg-zinc-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
          <span className="bg-zinc-900/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-600">{t.product.viewDetails}</span>
        </div>
      </div>

      <div className="p-3 flex flex-col flex-1">
        <div className="mb-2 flex-1">
          <h3 className="text-white font-bold text-sm leading-tight cursor-pointer hover:text-blue-400 transition-colors" onClick={() => onOpenModal(group, selected)}>
            {selected.name}
          </h3>
          {isBundle && <div className="text-amber-300 text-[11px] font-bold mt-1">{bundleLabel(selected)}</div>}
          {(selected.description || selected.description_es) && (
            <p className="text-zinc-500 text-xs mt-1 line-clamp-2 leading-relaxed">
              {isEs ? (selected.description_es || selected.description) : selected.description}
            </p>
          )}
        </div>

        {hasMultipleSizes && (
          <div className="flex flex-wrap gap-1 mb-2">
            {group.map(v => {
              const vInStock = v.in_stock !== 0 && v.in_stock !== false
              const isActive = v.id === selected.id
              return (
                <button key={v.id} onClick={() => setSelected(v)}
                  className={`px-2 py-0.5 rounded-md text-xs font-semibold border transition-all ${
                    isActive ? 'bg-blue-600 border-blue-500 text-white'
                    : vInStock ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-600 line-through'
                  }`}>
                  {v.size || `#${v.id}`}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-zinc-800/60">
          <div className="flex flex-col gap-0">
            {hasDiscount && showWasPrice && (
              <span className="text-red-400 text-xs line-through leading-tight font-medium">${Number(selected.compare_at_price).toFixed(2)}</span>
            )}
            <span className="text-amber-400 font-black text-lg leading-tight">${Number(selected.price).toFixed(2)}</span>
          </div>
          <button
            onClick={() => {
              if (!inStock) return
              const result = addItem(selected)
              if (result?.added === false) { setLimitMsg(t.product.onlyAvailable(result.max)); setTimeout(() => setLimitMsg(null), 2500) }
            }}
            disabled={!inStock}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 ${
              inStock ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}>
            {inStock ? t.product.addToCart : t.product.outOfStock}
          </button>
        </div>

        {limitMsg ? (
          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/40"><span className="text-amber-400 text-xs font-medium">{limitMsg}</span></div>
        ) : departmentOf(selected) === 'Peptides' ? (
          <div className="mt-1.5 pt-1.5 border-t border-zinc-800/40"><span className="text-zinc-600 text-xs">{t.product.researchOnly}</span></div>
        ) : null}
      </div>
    </div>
  )
}

// Convenience grid: groups a flat product list by name and renders cards + a
// shared product modal. Used by both the Home page tabs and any simple listing.
export function ProductGrid({ products, coaDocs = [], showWasPrice = true, emptyLabel, emptyHint }) {
  const [modal, setModal] = useState(null)
  const t = useT()
  const groups = groupByName(products).sort((a, b) => (a[0].name || '').localeCompare(b[0].name || ''))

  if (groups.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-400 text-lg font-semibold">{emptyLabel || t.shop.noProducts}</p>
        {emptyHint && <p className="text-zinc-600 text-sm mt-1">{emptyHint}</p>}
      </div>
    )
  }

  return (
    <>
      {modal && (
        <ProductModal group={modal.group} initialVariant={modal.variant} onClose={() => setModal(null)} coaDocs={coaDocs} showWasPrice={showWasPrice} />
      )}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {groups.map((group, i) => (
          <ProductGroupCard key={`${group[0].name}-${i}`} group={group} onOpenModal={(g, v) => setModal({ group: g, variant: v })} showWasPrice={showWasPrice} />
        ))}
      </div>
    </>
  )
}
