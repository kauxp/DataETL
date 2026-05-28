import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Badge from '../components/Badge'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckCircle, XCircle, Edit2, Save, X } from 'lucide-react'

function DataRow({ label, value, mono, highlight }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '9px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        minWidth: 140, fontFamily: 'var(--font-body)', fontSize: 11,
        color: 'var(--text-dim)', paddingTop: 1,
        textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
      }}>{label}</div>
      <div style={{
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
        fontSize: mono ? 11 : 12,
        color: highlight ? highlight : 'var(--text-hi)',
        wordBreak: 'break-all',
      }}>{value}</div>
    </div>
  )
}

function Panel({ title, children, style }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden', ...style,
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
        color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>{title}</div>
      <div style={{ padding: '4px 20px 16px' }}>{children}</div>
    </div>
  )
}

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

  if (isLoading) return (
    <div style={{ padding: 48, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
      Loading record...
    </div>
  )
  if (!record) return (
    <div style={{ padding: 48, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--coral)' }}>
      Record not found
    </div>
  )

  const SCOPE_COLOR = { 1: 'var(--amber)', 2: 'var(--purple)', 3: 'var(--blue)' }
  const sc = SCOPE_COLOR[record.scope] || 'var(--text)'

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeSlideIn 0.3s ease both' }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: 12,
          padding: 0, marginBottom: 24, transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        Back to review queue
      </button>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: sc, display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: sc, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Scope {record.scope}
            </span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 26,
            color: 'var(--text-hi)', margin: '0 0 10px', letterSpacing: '-0.02em',
            textTransform: 'capitalize',
          }}>
            {record.category} — {record.subcategory?.replace(/_/g, ' ')}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge label={record.review_status} />
            {record.is_locked && <Badge label="Locked" variant="rejected" />}
            {record.is_manually_edited && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--blue)', letterSpacing: '0.08em' }}>
                ✎ manually edited
              </span>
            )}
          </div>
        </div>

        {/* CO2e hero number */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 38, fontWeight: 500, color: 'var(--text-hi)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {parseFloat(record.co2e_tonnes).toFixed(4)}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>tCO₂e</div>
          {record.original_co2e_tonnes && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', textDecoration: 'line-through', marginTop: 4 }}>
              {parseFloat(record.original_co2e_tonnes).toFixed(4)} original
            </div>
          )}
        </div>
      </div>

      {/* Actions bar */}
      {!record.is_locked && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 24,
          padding: '14px 18px',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8,
        }}>
          {!editing && (
            <button
              onClick={() => { setEditFields({ co2e_tonnes: record.co2e_tonnes, reviewer_notes: record.reviewer_notes }); setEditing(true) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 5,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text)', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 12, transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <Edit2 size={13} strokeWidth={1.75} /> Edit record
            </button>
          )}
          {record.review_status !== 'approved' && (
            <button
              onClick={() => actionMut.mutate({ action: 'approve' })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 5, border: 'none',
                background: 'var(--teal)', color: '#000',
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <CheckCircle size={13} strokeWidth={2} /> Approve
            </button>
          )}
          {record.review_status !== 'rejected' && (
            <button
              onClick={() => actionMut.mutate({ action: 'reject' })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 5,
                border: '1px solid rgba(240,85,85,0.3)',
                background: 'var(--coral-dim)', color: 'var(--coral)',
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <XCircle size={13} strokeWidth={1.75} /> Reject
            </button>
          )}
        </div>
      )}

      {/* Edit bar */}
      {editing && (
        <div style={{
          padding: '16px 18px', marginBottom: 16,
          background: 'rgba(77,158,255,0.06)', border: '1px solid rgba(77,158,255,0.25)',
          borderRadius: 8, display: 'flex', gap: 14, alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Reason for edit (required for audit trail)
            </div>
            <input
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              placeholder="e.g. Correcting meter reading from supplier invoice"
              style={{
                width: '100%', padding: '9px 12px', boxSizing: 'border-box',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 5, color: 'var(--text-hi)',
                fontFamily: 'var(--font-body)', fontSize: 12, outline: 'none',
              }}
            />
          </div>
          <button
            onClick={() => editMut.mutate({ ...editFields, reason: editReason })}
            disabled={editMut.isPending || !editReason}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 5, border: 'none',
              background: 'var(--blue)', color: '#fff',
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              opacity: (!editReason || editMut.isPending) ? 0.5 : 1,
            }}
          >
            <Save size={13} /> Save
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '9px 12px', borderRadius: 5,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text)', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 12,
            }}
          >
            <X size={13} /> Cancel
          </button>
        </div>
      )}

      {/* Content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Panel title="Activity data">
          <DataRow label="Period" value={`${record.period_start} → ${record.period_end}`} mono />
          <DataRow label="Quantity" value={`${parseFloat(record.quantity).toFixed(4)} ${record.unit}`} mono />
          <DataRow label="Normalized" value={`${parseFloat(record.quantity_normalized).toFixed(4)} ${record.unit_normalized}`} mono />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ minWidth: 140, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>CO₂e</div>
            {editing ? (
              <input
                type="number" step="0.000001"
                value={editFields.co2e_tonnes ?? record.co2e_tonnes}
                onChange={e => setEditFields(f => ({ ...f, co2e_tonnes: e.target.value }))}
                style={{
                  padding: '5px 8px', background: 'var(--bg-input)',
                  border: '1px solid var(--blue)', borderRadius: 5,
                  color: 'var(--text-hi)', fontFamily: 'var(--font-mono)', fontSize: 12, width: 140, outline: 'none',
                }}
              />
            ) : (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: 'var(--text-hi)' }}>
                {parseFloat(record.co2e_tonnes).toFixed(6)} <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>tCO₂e</span>
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
              <DataRow label="Factor value" value={`${record.emission_factor_details.factor_value} kgCO₂e / ${record.emission_factor_details.unit_input}`} mono highlight="var(--teal)" />
              <DataRow label="Source" value={record.emission_factor_details.source} />
              <DataRow label="Version" value={record.emission_factor_details.version} mono />
              <DataRow label="Subcategory" value={record.emission_factor_details.subcategory} />
            </>
          ) : (
            <div style={{ padding: '16px 0', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>
              No emission factor applied — CO₂e is 0
            </div>
          )}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Provenance
            </div>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel title="Anomaly flags">
            {(record.flags || []).length === 0 ? (
              <div style={{ padding: '16px 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--teal)' }}>
                ✓ No flags detected
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                {record.flags.map(f => (
                  <div key={f.id} style={{
                    padding: '12px 14px', borderRadius: 6,
                    background: f.is_resolved ? 'var(--bg-input)' : 'var(--coral-dim)',
                    border: `1px solid ${f.is_resolved ? 'var(--border)' : 'rgba(240,85,85,0.25)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Badge label={f.flag_type.replace('_', ' ')} variant={f.severity} />
                      {f.is_resolved && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>resolved</span>
                      )}
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)', margin: 0, lineHeight: 1.55 }}>
                      {f.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Review notes">
            {editing ? (
              <textarea
                value={editFields.reviewer_notes ?? record.reviewer_notes ?? ''}
                onChange={e => setEditFields(f => ({ ...f, reviewer_notes: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 0', boxSizing: 'border-box',
                  background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                  color: 'var(--text-hi)', fontFamily: 'var(--font-body)', fontSize: 12,
                  resize: 'none', height: 80, outline: 'none', marginTop: 8,
                }}
              />
            ) : (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: record.reviewer_notes ? 'var(--text)' : 'var(--text-dim)', margin: '8px 0 0', lineHeight: 1.6 }}>
                {record.reviewer_notes || 'No notes'}
              </p>
            )}
            {record.reviewed_by_name && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 10 }}>
                Reviewed by {record.reviewed_by_name} · {new Date(record.reviewed_at).toLocaleString()}
              </p>
            )}
          </Panel>
        </div>
      </div>

      {/* Edit history */}
      {(record.edits || []).length > 0 && (
        <Panel title="Edit history" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8 }}>
            {record.edits.map(e => (
              <div key={e.id} style={{
                padding: '10px 12px', borderRadius: 5,
                background: 'var(--bg-input)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, color: 'var(--text-hi)' }}>{e.edited_by_name}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)' }}>changed</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)' }}>{e.field_name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--coral)', textDecoration: 'line-through' }}>{e.old_value}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)' }}>→</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)' }}>{e.new_value}</span>
                </div>
                {e.reason && <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)', margin: '0 0 4px', fontStyle: 'italic' }}>{e.reason}</p>}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
                  {new Date(e.edited_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Raw data */}
      {record.raw_data && (
        <Panel title="Raw source data" style={{ marginTop: 14 }}>
          <pre style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: 5, padding: '12px 14px',
            color: 'var(--text)', maxHeight: 200, overflowY: 'auto',
            margin: '8px 0 0', lineHeight: 1.65,
          }}>
            {JSON.stringify(record.raw_data, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  )
}
