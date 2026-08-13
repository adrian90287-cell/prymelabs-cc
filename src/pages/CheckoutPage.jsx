import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useLanguage, useT } from '../context/LanguageContext'
import Navbar from '../components/Navbar'
import CartSidebar from '../components/CartSidebar'
import Footer from '../components/Footer'
import { authHeaders } from '../lib/authHeaders'

const METHODS = [
  { id: 'zelle',   label: 'Zelle',    emoji: '💜', active: 'border-purple-500 bg-purple-500/10' },
  { id: 'cashapp', label: 'Cash App', emoji: '💚', active: 'border-green-500 bg-green-500/10' },
  { id: 'venmo',   label: 'Venmo',    emoji: '💙', active: 'border-blue-500 bg-blue-500/10' },
]

const STRIPE_METHOD = { id: 'stripe', label: 'Card / Apple Pay', emoji: '💳', active: 'border-blue-500 bg-blue-500/10' }
const ALL_METHODS = [STRIPE_METHOD, ...METHODS]

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

// Translate common DB-stored English shipping rate names to Spanish
const RATE_NAME_ES = {
  'standard shipping': 'Envío Estándar',
  'standard': 'Estándar',
  'express shipping': 'Envío Exprés',
  'express': 'Exprés',
  'priority shipping': 'Envío Prioritario',
  'priority': 'Prioritario',
  'economy shipping': 'Envío Económico',
  'economy': 'Económico',
  'overnight shipping': 'Envío Nocturno',
  'overnight': 'Nocturno',
  'free shipping': 'Envío Gratis',
  '2-day shipping': 'Envío en 2 Días',
  '2 day shipping': 'Envío en 2 Días',
  'flat rate shipping': 'Tarifa Fija',
  'flat rate': 'Tarifa Fija',
}
function translateRateName(name, isEs) {
  if (!isEs || !name) return name
  return RATE_NAME_ES[name.toLowerCase()] ?? name
}

function CodeField({ label, codeType, subtotal, token, t, onApply, applied, onRemove }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const apply = async () => {
    if (!input.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: input.trim(), subtotal }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid code'); return }
      // Make sure the code goes in the right field (promo vs affiliate partner)
      if (codeType && data.type !== codeType) {
        setError(codeType === 'promo'
          ? 'That looks like an affiliate code — use the Affiliate Partner Code field.'
          : 'That looks like a promo code — use the Promo Code field.')
        return
      }
      onApply(data)
      setInput('')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
        <div>
          <span className="text-green-400 font-bold text-sm">{applied.code}</span>
          <span className="text-green-400/70 text-xs ml-2">
            {Number(applied.discount_value) > 0 && (
              <>{applied.discount_type === 'percent' ? `${applied.discount_value}% off` : `$${applied.discount_value} off`}{' · '}{t.checkout.saving(Number(applied.discount_amount || 0).toFixed(2))}</>
            )}
            {applied.free_shipping && <>{Number(applied.discount_value) > 0 ? ' · ' : ''}🚚 Free shipping</>}
          </span>
        </div>
        <button onClick={onRemove} className="text-zinc-500 hover:text-white text-xs font-semibold transition-colors">{t.checkout.remove}</button>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">{label}</label>
      <div className="flex gap-2">
        <input type="text" placeholder={t.checkout.enterCode} value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && apply()}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors text-sm uppercase tracking-wider" />
        <button onClick={apply} disabled={loading || !input.trim()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
          {loading ? '...' : t.checkout.apply}
        </button>
      </div>
      {error && <div className="text-red-400 text-xs mt-1.5">{error}</div>}
    </div>
  )
}

// ─── Review step ──────────────────────────────────────────────────────────────
function ReviewStep({ items, shipping, method, selectedRate, appliedPromo, appliedAffiliate,
  subtotal, totalDiscount, shippingCost, shippingFree, taxRate, taxLabel, taxAmount, orderTotal, noTax,
  onConfirm, onBack, loading, error, t }) {

  const methodObj = ALL_METHODS.find(m => m.id === method)
  const isEs = t.lang === 'ES'
  // Tax is on products only — shipping is not taxed
  const taxableBase = subtotal - totalDiscount

  return (
    <div>
      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm mb-6">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t.checkout.editOrder}
      </button>

      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-3xl font-black text-white">{t.checkout.reviewTitle}</h1>
        <p className="text-zinc-500 text-sm mt-1">{t.checkout.reviewSubtitle}</p>
      </div>

      {/* Items */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4">
        <h2 className="text-white font-bold mb-4">{t.checkout.orderSummary}</h2>
        <div className="space-y-3 mb-4">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {item.image_url && (
                  <img src={item.image_url} alt={item.name}
                    className="w-12 h-12 rounded-lg object-contain bg-zinc-800 shrink-0 p-1" />
                )}
                <div className="min-w-0">
                  <div className="text-white text-sm font-semibold truncate">{item.name}</div>
                  {item.size && <div className="text-zinc-500 text-xs">{item.size}</div>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-white text-sm font-semibold">${(item.price * item.qty).toFixed(2)}</div>
                <div className="text-zinc-500 text-xs">×{item.qty} @ ${Number(item.price).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Price breakdown */}
        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <div className="flex justify-between text-sm text-zinc-400">
            <span>{t.checkout.subtotal}</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-400">{t.checkout.discount}</span>
              <span className="text-green-400">−${totalDiscount.toFixed(2)}</span>
            </div>
          )}
          {selectedRate && (
            <div className="flex justify-between text-sm text-zinc-400">
              <span>{t.checkout.shipping}</span>
              <span>{shippingFree ? <span className="text-green-400">{t.checkout.free}</span> : shippingCost > 0 ? `$${shippingCost.toFixed(2)}` : t.checkout.free}</span>
            </div>
          )}
          {taxRate > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">
                {t.orders.taxLabel} ({(taxRate * 100).toFixed(2)}%)
                {noTax && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 font-semibold">{t.checkout.taxExempt}</span>}
              </span>
              <span className={noTax ? 'text-green-400 font-semibold line-through' : 'text-zinc-400'}>
                ${(taxableBase * taxRate).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-zinc-800 pt-2">
            <span className="text-zinc-400 font-semibold">{t.checkout.total}</span>
            <span className="text-amber-400 font-black text-3xl">${orderTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Shipping address */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4">
        <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-3">{t.checkout.shippingTo}</h2>
        <div className="text-white text-sm leading-relaxed">
          {shipping.name && <div className="font-semibold">{shipping.name}</div>}
          <div>{shipping.address}{shipping.address2 ? `, ${shipping.address2}` : ''}</div>
          <div>{shipping.city}, {shipping.state} {shipping.zip}</div>
          <div className="text-zinc-500">{t.checkout.unitedStates}</div>
        </div>
      </div>

      {/* Payment + Shipping method side by side on wider screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Payment */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-3">{t.checkout.payingWith}</h2>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{methodObj?.emoji}</span>
            <span className="text-white font-bold text-lg">{methodObj?.label}</span>
          </div>
        </div>

        {/* Shipping method */}
        {selectedRate && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-3">{t.checkout.shippingVia}</h2>
            <div className="text-white font-bold">{translateRateName(selectedRate.name, isEs)}</div>
            {selectedRate.min_days && selectedRate.max_days && (
              <div className="text-zinc-500 text-xs mt-0.5">{t.checkout.daysRange(selectedRate.min_days, selectedRate.max_days)}</div>
            )}
            <div className="text-green-400 font-semibold text-sm mt-1">
              {shippingFree || selectedRate.price === 0 ? t.checkout.free : `$${Number(selectedRate.price).toFixed(2)}`}
            </div>
          </div>
        )}
      </div>

      {/* Applied codes */}
      {(appliedPromo || appliedAffiliate) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4">
          <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-3">{t.checkout.appliedCodes}</h2>
          <div className="space-y-2">
            {[appliedPromo, appliedAffiliate].filter(Boolean).map(c => (
              <div key={c.code} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                <span className="text-green-400 font-bold text-sm">{c.code}</span>
                <span className="text-zinc-500 text-xs">
                  {c.discount_type === 'percent' ? `${c.discount_value}% off` : `$${c.discount_value} off`}
                  {' — '}{t.checkout.saving(c.discount_amount.toFixed(2))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Research disclaimer — only when the cart contains a research peptide */}
      {items.some(i => (i.department || 'Peptides') === 'Peptides') && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4 mb-5">
          <p className="text-amber-400/80 text-xs font-semibold text-center">
            ⚠ {t.checkout.researchDisclaimer}
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
      )}

      {/* Confirm button */}
      <button onClick={onConfirm} disabled={loading}
        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-colors text-lg shadow-xl shadow-blue-900/30">
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t.checkout.placingOrder}
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {method === 'stripe' ? 'Continue to Secure Payment' : t.checkout.confirmOrder} — ${orderTotal.toFixed(2)}
          </span>
        )}
      </button>
    </div>
  )
}

// ─── Main checkout page ────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const [step, setStep] = useState('form') // 'form' | 'review'
  const [method, setMethod] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [shipping, setShipping] = useState({ name: '', address: '', address2: '', city: '', state: '', zip: '', country: 'US', phone: '', lat: null, lng: null })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [appliedPromo, setAppliedPromo] = useState(null)
  const [appliedAffiliate, setAppliedAffiliate] = useState(null)

  const [shippingRates, setShippingRates] = useState([])
  const [selectedRateId, setSelectedRateId] = useState(null)
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(0)
  const [freeShippingAll, setFreeShippingAll] = useState(false)
  const [taxRate, setTaxRate] = useState(0)
  const [taxLabel, setTaxLabel] = useState('Tax')
  const [googleMapsKey, setGoogleMapsKey] = useState('')
  const [localDelivery, setLocalDelivery] = useState({ enabled: false, radius_miles: 15, hub_lat: 29.7065, hub_lng: -95.3127, flat_rate: 50 })
  const [localDeliveryEligible, setLocalDeliveryEligible] = useState(false)
  const LOCAL_DELIVERY_ID = 'local-delivery'
  const [addressSuggestions, setAddressSuggestions] = useState([])
  const placesLibRef = useRef(null)
  const sessionTokenRef = useRef(null)
  const orderPlacedRef = useRef(false) // guards the empty-cart redirect after a successful order

  const location = useLocation()
  const requestedCart = new URLSearchParams(location.search).get('cart')
  const {
    activeCart,
    setActiveCart,
    cartItems,
    cartTotals,
    clearCart,
    reconcilePrices,
    CART_TYPES,
  } = useCart()
  const { token, user } = useAuth()
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const t = useT()
  const checkoutCart = requestedCart === CART_TYPES.PEPTIDES ? CART_TYPES.PEPTIDES : CART_TYPES.MAIN
  const items = cartItems(checkoutCart)
  const { total } = cartTotals(checkoutCart)
  const hasPeptides = checkoutCart === CART_TYPES.PEPTIDES
  const isGuest = !token
  const availableMethods = hasPeptides ? METHODS : [STRIPE_METHOD]

  useEffect(() => {
    if (activeCart !== checkoutCart) setActiveCart(checkoutCart)
  }, [activeCart, checkoutCart, setActiveCart])

  // Re-price the cart against the live product feed before any total is computed
  // or the order is submitted. The cart persists in localStorage, so without this
  // a customer could be charged a stale/pre-sale price they no longer see.
  useEffect(() => {
    fetch('/api/products', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => reconcilePrices(d.products || []))
      .catch(() => {})
  }, [reconcilePrices])

  useEffect(() => {
    if (!token && hasPeptides) {
      navigate('/auth', {
        replace: true,
        state: { peptideAccess: true, returnTo: `/checkout?cart=${CART_TYPES.PEPTIDES}` },
      })
    }
  }, [token, hasPeptides, navigate])

  useEffect(() => {
    if (!hasPeptides && method !== 'stripe') setMethod('stripe')
    if (hasPeptides && method === 'stripe') setMethod('')
  }, [hasPeptides, method])

  useEffect(() => {
    if (user?.email) setGuestEmail(user.email)
  }, [user?.email])

  useEffect(() => {
    fetch('/api/storefront/config', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        setShippingRates(d.shipping_rates || [])
        setFreeShippingThreshold(d.free_shipping_threshold || 0)
        setFreeShippingAll(!!d.free_shipping_all)
        setTaxRate(d.tax_rate || 0)
        setTaxLabel(d.tax_label || 'Tax')
        if (d.shipping_rates?.length > 0) setSelectedRateId(d.shipping_rates[0].id)
        if (d.google_maps_key) setGoogleMapsKey(d.google_maps_key)
        if (d.local_delivery) setLocalDelivery(d.local_delivery)
      })
      .catch(() => {})
  }, [])

  // Prefill the shipping form from the customer's most recent order so returning
  // buyers don't retype everything. Only fills empty fields — never clobbers input.
  useEffect(() => {
    if (!token) return
    fetch('/api/my-orders', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const last = (d.orders || [])[0]
        const s = last?.shipping
        if (!s?.address) return
        setShipping(prev => {
          if (prev.name || prev.address || prev.city) return prev // user already typing
          return { ...prev, name: s.name || '', address: s.address || '', address2: s.address2 || '', city: s.city || '', state: s.state || '', zip: s.zip || '', phone: s.phone || '' }
        })
      })
      .catch(() => {})
  }, [token])

  // Redirect to the shop if the cart is empty — but not right after placing an
  // order (clearCart empties the cart while we navigate to the confirmation page).
  useEffect(() => {
    if (items.length === 0 && !orderPlacedRef.current) navigate('/shop')
  }, [items.length, navigate])

  if (items.length === 0) return null

  const clearLocalDeliveryEligibility = () => {
    setLocalDeliveryEligible(false)
    if (selectedRateId === LOCAL_DELIVERY_ID) setSelectedRateId(null)
  }

  const updateShip = (f) => (e) => {
    const value = e.target.value
    setShipping(p => {
      const next = { ...p, [f]: value }
      if (['address', 'city', 'state', 'zip'].includes(f)) {
        next.lat = null
        next.lng = null
      }
      return next
    })
    if (['address', 'city', 'state', 'zip'].includes(f)) clearLocalDeliveryEligibility()
  }

  // Haversine distance in miles between two lat/lng points
  const haversineMiles = (lat1, lng1, lat2, lng2) => {
    const R = 3958.8
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  const checkLocalDeliveryEligibility = (lat, lng) => {
    if (!localDelivery.enabled) { setLocalDeliveryEligible(false); return }
    const dist = haversineMiles(localDelivery.hub_lat, localDelivery.hub_lng, lat, lng)
    const eligible = dist <= localDelivery.radius_miles
    setLocalDeliveryEligible(eligible)
    if (selectedRateId === LOCAL_DELIVERY_ID && !eligible) setSelectedRateId(null)
  }
  const inp = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm'

  // ── Google Places Autocomplete ──
  const addressInputRef = useRef(null)

  useEffect(() => {
    if (!googleMapsKey) return

    const initLib = () => {
      const places = window.google?.maps?.places
      if (!places) return
      placesLibRef.current = places
      sessionTokenRef.current = new places.AutocompleteSessionToken()
    }

    const scriptId = 'gm-places-script'
    if (window.google?.maps?.places) {
      initLib()
      return
    }
    if (document.getElementById(scriptId)) return

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = initLib
    document.head.appendChild(script)
  }, [googleMapsKey])

  const handleAddressInput = async (e) => {
    updateShip('address')(e)
    const value = e.target.value
    const places = placesLibRef.current || window.google?.maps?.places
    if (!places || value.length < 3) { setAddressSuggestions([]); return }
    try {
      if (!sessionTokenRef.current)
        sessionTokenRef.current = new places.AutocompleteSessionToken()
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: value,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ['us'],
      })
      setAddressSuggestions((suggestions || []).slice(0, 5))
    } catch { setAddressSuggestions([]) }
  }

  const selectAddressSuggestion = async (suggestion) => {
    const places = placesLibRef.current || window.google?.maps?.places
    try {
      const place = suggestion.placePrediction.toPlace()
      await place.fetchFields({ fields: ['addressComponents', 'location'] })
      let streetNumber = '', route = '', city = '', state = '', zip = ''
      for (const comp of (place.addressComponents || [])) {
        const type = comp.types[0]
        if (type === 'street_number') streetNumber = comp.longText
        else if (type === 'route') route = comp.shortText
        else if (type === 'locality') city = comp.longText
        else if (type === 'administrative_area_level_1') state = comp.shortText
        else if (type === 'postal_code') zip = comp.longText
      }
      const lat = typeof place.location?.lat === 'function' ? place.location.lat() : null
      const lng = typeof place.location?.lng === 'function' ? place.location.lng() : null
      setShipping(prev => ({
        ...prev,
        address: [streetNumber, route].filter(Boolean).join(' '),
        city, state, zip,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      }))
      setAddressSuggestions([])
      if (places) sessionTokenRef.current = new places.AutocompleteSessionToken()
      // Check local delivery eligibility
      if (Number.isFinite(lat) && Number.isFinite(lng)) checkLocalDeliveryEligibility(lat, lng)
      else clearLocalDeliveryEligibility()
    } catch { setAddressSuggestions([]) }
  }

  // ── Pricing calculations (shared between steps) ──
  // Discounts apply only to eligible (non-case) items; cases are fixed wholesale.
  // Promo applies to the discountable subtotal first, affiliate stacks on the rest.
  const subtotal = total
  const discountableSubtotal = Number(items.reduce((s, i) => s + (i.no_discount ? 0 : i.price * i.qty), 0).toFixed(2))
  const calcDiscount = (code, base) => !code ? 0
    : code.discount_type === 'percent'
        ? Number((base * code.discount_value / 100).toFixed(2))
        : Number(Math.min(base, code.discount_value).toFixed(2))
  const promoDiscount = calcDiscount(appliedPromo, discountableSubtotal)
  const affiliateDiscount = calcDiscount(appliedAffiliate, Math.max(0, discountableSubtotal - promoDiscount))
  const totalDiscount = Number((promoDiscount + affiliateDiscount).toFixed(2))
  const discountedSubtotal = subtotal - totalDiscount

  const isLocalDeliverySelected = selectedRateId === LOCAL_DELIVERY_ID
  const selectedRate = isLocalDeliverySelected
    ? { id: LOCAL_DELIVERY_ID, name: 'Same-Day Local Delivery 🚗', price: localDelivery.flat_rate }
    : shippingRates.find(r => r.id === selectedRateId)
  // A free-shipping promo/partner code waives carrier shipping (not local delivery),
  // mirroring the server. Same "once per customer" rule applies via the code itself.
  const codeFreeShipping = !!(appliedPromo?.free_shipping || appliedAffiliate?.free_shipping)
  const shippingFree = !isLocalDeliverySelected && (freeShippingAll || codeFreeShipping || (freeShippingThreshold > 0 && discountedSubtotal >= freeShippingThreshold))
  const shippingCost = isLocalDeliverySelected ? localDelivery.flat_rate : shippingRates.length === 0 ? 0 : (shippingFree ? 0 : (selectedRate?.price || 0))

  // Tax is on products only — shipping is NOT taxed
  const taxable = discountedSubtotal
  const noTax = !!(appliedPromo?.no_tax || appliedAffiliate?.no_tax)
  const taxAmount = noTax ? 0 : Number((taxable * taxRate).toFixed(2))
  const orderTotal = Number((discountedSubtotal + shippingCost + taxAmount).toFixed(2))

  // ── Step: validate form and advance to review ──
  const handleReview = () => {
    setError('')
    if (!method) { setError(t.checkout.selectPayment); return }
    if (isGuest && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      setError(t.checkout.emailRequired || 'Please enter a valid email address')
      return
    }
    if (!shipping.name?.trim()) { setError(t.checkout.nameRequired); return }
    if (!shipping.address?.trim() || !shipping.city?.trim() || !shipping.state || !shipping.zip?.trim()) {
      setError(t.checkout.shippingRequired); return
    }
    if (isLocalDeliverySelected && !localDeliveryEligible) {
      setError('Same-day local delivery is not available for this address.')
      return
    }
    if (!shipping.phone?.trim()) { setError('Phone number is required'); return }
    if (shippingRates.length > 0 && !selectedRateId) { setError(t.checkout.selectShippingMethod); return }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setStep('review')
  }

  // ── Step: actually submit order ──
  const handleOrder = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: token
          ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
          : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ product_id: i.id, name: i.name, size: i.size, price: i.price, qty: i.qty })),
          payment_method: method,
          shipping,
          customer_email: isGuest ? guestEmail.trim().toLowerCase() : undefined,
          language: lang,
          promo_code: appliedPromo?.code || null,
          partner_code: appliedAffiliate?.code || null,
          shipping_rate_id: isLocalDeliverySelected ? null : (selectedRateId || null),
          local_delivery: isLocalDeliverySelected || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || t.checkout.networkError); return }
      if (data.stripe_checkout_url) {
        window.location.assign(data.stripe_checkout_url)
        return
      }
      orderPlacedRef.current = true // suppress the empty-cart redirect below
      clearCart(checkoutCart)
      navigate('/order-confirmation', { state: { order: data } })
    } catch { setError(t.checkout.networkError) }
    finally { setLoading(false) }
  }

  const pricingProps = { subtotal, totalDiscount, shippingCost, shippingFree, taxRate, taxLabel, taxAmount, orderTotal, noTax }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <CartSidebar />
      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ── STEP INDICATOR ── */}
        <div className="flex items-center gap-3 mb-8">
          <div className={`flex items-center gap-2 text-sm font-bold ${step === 'form' ? 'text-white' : 'text-zinc-500'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${step === 'form' ? 'bg-blue-600 text-white' : 'bg-green-500/20 text-green-400 border border-green-500/40'}`}>
              {step === 'review' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : '1'}
            </span>
            {t.checkout.title}
          </div>
          <div className={`flex-1 h-px ${step === 'review' ? 'bg-blue-600' : 'bg-zinc-800'}`} />
          <div className={`flex items-center gap-2 text-sm font-bold ${step === 'review' ? 'text-white' : 'text-zinc-600'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${step === 'review' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-600'}`}>2</span>
            {t.checkout.reviewTitle}
          </div>
        </div>

        {/* ── REVIEW STEP ── */}
        {step === 'review' && (
          <ReviewStep
            items={items}
            shipping={shipping}
            method={method}
            selectedRate={selectedRate}
            appliedPromo={appliedPromo ? { ...appliedPromo, discount_amount: promoDiscount } : null}
            appliedAffiliate={appliedAffiliate ? { ...appliedAffiliate, discount_amount: affiliateDiscount } : null}
            {...pricingProps}
            onConfirm={handleOrder}
            onBack={() => { setStep('form'); setError('') }}
            loading={loading}
            error={error}
            t={t}
          />
        )}

        {/* ── FORM STEP ── */}
        {step === 'form' && (
          <>
            <button onClick={() => navigate('/shop')} className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm mb-6">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t.checkout.continueShopping}
            </button>

            <h1 className="text-3xl font-black text-white mb-6">{t.checkout.title}</h1>

            {/* Order Summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
              <h2 className="text-white font-bold mb-4">{t.checkout.orderSummary}</h2>
              <div className="space-y-2.5 mb-4">
                {items.map(item => (
                  <div key={item.id} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{item.name}</span>
                      {item.size && <span className="text-zinc-500 text-xs">{item.size}</span>}
                      <span className="text-zinc-600 text-xs bg-zinc-800 rounded px-1.5 py-0.5">×{item.qty}</span>
                    </div>
                    <span className="text-white text-sm font-semibold">${(item.price * item.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>{t.checkout.subtotal}</span><span>${subtotal.toFixed(2)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400">{t.checkout.discount}</span>
                    <span className="text-green-400">−${totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                {shippingRates.length > 0 && (
                  <div className="flex justify-between text-sm text-zinc-400">
                    <span>{t.checkout.shipping}</span>
                    <span>{shippingFree ? <span className="text-green-400">{t.checkout.free}</span> : shippingCost > 0 ? `$${shippingCost.toFixed(2)}` : '—'}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">
                      {t.orders.taxLabel} ({(taxRate * 100).toFixed(2)}%)
                      {noTax && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 font-semibold">{t.checkout.taxExempt}</span>}
                    </span>
                    <span className={noTax ? 'text-green-400 line-through' : 'text-zinc-400'}>
                      ${(taxable * taxRate).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-zinc-800 pt-2">
                  <span className="text-zinc-400 font-semibold">{t.checkout.total}</span>
                  <span className="text-amber-400 font-black text-3xl">${orderTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Discount Codes */}
            {!isGuest && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5 space-y-4">
                <CodeField label={t.checkout.promoCode} codeType="promo" subtotal={discountableSubtotal} token={token} t={t}
                  applied={appliedPromo} onApply={setAppliedPromo} onRemove={() => setAppliedPromo(null)} />
                <CodeField label={t.checkout.partnerCode} codeType="partner" subtotal={discountableSubtotal} token={token} t={t}
                  applied={appliedAffiliate} onApply={setAppliedAffiliate} onRemove={() => setAppliedAffiliate(null)} />
                {items.some(i => i.no_discount) && (
                  <p className="text-zinc-500 text-xs">Case / wholesale items are already discounted and aren't eligible for promo codes.</p>
                )}
              </div>
            )}

            {/* Local Delivery Option */}
            {localDelivery.enabled && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
                <h2 className="text-white font-bold mb-1">{t.checkout.shippingMethod}</h2>
                <p className="text-zinc-500 text-xs mb-3">Type your address above first — local delivery availability is based on your location.</p>
                <button
                  onClick={() => localDeliveryEligible && setSelectedRateId(LOCAL_DELIVERY_ID)}
                  disabled={!localDeliveryEligible}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all mb-2 ${
                    selectedRateId === LOCAL_DELIVERY_ID
                      ? 'border-green-500 bg-green-500/10'
                      : localDeliveryEligible
                        ? 'border-zinc-700 hover:border-green-500/50 bg-zinc-800/50 cursor-pointer'
                        : 'border-zinc-800 bg-zinc-900 opacity-50 cursor-not-allowed'
                  }`}>
                  <div className="flex items-center gap-3 text-left">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedRateId === LOCAL_DELIVERY_ID ? 'border-green-500' : 'border-zinc-600'}`}>
                      {selectedRateId === LOCAL_DELIVERY_ID && <div className="w-2 h-2 rounded-full bg-green-500" />}
                    </div>
                    <div>
                      <div className="text-white font-semibold text-sm flex items-center gap-2">
                        🚗 Same-Day Local Delivery
                        {localDeliveryEligible
                          ? <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full font-bold">Available</span>
                          : <span className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full">Enter address to check</span>}
                      </div>
                      <div className="text-zinc-500 text-xs mt-0.5">Houston area · Delivered today · Dispatched via Uber Courier</div>
                    </div>
                  </div>
                  <span className="font-black text-white text-sm">${localDelivery.flat_rate}.00</span>
                </button>
              </div>
            )}

            {/* Shipping Method */}
            {shippingRates.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
                <h2 className="text-white font-bold mb-3">{t.checkout.shippingMethod}</h2>
                <div className="space-y-2">
                  {shippingRates.map(rate => {
                    const isFree = shippingFree || rate.price === 0
                    const displayPrice = (shippingFree && selectedRateId === rate.id) ? t.checkout.free : rate.price === 0 ? t.checkout.free : `$${Number(rate.price).toFixed(2)}`
                    const days = rate.min_days && rate.max_days ? t.checkout.daysRange(rate.min_days, rate.max_days) : rate.min_days ? t.checkout.daysMin(rate.min_days) : null
                    return (
                      <button key={rate.id} onClick={() => setSelectedRateId(rate.id)}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${selectedRateId === rate.id ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/50'}`}>
                        <div className="flex items-center gap-3 text-left">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedRateId === rate.id ? 'border-blue-500' : 'border-zinc-600'}`}>
                            {selectedRateId === rate.id && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                          </div>
                          <div>
                            <div className={`text-sm font-semibold ${selectedRateId === rate.id ? 'text-white' : 'text-zinc-300'}`}>{translateRateName(rate.name, lang === 'es')}</div>
                            {days && <div className="text-zinc-500 text-xs">{days}</div>}
                          </div>
                        </div>
                        <span className={`font-bold text-sm ${isFree && selectedRateId === rate.id ? 'text-green-400' : rate.price === 0 ? 'text-green-400' : 'text-white'}`}>{displayPrice}</span>
                      </button>
                    )
                  })}
                  {freeShippingThreshold > 0 && !shippingFree && (
                    <div className="text-xs text-zinc-500 text-center mt-1">
                      {t.checkout.addMoreForFree((freeShippingThreshold - discountedSubtotal).toFixed(2))}
                    </div>
                  )}
                </div>

                {/* Shipping disclaimer */}
                <div className="flex gap-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3.5 py-3 mt-1">
                  <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                  <p className="text-zinc-400 text-xs leading-relaxed">
                    All orders ship with <span className="text-white font-semibold">live tracking</span> so you can follow your package every step of the way. Estimated delivery times are provided by the carrier and may vary due to weather, holidays, or high-volume periods. Rest assured — we process and ship orders promptly, and you'll receive your tracking information as soon as your order is on its way. 📦
                  </p>
                </div>
              </div>
            )}

            {isGuest && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
                <h2 className="text-white font-bold mb-1">{t.checkout.contactInfo || 'Contact Information'}</h2>
                <p className="text-zinc-500 text-xs mb-4">{t.checkout.guestCheckoutNote || 'No account needed for non-peptide orders. We’ll send your order confirmation here.'}</p>
                <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.checkout.email || 'Email Address'}</label>
                <input type="email" placeholder="you@example.com" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required className={inp} />
              </div>
            )}

            {/* Shipping Address */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
              <h2 className="text-white font-bold mb-4">{t.checkout.shippingAddress}</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.checkout.fullName}</label>
                  <input type="text" placeholder="John Doe" value={shipping.name} onChange={updateShip('name')} required className={inp} />
                </div>
                <div className="relative">
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.checkout.streetAddress}</label>
                  <input ref={addressInputRef} type="text" placeholder="123 Main St" value={shipping.address}
                    onChange={handleAddressInput}
                    onBlur={() => setTimeout(() => setAddressSuggestions([]), 150)}
                    required autoComplete="off" className={inp} />
                  {addressSuggestions.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
                      {addressSuggestions.map((s, i) => (
                        <li key={i}>
                          <button type="button"
                            onMouseDown={() => selectAddressSuggestion(s)}
                            className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-zinc-700 transition-colors">
                            <span className="font-medium">{s.placePrediction.mainText?.toString()}</span>
                            <span className="text-zinc-400 text-xs ml-2">{s.placePrediction.secondaryText?.toString()}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
                    {t.checkout.aptSuite} <span className="text-zinc-600 normal-case font-normal">{t.checkout.aptOptional}</span>
                  </label>
                  <input type="text" placeholder="Apt 4B" value={shipping.address2} onChange={updateShip('address2')} className={inp} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.checkout.city}</label>
                    <input type="text" placeholder="Houston" value={shipping.city} onChange={updateShip('city')} required className={inp} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.checkout.state}</label>
                    <select value={shipping.state} onChange={updateShip('state')} required className={inp + ' cursor-pointer'}>
                      <option value="">Select</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.checkout.zip}</label>
                    <input type="text" placeholder="77001" value={shipping.zip} onChange={updateShip('zip')} required className={inp} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.checkout.country}</label>
                    <input type="text" value={t.checkout.unitedStates} disabled className={inp + ' opacity-50 cursor-not-allowed'} />
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.checkout.phone}</label>
                  <input type="tel" placeholder="(346) 555-0100" value={shipping.phone} onChange={updateShip('phone')} required className={inp} />
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
              <h2 className="text-white font-bold mb-4">{t.checkout.paymentMethod}</h2>
              {!hasPeptides && (
                <p className="text-zinc-500 text-xs mb-3">
                  Secure card checkout is used for non-peptide orders. Peptide products must be checked out separately.
                </p>
              )}
              {hasPeptides && (
                <p className="text-amber-400/80 text-xs mb-3">
                  Peptide checkout uses verified manual payment only. Card checkout is disabled for this department.
                </p>
              )}
              <div className={`grid gap-3 ${availableMethods.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {availableMethods.map(m => (
                  <button key={m.id} onClick={() => setMethod(m.id)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-150 ${method === m.id ? m.active : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/50'}`}>
                    <span className="text-3xl">{m.emoji}</span>
                    <span className={`text-sm font-bold ${method === m.id ? 'text-white' : 'text-zinc-300'}`}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
            )}

            {/* Review → */}
            <button onClick={handleReview}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-colors text-lg shadow-xl shadow-blue-900/30">
              <span className="flex items-center justify-center gap-2">
                {t.checkout.reviewTitle} →
              </span>
            </button>
          </>
        )}
      </main>
      <Footer />
    </div>
  )
}
