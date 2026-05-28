import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import Badge from '../components/Badge'

export default function BatchesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get('/api/batches/').then(r => r.data),
  })

  const batches = data?.results || data || []

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Batches</h1>
        <p className="text-sm text-muted-foreground mt-1">{batches.length} ingestion runs recorded</p>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading batches...</div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-gray-900">No batches yet</p>
            <p className="text-sm text-muted-foreground mt-1">Upload a file on the Ingest page to get started</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                {['Source', 'File / Pull', 'Uploaded by', 'Status', 'Rows', 'Parsed', 'Errors', 'Date'].map(h => (
                  <th key={h} className={`px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide ${['Rows','Parsed','Errors','Date'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{b.source_name}</div>
                    <div className="mt-1"><Badge label={b.source_type} /></div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">{b.original_filename}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{b.uploaded_by_name}</td>
                  <td className="px-5 py-3"><Badge label={b.status} /></td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-700">{b.row_count}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-emerald-700">{b.parsed_count}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{b.error_count > 0 ? <span className="text-red-600 font-medium">{b.error_count}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-5 py-3 text-right text-xs text-muted-foreground">{new Date(b.uploaded_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
