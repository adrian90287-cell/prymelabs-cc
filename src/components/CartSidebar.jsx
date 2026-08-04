import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LanguageContext'

export default function CartSidebar() {
  const { items, isOpen, setIsOpen, removeItem, updateQty, total, itemCount } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [limitId, setLimitId] = useState(null)

  const handleIncrement = (item) => {
    const max = Number(item.stock_qty) || 0
    if (max > 0 && item.qty >= max) {
      setLimitId(item.id)
      setTimeout(() => setLimitId(prev => prev === item.id ? null : prev), 2500)
      return
    }
    updateQty(item.id, item.qty + 1)
  }

  const handleCheckout = () => {
    setIsOpen(false)
    navigate(user ? '/checkout' : '/auth')
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      )}

      <div className={`fixed right-0 top-0 h-full w-full max-w-md z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-white font-bold text-xl">
            {t.cart.title}
            {itemCount > 0 && (
              <span className="ml-2 text-sm text-zinc-400 font-normal">{t.cart.items(itemCount)}</span>
            )}
          </h2>
          <button onClick={() => setIsOpen(false)}
            className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-20 h-20 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-zinc-300 text-lg font-semibold">{t.cart.empty}</p>
              <p className="text-zinc-600 text-sm mt-1">{t.cart.emptyHint}</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className="flex gap-3 bg-zinc-800/40 rounded-xl p-3 border border-zinc-700/30">
                <img
                  src={item.image_url || `https://placehold.co/80x80/18181b/3b82f6?text=${encodeURIComponent(item.name)}`}
                  alt={item.name}
                  className="w-16 h-16 object-cover rounded-lg flex-shrink-0 bg-zinc-800"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm leading-tight mb-0.5 truncate">{item.name}</p>
                  <p className="text-amber-400 font-bold text-sm">${Number(item.price).toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => updateQty(item.id, item.qty - 1)}
                      className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center transition-colors text-lg leading-none">−</button>
                    <span className="text-white text-sm w-5 text-center font-medium">{item.qty}</span>
                    <button onClick={() => handleIncrement(item)}
                      className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center transition-colors text-lg leading-none">+</button>
                    <button onClick={() => removeItem(item.id)}
                      className="ml-auto text-zinc-600 hover:text-red-400 transition-colors p-1" aria-label="Remove item">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {limitId === item.id && (
                    <p className="text-amber-400 text-xs mt-1.5 font-medium">{t.product.onlyAvailable(item.stock_qty)}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-zinc-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium">{t.cart.subtotal}</span>
              <span className="text-white font-black text-2xl">${total.toFixed(2)}</span>
            </div>
            <button onClick={handleCheckout}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors text-lg shadow-lg shadow-blue-900/30">
              {t.cart.checkout}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
