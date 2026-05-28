import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import Badge from '../components/Badge'

function Th({ children, right }) {
  return (
    <th style={{
      padding: '0 14px 10px 0', textAlign: right ? 'right' : 'left',
      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
      color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

export default function BatchesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get('/api/batches/').then(r => r.data),
  })

  const batches = data?.results || data || []

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeSlideIn 0.3s ease both' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          — Ingestion history
        </div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, color: 'var(--text-hi)', margin: 0, letterSpacing: '-0.02em' }}>
          Batches
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', margin: '5px 0 0' }}>
          {batches.length} ingestion runs recorded
        </p>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            Loading batches...
          </div>
        ) : batches.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
              No batches yet
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>
              Upload a file on the Ingest page to get started
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ padding: '0 20px' }}>
                <Th>Source</Th>
                <Th>File / Pull</Th>
                <Th>Uploaded by</Th>
                <Th>Status</Th>
                <Th right>Rows</Th>
                <Th right>Parsed</Th>
                <Th right>Errors</Th>
                <Th right>Date</Th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => (
                <tr
                  key={b.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '13px 14px 13px 0' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--text-hi)', marginBottom: 4 }}>
                      {b.source_name}
                    </div>
                    <Badge label={b.source_type} />
                  </td>
                  <td style={{ padding: '13px 14px 13px 0', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                      {b.original_filename}
                    </span>
                  </td>
                  <td style={{ padding: '13px 14px 13px 0', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text)' }}>
                    {b.uploaded_by_name}
                  </td>
                  <td style={{ padding: '13px 14px 13px 0' }}>
                    <Badge label={b.status} />
                  </td>
                  <td style={{ padding: '13px 14px 13px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                    {b.row_count}
                  </td>
                  <td style={{ padding: '13px 14px 13px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--teal)', fontWeight: 500 }}>
                    {b.parsed_count}
                  </td>
                  <td style={{ padding: '13px 14px 13px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {b.error_count > 0
                      ? <span style={{ color: 'var(--coral)', fontWeight: 500 }}>{b.error_count}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '13px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                    {new Date(b.uploaded_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
