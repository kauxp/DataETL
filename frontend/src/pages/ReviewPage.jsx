import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Badge from '../components/Badge'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Flag, ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose
} from '../components/ui/dialog'

const SCOPE_COLOR = { 1: 'bg-amber-400', 2: 'bg-purple-400', 3: 'bg-blue-400' }
const SCOPE_LABEL = { 1: 'SAP / Fuel', 2: 'Utility', 3: 'Travel' }

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

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Review Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">{total.toLocaleString()} records · page {filters.page} of {totalPages || 1}</p>
        </div>
        {selected.size > 0 && (
          <Button onClick={() => bulkMut.mutate(selected)} size="sm">
            <CheckCircle size={14} className="mr-1.5" />
            Approve {selected.size} selected
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-white px-4 py-3 shadow-sm">
        <SlidersHorizontal size={14} className="text-muted-foreground shrink-0" />
        <Select value={filters.review_status} onChange={e => setFilters(f => ({ ...f, review_status: e.target.value, page: 1 }))} className="w-full sm:w-36">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="flagged">Flagged</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select value={filters.scope} onChange={e => setFilters(f => ({ ...f, scope: e.target.value, page: 1 }))} className="w-full sm:w-44">
          <option value="">All source types</option>
          <option value="1">SAP / Fuel & Procurement</option>
          <option value="2">Utility / Electricity</option>
          <option value="3">Corporate Travel</option>
        </Select>
        <Select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))} className="w-full sm:w-40">
          <option value="">All categories</option>
          <option value="fuel">Fuel</option>
          <option value="electricity">Electricity</option>
          <option value="flight">Flight</option>
          <option value="hotel">Hotel</option>
          <option value="ground_transport">Ground Transport</option>
        </Select>
        <button onClick={() => setFilters({ review_status: 'flagged', scope: '', category: '', page: 1 })} className="text-xs text-red-600 hover:text-red-700">
          Flagged only
        </button>
        <button onClick={() => setFilters({ review_status: '', scope: '', category: '', page: 1 })} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-700">
          <X size={12} /> Clear
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading records...</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No records match the current filters</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox" checked={allSelected}
                    onChange={() => allSelected ? setSelected(new Set()) : setSelected(new Set(records.map(r => r.id)))}
                    className="accent-emerald-600 cursor-pointer"
                  />
                </th>
                {['Period', 'Source Type', 'Facility', 'Category', 'Quantity', 'CO₂e (t)', 'Status', 'Flags', 'Actions'].map((h) => (
                  <th key={h} className={`px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide ${['Quantity', 'CO₂e (t)'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/records/${r.id}`)}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={e => {
                        const s = new Set(selected)
                        e.target.checked ? s.add(r.id) : s.delete(r.id)
                        setSelected(s)
                      }}
                      className="accent-emerald-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs font-medium text-gray-900">{r.period_start}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">→ {r.period_end}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SCOPE_COLOR[r.scope] || 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-700">{SCOPE_LABEL[r.scope] || `S${r.scope}`}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs font-medium text-gray-900">{r.facility_name || r.facility_code || '—'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.source_name}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs text-gray-700 capitalize">{r.category}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.subcategory}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-xs text-gray-700 tabular-nums">{parseFloat(r.quantity).toFixed(1)} <span className="text-muted-foreground">{r.unit}</span></span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-xs font-medium text-gray-900 tabular-nums">{parseFloat(r.co2e_tonnes).toFixed(3)}</span>
                    {r.is_manually_edited && <span className="ml-1 text-[10px] text-blue-500">✎</span>}
                  </td>
                  <td className="px-3 py-3"><Badge label={r.review_status} /></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.flags || []).filter(f => !f.is_resolved).map(f => (
                        <span key={f.id} title={f.description}><Badge label={f.flag_type.replace('_', ' ')} variant={f.severity} /></span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    {!r.is_locked && r.review_status !== 'approved' && (
                      <div className="flex gap-1">
                        {[
                          { action: 'approve', Icon: CheckCircle, cls: 'text-emerald-600 hover:bg-emerald-50' },
                          { action: 'reject', Icon: XCircle, cls: 'text-red-500 hover:bg-red-50' },
                          { action: 'flag', Icon: Flag, cls: 'text-amber-500 hover:bg-amber-50' },
                        ].map(({ action, Icon, cls }) => (
                          <button
                            key={action}
                            onClick={() => { setModal({ id: r.id, action }); setNote('') }}
                            title={action}
                            className={`p-1 rounded text-muted-foreground hover:text-current transition-colors ${cls}`}
                          >
                            <Icon size={14} strokeWidth={1.75} />
                          </button>
                        ))}
                      </div>
                    )}
                    {r.is_locked && <span className="text-xs text-muted-foreground">locked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">Page {filters.page} / {totalPages}</span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" disabled={filters.page === 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>
                <ChevronLeft size={14} />
              </Button>
              <Button variant="outline" size="icon" disabled={filters.page >= totalPages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Action dialog */}
      <Dialog open={!!modal} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">{modal?.action} this record?</DialogTitle>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional review note..."
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              size="sm"
              variant={modal?.action === 'reject' ? 'destructive' : modal?.action === 'approve' ? 'default' : 'secondary'}
              onClick={() => actionMut.mutate({ id: modal.id, action: modal.action, notes: note })}
              disabled={actionMut.isPending}
              className="capitalize"
            >
              Confirm {modal?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
