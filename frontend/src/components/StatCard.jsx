const ACCENT = {
  gray:   { color: 'var(--text)',   bg: 'transparent' },
  teal:   { color: 'var(--teal)',   bg: 'var(--teal-dim)' },
  green:  { color: 'var(--teal)',   bg: 'var(--teal-dim)' },
  amber:  { color: 'var(--amber)',  bg: 'var(--amber-dim)' },
  yellow: { color: 'var(--amber)',  bg: 'var(--amber-dim)' },
  red:    { color: 'var(--coral)',  bg: 'var(--coral-dim)' },
  blue:   { color: 'var(--blue)',   bg: 'var(--blue-dim)' },
  purple: { color: 'var(--purple)', bg: 'var(--purple-dim)' },
}

export default function StatCard({ label, value, sub, color = 'gray', icon: Icon, accent }) {
  const a = ACCENT[accent || color] || ACCENT.gray
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top line accent */}
      <div style={{
        position: 'absolute', top: 0, left: 20, right: 20, height: 1,
        background: a.color, opacity: 0.35,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          margin: 0,
        }}>{label}</p>
        {Icon && (
          <span style={{
            background: a.bg,
            color: a.color,
            padding: '5px 6px',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
          }}>
            <Icon size={14} strokeWidth={1.75} />
          </span>
        )}
      </div>

      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 26,
        fontWeight: 500,
        color: a.color === 'var(--text)' ? 'var(--text-hi)' : a.color,
        margin: 0,
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>{value}</p>

      {sub && <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        color: 'var(--text-dim)',
        margin: 0,
      }}>{sub}</p>}
    </div>
  )
}
