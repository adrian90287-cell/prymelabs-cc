import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext'
import { departmentSlug } from '../lib/collections'

const DEPT_LINKS = ['Health & Wellness', 'Beauty & Grooming', 'Apparel & Gear', 'Peptides']

export default function Footer() {
  const navigate = useNavigate()
  const t = useT()
  const labels = t.footer.columns

  const goDepartment = (department) => navigate(`/collections/${departmentSlug(department)}`)
  const goCompliance = () => navigate('/legal-compliance')

  return (
    <footer className="border-t border-zinc-800/70 bg-[#07080b]" data-build="premium-storefront-1">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.15fr_0.8fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <button onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-white font-black text-base tracking-widest hover:opacity-80 transition-opacity">
              <img src="/logo-mark.png" alt="" className="h-5 w-auto" />
              PRYME<span className="text-blue-500">LABS</span>
            </button>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-500">{labels.business}</p>
            <div className="mt-4 space-y-1.5 text-sm text-zinc-500">
              <a href="mailto:support@prymelabs.net" className="block hover:text-zinc-300 transition-colors">support@prymelabs.net</a>
              <a href="tel:+13465509100" className="block hover:text-zinc-300 transition-colors">(346) 550-9100</a>
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">{labels.shop}</h3>
            <div className="mt-3 grid gap-2 text-sm">
              {DEPT_LINKS.map(dep => (
                <button key={dep} onClick={() => goDepartment(dep)} className="text-left text-zinc-400 transition-colors hover:text-white">
                  {t.shop.departmentNames?.[dep] || dep}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">{labels.brands}</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <button onClick={() => goDepartment('Peptides')} className="text-left text-zinc-400 transition-colors hover:text-white">Pryme Labs</button>
              <button onClick={() => goDepartment('Health & Wellness')} className="text-left text-zinc-400 transition-colors hover:text-white">VYTRA</button>
              <button onClick={() => goDepartment('Beauty & Grooming')} className="text-left text-zinc-400 transition-colors hover:text-white">VELOURIX</button>
              <button onClick={() => goDepartment('Beauty & Grooming')} className="text-left text-zinc-400 transition-colors hover:text-white">MATRIX</button>
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">{labels.help}</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <a href="mailto:support@prymelabs.net" className="text-zinc-400 transition-colors hover:text-white">{labels.contact}</a>
              <button onClick={goCompliance} className="text-left text-zinc-400 transition-colors hover:text-white">{labels.shipping}</button>
              <button onClick={goCompliance} className="text-left text-zinc-400 transition-colors hover:text-white">{labels.returns}</button>
              <button onClick={() => navigate('/track')} className="text-left text-zinc-400 transition-colors hover:text-white">{labels.orderTracking}</button>
              <button onClick={goCompliance} className="text-left text-zinc-400 transition-colors hover:text-white">{labels.faq}</button>
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">{labels.legal}</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <button onClick={() => navigate('/terms')} className="text-left text-zinc-400 transition-colors hover:text-white">{labels.terms}</button>
              <button onClick={() => navigate('/privacy')} className="text-left text-zinc-400 transition-colors hover:text-white">{labels.privacy}</button>
              <button onClick={goCompliance} className="text-left text-zinc-400 transition-colors hover:text-white">{labels.legalCompliance}</button>
            </div>
          </div>
        </div>

        <div className="mt-9 flex flex-col gap-2 border-t border-zinc-800/70 pt-5 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Pryme Labs. {t.footer.rights}</p>
          <button onClick={goCompliance} className="text-left font-medium transition-colors hover:text-zinc-300">
            {t.footer.researchOnly}
          </button>
        </div>
      </div>
    </footer>
  )
}
