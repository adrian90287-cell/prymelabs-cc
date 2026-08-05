import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'

export default function Footer() {
  const navigate = useNavigate()
  const t = useT()

  return (
    <footer className="bg-zinc-950 border-t border-zinc-800/60 mt-12" data-build="cache-bust-1">
      <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-white font-black text-sm tracking-widest">
            <img src="/logo-mark.png" alt="" className="h-4 w-auto" />
            PRYME<span className="text-blue-500">LABS</span>
          </div>
          <p className="text-zinc-600 text-xs mt-0.5">© {new Date().getFullYear()} Pryme Labs. {t.footer.rights}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-zinc-500">
          <button onClick={() => navigate('/compliance')}
            className="hover:text-zinc-300 transition-colors font-medium">
            {t.footer.legal}
          </button>
          <a href="mailto:support@prymelabs.net" className="hover:text-zinc-300 transition-colors">
            support@prymelabs.net
          </a>
          <a href="tel:+13465509100" className="hover:text-zinc-300 transition-colors">
            (346) 550-9100
          </a>
        </div>
      </div>
    </footer>
  )
}
