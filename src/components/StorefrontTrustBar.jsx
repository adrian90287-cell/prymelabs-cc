export default function StorefrontTrustBar({ compact = false }) {
  const items = [
    ['🔒', 'Secure checkout', 'Protected payment and account flow.'],
    ['👤', 'Account optional', 'Browse most departments without signing in.'],
    ['🧬', 'Peptides verified', 'Peptide access stays login + phone verified.'],
    ['✨', 'New releases', 'More products are being added as departments launch.'],
  ]

  return (
    <div className={`grid sm:grid-cols-2 lg:grid-cols-4 gap-2 ${compact ? 'mb-6' : 'mb-8'}`}>
      {items.map(([icon, title, desc]) => (
        <div key={title} className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-3 flex items-start gap-3">
          <span className="text-lg shrink-0">{icon}</span>
          <div>
            <div className="text-white text-xs font-black uppercase tracking-wider">{title}</div>
            <div className="text-zinc-500 text-xs mt-0.5 leading-snug">{desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
