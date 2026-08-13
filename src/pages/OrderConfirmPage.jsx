import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { useT } from '../context/LanguageContext'
import { useCart } from '../context/CartContext'

const METHOD_LABEL = { zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo' }

export default function OrderConfirmPage() {
  const { state } = useLocation()
  const location = useLocation()
  const navigate = useNavigate()
  const t = useT()
  const { clearCart, CART_TYPES } = useCart()
  const params = new URLSearchParams(location.search)
  const stripeSuccess = params.get('stripe') === 'success'
  const stripeOrder = params.get('order') || ''

  useEffect(() => {
    if (stripeSuccess && stripeOrder) {
      clearCart(CART_TYPES.MAIN)
      return
    }
    if (!state?.order) navigate('/shop')
  }, [state, navigate, stripeSuccess, stripeOrder, clearCart, CART_TYPES])

  if (stripeSuccess && stripeOrder) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-white mb-2">Payment Received</h1>
            <p className="text-zinc-500">Thank you — Stripe has received your card payment.</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-zinc-500 text-sm">{t.confirm.orderNumber}</span>
              <span className="text-blue-400 font-mono font-bold tracking-widest text-sm">{stripeOrder}</span>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-400 text-sm leading-relaxed">
              Your order will show as paid once Stripe’s secure confirmation reaches our system. This usually happens within seconds.
            </div>
          </div>

          <button onClick={() => navigate('/shop')}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-900/30">
            {t.confirm.continueShopping}
          </button>
        </main>
        <Footer />
      </div>
    )
  }

  if (!state?.order) return null

  const { order_number, payment_handle, order_total: total, payment_method } = state.order

  return (
    <div className="min-h-screen bg-zinc-950" data-build="cache-bust-1">
      <Navbar />
      <main className="max-w-lg mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">{t.confirm.title}</h1>
          <p className="text-zinc-500">{t.confirm.subtitle}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-zinc-500 text-sm">{t.confirm.orderNumber}</span>
            <span className="text-blue-400 font-mono font-bold tracking-widest text-sm">{order_number}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 text-sm">{t.confirm.amountDue}</span>
            <span className="text-amber-400 font-black text-2xl">${Number(total).toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-zinc-900 border-2 border-blue-800/40 rounded-2xl p-5 mb-6">
          <h2 className="text-white font-bold mb-5 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-black">i</span>
            {t.confirm.paymentInstructions}
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/40 text-blue-400 text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <p className="text-zinc-300 text-sm pt-1">
                {t.confirm.step1(METHOD_LABEL[payment_method] || payment_method)}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/40 text-blue-400 text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-zinc-300 text-sm mb-2">{t.confirm.step2(Number(total).toFixed(2))}</p>
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-mono text-blue-300 font-bold text-sm select-all">
                  {payment_handle}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/40 text-blue-400 text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-zinc-300 text-sm mb-2">{t.confirm.step3}</p>
                <div className="bg-zinc-800 border border-emerald-800/40 rounded-xl px-4 py-3 font-mono text-emerald-400 font-black tracking-widest text-sm select-all">
                  {order_number}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-zinc-800">
            <p className="text-zinc-600 text-xs leading-relaxed">{t.confirm.footer}</p>
          </div>
        </div>

        <button onClick={() => navigate('/shop')}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-900/30">
          {t.confirm.continueShopping}
        </button>
      </main>
      <Footer />
    </div>
  )
}
