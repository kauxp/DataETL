import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Badge from '../components/Badge'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckCircle, XCircle, Edit2, Save, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'

function DataRow({ label, value, mono, highlight }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="min-w-[140px] text-xs font-medium text-muted-foreground uppercase tracking-wide pt-0.5">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono text-xs' : ''} ${highlight || 'text-gray-900'} break-all`}>{value}</div>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-gray-50">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      </div>
      <div className="px-5 py-2 pb-4">{children}</div>
    </div>
  )
}

const SCOPE_COLOR = { 1: 'text-amber-600', 2: 'text-purple-600', 3: 'text-blue-600' }

export default function RecordDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editFields, setEditFields] = useState({})
  const [editReason, setEditReason] = useState('')

  const { data: record, isLoading } = useQuery({
    queryKey: ['record', id],
    queryFn: () => api.get(`/api/records/${id}/`).then(r => r.data),
  })

  const actionMut = useMutation({
    mutationFn: ({ action, notes }) => api.post(`/api/records/${id}/${action}/`, { notes }),
    onSuccess: () => { qc.invalidateQueries(['record', id]); qc.invalidateQueries(['records']); toast.success('Updated') },
  })

  const editMut = useMutation({
    mutationFn: (data) => api.patch(`/api/records/${id}/`, data),
    onSuccess: () => {
      qc.invalidateQueries(['record', id])
      setEditing(false)
      setEditFields({})
      toast.success('Record updated')
    },
  })

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Loading record...</div>
  if (!record) return <div className="p-10 text-sm text-red-600">Record not found</div>

  const SCOPE_LABEL = { 1: 'SAP / Fuel & Procurement', 2: 'Utility / Electricity', 3: 'Corporate Travel' }
  const sc = SCOPE_COLOR[record.scope] || 'text-gray-700'

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-900 transition-colors">
        <ArrowLeft size={14} />
        Back to review queue
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-medium uppercase tracking-wide ${sc}`}>{SCOPE_LABEL[record.scope] || `Scope ${record.scope}`}</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 capitalize">
            {record.category} — {record.subcategory?.replace(/_/g, ' ')}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge label={record.review_status} />
            {record.is_locked && <Badge label="Locked" variant="rejected" />}
            {record.is_manually_edited && <span className="text-xs text-blue-500 font-medium">✎ manually edited</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl font-semibold text-gray-900 tabular-nums leading-none">{parseFloat(record.co2e_tonnes).toFixed(4)}</p>
          <p className="text-xs text-muted-foreground mt-1.5">tCO₂e</p>
          {record.original_co2e_tonnes && (
            <p className="text-xs text-muted-foreground line-through mt-1">{parseFloat(record.original_co2e_tonnes).toFixed(4)} original</p>
          )}
        </div>
      </div>

      {/* Actions bar */}
      {!record.is_locked && (
        <div className="flex gap-2 rounded-lg border bg-white p-3 shadow-sm">
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => { setEditFields({ co2e_tonnes: record.co2e_tonnes, reviewer_notes: record.reviewer_notes }); setEditing(true) }}>
              <Edit2 size={13} className="mr-1.5" /> Edit record
            </Button>
          )}
          {record.review_status !== 'approved' && (
            <Button size="sm" onClick={() => actionMut.mutate({ action: 'approve' })}>
              <CheckCircle size={13} className="mr-1.5" /> Approve
            </Button>
          )}
          {record.review_status !== 'rejected' && (
            <Button variant="destructive" size="sm" onClick={() => actionMut.mutate({ action: 'reject' })}>
              <XCircle size={13} className="mr-1.5" /> Reject
            </Button>
          )}
        </div>
      )}

      {/* Edit bar */}
      {editing && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-blue-700 uppercase tracking-wide">Reason for edit (required for audit trail)</label>
            <Input
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              placeholder="e.g. Correcting meter reading from supplier invoice"
              className="bg-white"
            />
          </div>
          <Button size="sm" onClick={() => editMut.mutate({ ...editFields, reason: editReason })} disabled={editMut.isPending || !editReason}>
            <Save size={13} className="mr-1.5" /> Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            <X size={13} className="mr-1.5" /> Cancel
          </Button>
        </div>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Activity data">
          <DataRow label="Period" value={`${record.period_start} → ${record.period_end}`} mono />
          <DataRow label="Quantity" value={`${parseFloat(record.quantity).toFixed(4)} ${record.unit}`} mono />
          <DataRow label="Normalized" value={`${parseFloat(record.quantity_normalized).toFixed(4)} ${record.unit_normalized}`} mono />
          <div className="flex items-center gap-3 py-2.5 border-b border-border">
            <div className="min-w-[140px] text-xs font-medium text-muted-foreground uppercase tracking-wide">CO₂e</div>
            {editing ? (
              <Input
                type="number" step="0.000001"
                value={editFields.co2e_tonnes ?? record.co2e_tonnes}
                onChange={e => setEditFields(f => ({ ...f, co2e_tonnes: e.target.value }))}
                className="w-36 h-7 text-xs"
              />
            ) : (
              <span className="text-sm font-medium text-gray-900 font-mono">
                {parseFloat(record.co2e_tonnes).toFixed(6)} <span className="text-xs text-muted-foreground">tCO₂e</span>
              </span>
            )}
          </div>
          <DataRow label="Facility" value={record.facility_name || record.facility_code} />
          <DataRow label="Location" value={record.location} />
          <DataRow label="Country" value={record.country} />
        </Panel>

        <Panel title="Emission factor">
          {record.emission_factor_details ? (
            <>
              <DataRow label="Factor value" value={`${record.emission_factor_details.factor_value} kgCO₂e / ${record.emission_factor_details.unit_input}`} mono highlight="text-emerald-700" />
              <DataRow label="Source" value={record.emission_factor_details.source} />
              <DataRow label="Version" value={record.emission_factor_details.version} mono />
              <DataRow label="Subcategory" value={record.emission_factor_details.subcategory} />
            </>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No emission factor applied — CO₂e is 0</p>
          )}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Provenance</p>
            <DataRow label="Source" value={record.source_name} />
            <DataRow label="Type" value={record.source_type} />
            <DataRow label="File" value={record.batch_filename} mono />
          </div>
        </Panel>

        <Panel title="Source details">
          <DataRow label="SAP Document" value={record.sap_document_number} mono />
          <DataRow label="Movement Type" value={record.sap_movement_type} mono />
          <DataRow label="Material Code" value={record.sap_material_code} mono />
          <DataRow label="Vendor" value={record.vendor_name} />
          <DataRow label="Meter ID" value={record.meter_id} mono />
          <DataRow label="Account No." value={record.account_number} mono />
          <DataRow label="Tariff Code" value={record.tariff_code} />
          <DataRow label="Traveler ID" value={record.traveler_id} mono />
          <DataRow label="Origin" value={record.origin} />
          <DataRow label="Destination" value={record.destination} />
          <DataRow label="Distance" value={record.distance_km ? `${record.distance_km} km` : null} mono />
          <DataRow label="Travel Class" value={record.travel_class} />
        </Panel>

        <div className="space-y-4">
          <Panel title="Anomaly flags">
            {(record.flags || []).length === 0 ? (
              <p className="py-3 text-sm text-emerald-600 font-medium">✓ No flags detected</p>
            ) : (
              <div className="space-y-2 pt-2">
                {record.flags.map(f => (
                  <div key={f.id} className={`rounded-md border p-3 ${f.is_resolved ? 'border-border bg-gray-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge label={f.flag_type.replace('_', ' ')} variant={f.severity} />
                      {f.is_resolved && <span className="text-xs text-muted-foreground">resolved</span>}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{f.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Review notes">
            {editing ? (
              <Textarea
                value={editFields.reviewer_notes ?? record.reviewer_notes ?? ''}
                onChange={e => setEditFields(f => ({ ...f, reviewer_notes: e.target.value }))}
                className="mt-2 min-h-[80px]"
              />
            ) : (
              <p className={`mt-2 text-sm leading-relaxed ${record.reviewer_notes ? 'text-gray-700' : 'text-muted-foreground'}`}>
                {record.reviewer_notes || 'No notes'}
              </p>
            )}
            {record.reviewed_by_name && (
              <p className="text-xs text-muted-foreground mt-2">
                Reviewed by {record.reviewed_by_name} · {new Date(record.reviewed_at).toLocaleString()}
              </p>
            )}
          </Panel>
        </div>
      </div>

      {/* Edit history */}
      {(record.edits || []).length > 0 && (
        <Panel title="Edit history">
          <div className="space-y-2 pt-2">
            {record.edits.map(e => (
              <div key={e.id} className="rounded-md border bg-gray-50 p-3">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{e.edited_by_name}</span>
                  <span className="text-sm text-muted-foreground">changed</span>
                  <span className="font-mono text-xs text-blue-600">{e.field_name}</span>
                  <span className="font-mono text-xs text-red-500 line-through">{e.old_value}</span>
                  <span className="text-sm text-muted-foreground">→</span>
                  <span className="font-mono text-xs text-emerald-600">{e.new_value}</span>
                </div>
                {e.reason && <p className="text-xs text-gray-700 italic mb-1">{e.reason}</p>}
                <p className="text-xs text-muted-foreground">{new Date(e.edited_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Raw data */}
      {record.raw_data && (
        <Panel title="Raw source data">
          <pre className="mt-2 rounded-md border bg-gray-50 p-3 font-mono text-xs text-gray-700 max-h-[200px] overflow-y-auto leading-relaxed">
            {JSON.stringify(record.raw_data, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  )
}
