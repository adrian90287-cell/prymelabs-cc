import { useT } from '../context/LanguageContext'

// One-time-per-session research-use disclaimer gate for the Peptides
// department. Ack is stored in sessionStorage and cleared on every
// login/logout (see AuthContext), so it reappears once per sign-in.
export const PEPTIDE_ACK_KEY = 'pl_peptide_ack'

export function hasAckedPeptideGate() {
  return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PEPTIDE_ACK_KEY) === '1'
}

export default function PeptideGate({ onAgree, onDecline }) {
  const t = useT()
  const g = t.peptideGate

  const agree = () => {
    sessionStorage.setItem(PEPTIDE_ACK_KEY, '1')
    onAgree()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/95 backdrop-blur-sm px-4 py-8" data-build="cache-bust-1">
      <div className="w-full max-w-lg mx-auto my-auto min-h-full flex flex-col justify-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-h-full overflow-y-auto">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5 shrink-0">
            <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2 text-center">{g.title}</h2>
          <p className="text-zinc-400 mb-5 text-sm text-center leading-relaxed">{g.intro}</p>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 text-left">
            <ul className="space-y-2.5">
              {g.points.map((pt, i) => (
                <li key={i} className="flex gap-2.5 text-amber-200/80 text-sm leading-relaxed">
                  <span className="text-amber-400 shrink-0">•</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <button onClick={agree}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-2xl transition-all duration-150 text-base tracking-wide shadow-lg shadow-blue-900/40">
              {g.agree}
            </button>
            <button onClick={onDecline}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-medium rounded-2xl transition-colors">
              {g.decline}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
