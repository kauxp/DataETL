const STYLES = {
  pending:    { color: 'var(--amber)',  bg: 'var(--amber-dim)',  border: 'rgba(240,160,64,0.3)' },
  flagged:    { color: 'var(--coral)',  bg: 'var(--coral-dim)',  border: 'rgba(240,85,85,0.3)' },
  approved:   { color: 'var(--teal)',   bg: 'var(--teal-dim)',   border: 'rgba(0,212,163,0.3)' },
  rejected:   { color: 'var(--text-dim)', bg: 'var(--bg-raised)', border: 'var(--border)' },
  completed:  { color: 'var(--teal)',   bg: 'var(--teal-dim)',   border: 'rgba(0,212,163,0.3)' },
  failed:     { color: 'var(--coral)',  bg: 'var(--coral-dim)',  border: 'rgba(240,85,85,0.3)' },
  processing: { color: 'var(--blue)',   bg: 'var(--blue-dim)',   border: 'rgba(77,158,255,0.3)' },
  SAP:        { color: 'var(--blue)',   bg: 'var(--blue-dim)',   border: 'rgba(77,158,255,0.3)' },
  UTILITY:    { color: 'var(--purple)', bg: 'var(--purple-dim)', border: 'rgba(168,128,255,0.3)' },
  TRAVEL:     { color: 'var(--amber)',  bg: 'var(--amber-dim)',  border: 'rgba(240,160,64,0.3)' },
  'scope-1':  { color: 'var(--amber)',  bg: 'var(--amber-dim)',  border: 'rgba(240,160,64,0.3)' },
  'scope-2':  { color: 'var(--purple)', bg: 'var(--purple-dim)', border: 'rgba(168,128,255,0.3)' },
  'scope-3':  { color: 'var(--blue)',   bg: 'var(--blue-dim)',   border: 'rgba(77,158,255,0.3)' },
  high:       { color: 'var(--coral)',  bg: 'var(--coral-dim)',  border: 'rgba(240,85,85,0.3)' },
  medium:     { color: 'var(--amber)',  bg: 'var(--amber-dim)',  border: 'rgba(240,160,64,0.3)' },
  low:        { color: 'var(--text-dim)', bg: 'var(--bg-raised)', border: 'var(--border)' },
  spike:      { color: 'var(--coral)',  bg: 'var(--coral-dim)',  border: 'rgba(240,85,85,0.3)' },
  duplicate:  { color: 'var(--amber)',  bg: 'var(--amber-dim)',  border: 'rgba(240,160,64,0.3)' },
  'missing factor': { color: 'var(--text-dim)', bg: 'var(--bg-raised)', border: 'var(--border)' },
}

export default function Badge({ label, variant }) {
  const key = variant || label?.toLowerCase?.()
  const s = STYLES[key] || { color: 'var(--text-dim)', bg: 'var(--bg-raised)', border: 'var(--border)' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 7px',
      borderRadius: 4,
      border: `1px solid ${s.border}`,
      background: s.bg,
      color: s.color,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      fontWeight: 500,
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
