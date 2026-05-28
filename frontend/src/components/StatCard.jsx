const ACCENT = {
  gray:   { icon: 'text-gray-500 bg-gray-100', value: 'text-gray-900' },
  teal:   { icon: 'text-emerald-600 bg-emerald-50', value: 'text-emerald-700' },
  green:  { icon: 'text-emerald-600 bg-emerald-50', value: 'text-emerald-700' },
  amber:  { icon: 'text-amber-600 bg-amber-50', value: 'text-amber-700' },
  yellow: { icon: 'text-amber-600 bg-amber-50', value: 'text-amber-700' },
  red:    { icon: 'text-red-600 bg-red-50', value: 'text-red-700' },
  blue:   { icon: 'text-blue-600 bg-blue-50', value: 'text-blue-700' },
  purple: { icon: 'text-purple-600 bg-purple-50', value: 'text-purple-700' },
}

export default function StatCard({ label, value, sub, color = 'gray', icon: Icon }) {
  const a = ACCENT[color] || ACCENT.gray
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={`rounded-md p-1.5 ${a.icon}`}>
            <Icon size={15} strokeWidth={2} />
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${a.value}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
