import { useState, useEffect, useCallback } from 'react'
import { authHeaders } from '../lib/authHeaders'

const DISMISS_KEY = 'pl_banner_dismissed_v'
const FS_DISMISS_KEY = 'pl_fs_banner_dismissed'
const FS_ALL_DISMISS_KEY = 'pl_fs_all_dismissed'

const GRADIENTS = {
  fire:   'from-orange-600 via-red-600 to-rose-700',
  gold:   'from-yellow-500 via-amber-500 to-orange-600',
  blue:   'from-blue-600 via-blue-700 to-indigo-700',
  purple: 'from-violet-600 via-purple-700 to-indigo-700',
  green:  'from-emerald-500 via-teal-600 to-cyan-700',
}

function FreeShippingBar({ threshold, allOrders, onDismiss }) {
  return (
    <div className="relative overflow-hidden border-b border-white/10 bg-zinc-950 select-none">
      <div className="relative max-w-7xl mx-auto px-10 py-1 flex items-center justify-center gap-2 min-h-[30px]">
        <div className="flex items-center gap-2 flex-wrap justify-center text-white text-[11px] sm:text-xs font-black uppercase tracking-[0.16em] leading-tight">
          <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
          {allOrders ? (
            <>
              <span>FREE SHIPPING ON ALL ORDERS</span>
              <span className="hidden sm:inline text-white/45 font-semibold normal-case tracking-normal">No minimum. No code needed.</span>
            </>
          ) : (
            <>
              <span>FREE SHIPPING ${Number(threshold).toFixed(0)}+</span>
              <span className="hidden sm:inline text-white/45 font-semibold normal-case tracking-normal">No code needed.</span>
            </>
          )}
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10"
        aria-label="Dismiss">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}

export default function PromoBanner() {
  const [banner, setBanner] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [fsBanner, setFsBanner] = useState(null)   // { threshold }
  const [fsDismissed, setFsDismissed] = useState(false)
  const [fsAll, setFsAll] = useState(false)        // free shipping on ALL orders
  const [fsAllDismissed, setFsAllDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/storefront/config', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        // Promo banner
        if (d.banner?.enabled) {
          const key = DISMISS_KEY + (d.banner.code || '')
          if (!sessionStorage.getItem(key)) {
            setBanner({ ...d.banner, _key: key })
          } else {
            setDismissed(true)
          }
        }
        // Free shipping on ALL orders (takes priority over the threshold banner)
        if (d.free_shipping_all) {
          if (!sessionStorage.getItem(FS_ALL_DISMISS_KEY)) setFsAll(true)
          else setFsAllDismissed(true)
        }
        // Free shipping threshold banner (only when the all-orders mode is off)
        else if (d.free_shipping_banner_enabled && Number(d.free_shipping_threshold) > 0) {
          if (!sessionStorage.getItem(FS_DISMISS_KEY)) {
            setFsBanner({ threshold: d.free_shipping_threshold })
          } else {
            setFsDismissed(true)
          }
        }
      })
      .catch(() => {})
  }, [])

  const dismissPromo = () => {
    if (banner?._key) sessionStorage.setItem(banner._key, '1')
    setDismissed(true)
  }

  const dismissFs = () => {
    sessionStorage.setItem(FS_DISMISS_KEY, '1')
    setFsDismissed(true)
  }

  const dismissFsAll = () => {
    sessionStorage.setItem(FS_ALL_DISMISS_KEY, '1')
    setFsAllDismissed(true)
  }

  const copyCode = useCallback(async () => {
    if (!banner?.code) return
    try {
      await navigator.clipboard.writeText(banner.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {}
  }, [banner?.code])

  const showPromo = banner && !dismissed
  const showFsAll = fsAll && !fsAllDismissed
  const showFs = fsBanner && !fsDismissed && !showFsAll

  if (!showPromo && !showFs && !showFsAll) return null

  const gradient = showPromo ? (GRADIENTS[banner.style] || GRADIENTS.fire) : null

  return (
    <div>
      {/* Free Shipping Banner — shown on top if active */}
      {showFsAll && (
        <FreeShippingBar allOrders onDismiss={dismissFsAll} />
      )}
      {showFs && (
        <FreeShippingBar threshold={fsBanner.threshold} onDismiss={dismissFs} />
      )}

      {/* Promo / Discount Code Banner */}
      {showPromo && (
        <div className={`relative bg-gradient-to-r ${gradient} overflow-hidden select-none`}>
          {/* Shimmer sweep */}
          <div className="absolute inset-0 w-16 bg-white/20 blur-xl animate-banner-shimmer pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-10 py-2 flex items-center justify-center gap-2 min-h-[38px]">
            <div className="flex items-center gap-2 flex-wrap justify-center text-white text-xs sm:text-sm font-semibold leading-tight">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />

              {banner.pre_text && (
                <span className="drop-shadow-sm">{banner.pre_text}</span>
              )}

              {banner.code && (
                <button
                  onClick={copyCode}
                  className="inline-flex items-center gap-1.5 bg-black/25 hover:bg-black/40 active:scale-95 border border-white/30 rounded-lg px-2.5 py-0.5 font-black tracking-widest text-white text-xs sm:text-sm transition-all duration-150 shadow-inner"
                  title="Click to copy">
                  {banner.code}
                  <span className="opacity-80">
                    {copied
                      ? <svg className="w-3.5 h-3.5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                      : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={2}/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    }
                  </span>
                </button>
              )}

              {banner.post_text && (
                <span className="drop-shadow-sm">{banner.post_text}</span>
              )}

              {copied && (
                <span className="text-white/80 text-xs font-normal italic animate-pulse">Copied!</span>
              )}
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={dismissPromo}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-1.5 rounded-full hover:bg-black/20"
            aria-label="Dismiss banner">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
