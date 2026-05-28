import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Badge from '../components/Badge'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Flag, ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react'

const SCOPE_DOT = { 1: 'var(--amber)', 2: 'var(--purple)', 3: 'var(--blue)' }

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

function FilterSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 5, padding: '6px 10px', color: 'var(--text)',
        fontFamily: 'var(--font-body)', fontSize: 12,
        outline: 'none', cursor: 'pointer',
      }}
    >{children}</select>
  )
}

export default function ReviewPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ review_status: '', scope: '', category: '', page: 1 })
  const [selected, setSelected] = useState(new Set())
  const [modal, setModal] = useState(null)
  const [note, setNote] = useState('')

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))

  const { data, isLoading } = useQuery({
    queryKey: ['records', params],
    queryFn: () => api.get('/api/records/', { params }).then(r => r.data),
  })

  const actionMut = useMutation({
    mutationFn: ({ id, action, notes }) => api.post(`/api/records/${id}/${action}/`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries(['records'])
      qc.invalidateQueries(['dashboard'])
      setModal(null)
      setNote('')
      toast.success('Record updated')
    },
  })

  const bulkMut = useMutation({
    mutationFn: (ids) => api.post('/api/records/bulk_approve/', { ids: [...ids] }),
    onSuccess: (r) => {
      qc.invalidateQueries(['records'])
      qc.invalidateQueries(['dashboard'])
      setSelected(new Set())
      toast.success(`Approved ${r.data.approved_count} records`)
    },
  })

  const records = data?.results || []
  const total = data?.count || 0
  const totalPages = Math.ceil(total / 50)
  const allSelected = records.length > 0 && records.every(r => selected.has(r.id))

  const ACTION_COLOR = { approve: 'var(--teal)', reject: 'var(--coral)', flag: 'var(--amber)' }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeSlideIn 0.3s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            — Audit workflow
          </div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, color: 'var(--text-hi)', margin: 0, letterSpacing: '-0.02em' }}>
            Review Queue
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', margin: '5px 0 0' }}>
            {total.toLocaleString()} records · page {filters.page} of {totalPages || 1}
          </p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => bulkMut.mutate(selected)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--teal)', color: '#000',
              border: 'none', borderRadius: 6, padding: '9px 18px',
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', letterSpacing: '0.02em',
            }}
          >
            <CheckCircle size={14} strokeWidth={2} />
            Approve {selected.size} selected
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '14px 18px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <SlidersHorizontal size={13} color="var(--text-dim)" strokeWidth={1.75} />
        <FilterSelect value={filters.review_status} onChange={e => setFilters(f => ({ ...f, review_status: e.target.value, page: 1 }))}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="flagged">Flagged</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </FilterSelect>
        <FilterSelect value={filters.scope} onChange={e => setFilters(f => ({ ...f, scope: e.target.value, page: 1 }))}>
          <option value="">All scopes</option>
          <option value="1">Scope 1 — Direct</option>
          <option value="2">Scope 2 — Electricity</option>
          <option value="3">Scope 3 — Travel</option>
        </FilterSelect>
        <FilterSelect value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))}>
          <option value="">All categories</option>
          <option value="fuel">Fuel</option>
          <option value="electricity">Electricity</option>
          <option value="flight">Flight</option>
          <option value="hotel">Hotel</option>
          <option value="ground_transport">Ground Transport</option>
        </FilterSelect>
        <button
          onClick={() => setFilters({ review_status: 'flagged', scope: '', category: '', page: 1 })}
          style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px' }}
        >
          Flagged only
        </button>
        <button
          onClick={() => setFilters({ review_status: '', scope: '', category: '', page: 1 })}
          style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <X size={12} /> Clear
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            Loading records...
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            No records match the current filters
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '0 14px 10px', borderBottom: '1px solid var(--border)', width: 32 }}>
                  <input
                    type="checkbox" checked={allSelected} onChange={() => {
                      if (allSelected) setSelected(new Set())
                      else setSelected(new Set(records.map(r => r.id)))
                    }}
                    style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
                  />
                </th>
                <Th>Period</Th>
                <Th>Scope</Th>
                <Th>Facility</Th>
                <Th>Category</Th>
                <Th right>Quantity</Th>
                <Th right>CO₂e (t)</Th>
                <Th>Status</Th>
                <Th>Flags</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/records/${r.id}`)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={e => {
                        const s = new Set(selected)
                        e.target.checked ? s.add(r.id) : s.delete(r.id)
                        setSelected(s)
                      }}
                      style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '11px 14px 11px 0' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)' }}>{r.period_start}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>→ {r.period_end}</div>
                  </td>
                  <td style={{ padding: '11px 14px 11px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: SCOPE_DOT[r.scope], flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>S{r.scope}</span>
                    </div>
                  </td>
                  <td style={{ padding: '11px 14px 11px 0' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-hi)', fontWeight: 500 }}>{r.facility_name || r.facility_code || '—'}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{r.source_name}</div>
                  </td>
                  <td style={{ padding: '11px 14px 11px 0' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)', textTransform: 'capitalize' }}>{r.category}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{r.subcategory}</div>
                  </td>
                  <td style={{ padding: '11px 14px 11px 0', textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
                      {parseFloat(r.quantity).toFixed(1)} <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{r.unit}</span>
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px 11px 0', textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--text-hi)' }}>
                      {parseFloat(r.co2e_tonnes).toFixed(3)}
                    </span>
                    {r.is_manually_edited && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--blue)' }}>✎</span>}
                  </td>
                  <td style={{ padding: '11px 14px 11px 0' }}><Badge label={r.review_status} /></td>
                  <td style={{ padding: '11px 14px 11px 0' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {(r.flags || []).filter(f => !f.is_resolved).map(f => (
                        <span key={f.id} title={f.description}>
                          <Badge label={f.flag_type.replace('_', ' ')} variant={f.severity} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '11px 0' }} onClick={e => e.stopPropagation()}>
                    {!r.is_locked && r.review_status !== 'approved' && (
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[
                          { action: 'approve', Icon: CheckCircle, color: 'var(--teal)' },
                          { action: 'reject', Icon: XCircle, color: 'var(--coral)' },
                          { action: 'flag', Icon: Flag, color: 'var(--amber)' },
                        ].map(({ action, Icon, color }) => (
                          <button
                            key={action}
                            onClick={() => { setModal({ id: r.id, action }); setNote('') }}
                            title={action}
                            style={{
                              padding: '5px 6px', borderRadius: 5, border: 'none',
                              background: 'transparent', color: 'var(--text-dim)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center',
                              transition: 'color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = color; e.currentTarget.style.background = 'var(--bg-raised)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'transparent' }}
                          >
                            <Icon size={14} strokeWidth={1.75} />
                          </button>
                        ))}
                      </div>
                    )}
                    {r.is_locked && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>locked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 18px', borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              Page {filters.page} / {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { disabled: filters.page === 1, onClick: () => setFilters(f => ({ ...f, page: f.page - 1 })), Icon: ChevronLeft },
                { disabled: filters.page >= totalPages, onClick: () => setFilters(f => ({ ...f, page: f.page + 1 })), Icon: ChevronRight },
              ].map(({ disabled, onClick, Icon }, i) => (
                <button
                  key={i}
                  disabled={disabled}
                  onClick={onClick}
                  style={{
                    padding: '5px 8px', borderRadius: 5,
                    border: '1px solid var(--border)',
                    background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer',
                    color: disabled ? 'var(--text-dim)' : 'var(--text)',
                    opacity: disabled ? 0.4 : 1,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
            borderRadius: 10, padding: '28px', width: 420,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            animation: 'fadeSlideIn 0.2s ease both',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: ACTION_COLOR[modal.action],
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12,
            }}>
              — {modal.action} record
            </div>
            <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 20, color: 'var(--text-hi)', margin: '0 0 16px', textTransform: 'capitalize' }}>
              {modal.action} this record?
            </h3>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Optional review note..."
              style={{
                width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text-hi)',
                fontFamily: 'var(--font-body)', fontSize: 12,
                resize: 'none', height: 80, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModal(null)}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 12,
                }}
              >Cancel</button>
              <button
                onClick={() => actionMut.mutate({ id: modal.id, action: modal.action, notes: note })}
                disabled={actionMut.isPending}
                style={{
                  padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: ACTION_COLOR[modal.action],
                  color: modal.action === 'flag' ? '#000' : (modal.action === 'approve' ? '#000' : '#fff'),
                  cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >Confirm {modal.action}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
