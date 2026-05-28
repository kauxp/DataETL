const STATUS_CLASSES = {
  pending:    'bg-amber-50 text-amber-700 border-amber-200',
  flagged:    'bg-red-50 text-red-700 border-red-200',
  approved:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:   'bg-gray-100 text-gray-500 border-gray-200',
  completed:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed:     'bg-red-50 text-red-700 border-red-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  sap:        'bg-blue-50 text-blue-700 border-blue-200',
  utility:    'bg-purple-50 text-purple-700 border-purple-200',
  travel:     'bg-amber-50 text-amber-700 border-amber-200',
  'scope-1':  'bg-amber-50 text-amber-700 border-amber-200',
  'scope-2':  'bg-purple-50 text-purple-700 border-purple-200',
  'scope-3':  'bg-blue-50 text-blue-700 border-blue-200',
  high:       'bg-red-50 text-red-700 border-red-200',
  medium:     'bg-amber-50 text-amber-700 border-amber-200',
  low:        'bg-gray-100 text-gray-500 border-gray-200',
  spike:      'bg-red-50 text-red-700 border-red-200',
  duplicate:  'bg-amber-50 text-amber-700 border-amber-200',
  'missing factor': 'bg-gray-100 text-gray-500 border-gray-200',
  locked:     'bg-gray-100 text-gray-500 border-gray-200',
}

export default function Badge({ label, variant }) {
  const key = (variant || label)?.toLowerCase?.()
  const classes = STATUS_CLASSES[key] || 'bg-gray-100 text-gray-500 border-gray-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}
