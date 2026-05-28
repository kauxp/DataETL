import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Badge from '../components/Badge'
import toast from 'react-hot-toast'
import { Upload, Plus, X, FileText, Zap, Database, Plane, Globe } from 'lucide-react'

const SOURCE_META = {
  SAP:     { label: 'SAP Flat File', icon: Database, color: 'var(--blue)',   desc: 'MB51 / ME2M export (CSV or XLSX)', accept: '.csv,.txt,.tsv,.xlsx' },
  UTILITY: { label: 'Utility CSV',   icon: Zap,      color: 'var(--purple)', desc: 'Electricity billing export (CSV)', accept: '.csv,.txt' },
  TRAVEL:  { label: 'Travel API',    icon: Plane,     color: 'var(--amber)',  desc: 'Concur CSV or JSON API pull', accept: '.csv,.txt' },
}

const FORMAT_HINTS = {
  SAP: 'Semicolon-delimited CSV or XLSX. Expected columns: MBLNR, BUDAT, BWART, MATNR, MAKTX, WERKS, MENGE, MEINS. Movement type 201 = fuel consumption.',
  UTILITY: 'CSV with columns: AccountNumber, MeterID, BillingPeriodStart, BillingPeriodEnd, Consumption_kWh, TariffCode, Country, Region.',
  TRAVEL: 'Concur CSV: Employee ID, Expense Type (AIR/HTL/CAR/TAXI), Transaction Date, From/To Airport (IATA), Class, Nights, Amount.',
}

const TRAVEL_JSON_PLACEHOLDER = `{
  "items": [
    {
      "id": "RPT001-01",
      "employee_id": "EMP042",
      "expense_type": "AIR",
      "transaction_date": "2024-03-15",
      "airport_from": "SIN",
      "airport_to": "LHR",
      "travel_class": "business",
      "amount": 4500,
      "currency": "SGD",
      "vendor": "Singapore Airlines"
    }
  ]
}`

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, ...style,
    }}>{children}</div>
  )
}

function Label({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
      color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 8,
    }}>{children}</div>
  )
}

export default function IngestPage() {
  const qc = useQueryClient()
  const fileRef = useRef()
  const [selectedSource, setSelectedSource] = useState('')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState(null)
  const [showNewSource, setShowNewSource] = useState(false)
  const [newSource, setNewSource] = useState({ name: '', source_type: 'SAP' })
  const [travelMode, setTravelMode] = useState('file') // 'file' | 'json'
  const [jsonPayload, setJsonPayload] = useState(TRAVEL_JSON_PLACEHOLDER)

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get('/api/sources/').then(r => r.data.results || r.data),
  })

  const createSource = useMutation({
    mutationFn: (data) => api.post('/api/sources/', data),
    onSuccess: () => {
      qc.invalidateQueries(['sources'])
      setShowNewSource(false)
      setNewSource({ name: '', source_type: 'SAP' })
      toast.success('Source created')
    },
  })

  const upload = useMutation({
    mutationFn: ({ sourceId, file }) => {
      const fd = new FormData()
      fd.append('source_id', sourceId)
      fd.append('file', file)
      return api.post('/api/upload/', fd)
    },
    onSuccess: (r) => {
      setResult(r.data)
      setFile(null)
      qc.invalidateQueries(['batches'])
      qc.invalidateQueries(['dashboard'])
      toast.success(`Ingested: ${r.data.parsed_count} records`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Upload failed'),
  })

  const apiPull = useMutation({
    mutationFn: ({ sourceId, payload }) =>
      api.post('/api/ingest/travel/', { source_id: sourceId, payload }),
    onSuccess: (r) => {
      setResult(r.data)
      qc.invalidateQueries(['batches'])
      qc.invalidateQueries(['dashboard'])
      toast.success(`Ingested: ${r.data.parsed_count} records`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'API pull failed'),
  })

  const selectedSourceObj = (sources || []).find(s => s.id === selectedSource)
  const meta = selectedSourceObj ? SOURCE_META[selectedSourceObj.source_type] : null

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!selectedSource) return

    if (selectedSourceObj?.source_type === 'TRAVEL' && travelMode === 'json') {
      let payload
      try { payload = JSON.parse(jsonPayload) } catch { return toast.error('Invalid JSON payload') }
      apiPull.mutate({ sourceId: selectedSource, payload })
    } else {
      if (!file) return
      upload.mutate({ sourceId: selectedSource, file })
    }
  }

  const isBusy = upload.isPending || apiPull.isPending

  return (
    <div style={{ padding: '32px 36px', maxWidth: 760, animation: 'fadeSlideIn 0.3s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            — Data pipeline
          </div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, color: 'var(--text-hi)', margin: 0, letterSpacing: '-0.02em' }}>
            Ingest Data
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', margin: '5px 0 0' }}>
            Upload files or pull from connected APIs to create emission records
          </p>
        </div>
        <button
          onClick={() => setShowNewSource(!showNewSource)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text)', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <Plus size={13} strokeWidth={2} />
          New source
        </button>
      </div>

      {/* New source form */}
      {showNewSource && (
        <Card style={{ padding: 22, marginBottom: 16 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)',
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16,
          }}>Create data source</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <Label>Source name</Label>
              <input
                value={newSource.name}
                onChange={e => setNewSource(s => ({ ...s, name: e.target.value }))}
                placeholder="e.g. SAP Plant SIN"
                style={{
                  width: '100%', padding: '9px 12px', boxSizing: 'border-box',
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 5, color: 'var(--text-hi)',
                  fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--teal)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <Label>Type</Label>
              <select
                value={newSource.source_type}
                onChange={e => setNewSource(s => ({ ...s, source_type: e.target.value }))}
                style={{
                  width: '100%', padding: '9px 12px',
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 5, color: 'var(--text)',
                  fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none',
                }}
              >
                <option value="SAP">SAP Flat File (MB51 / ME2M)</option>
                <option value="UTILITY">Utility CSV (electricity billing)</option>
                <option value="TRAVEL">Corporate Travel (Concur / API)</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              onClick={() => createSource.mutate(newSource)}
              disabled={!newSource.name || createSource.isPending}
              style={{
                padding: '8px 18px', borderRadius: 5, border: 'none',
                background: 'var(--teal)', color: '#000',
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', opacity: (!newSource.name || createSource.isPending) ? 0.5 : 1,
              }}
            >Create</button>
            <button
              onClick={() => setShowNewSource(false)}
              style={{
                padding: '8px 14px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text)',
                fontFamily: 'var(--font-body)', fontSize: 12, cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ padding: 22, marginBottom: 12 }}>
          <Label>Select data source</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(sources || []).length === 0 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', padding: '12px 0' }}>
                No sources configured — create one above
              </div>
            )}
            {(sources || []).map(s => {
              const m = SOURCE_META[s.source_type] || {}
              const Icon = m.icon || Database
              const active = selectedSource === s.id
              return (
                <label
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 14px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${active ? m.color || 'var(--teal)' : 'var(--border)'}`,
                    background: active ? 'rgba(0,212,163,0.05)' : 'var(--bg-input)',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio" name="source" value={s.id}
                    checked={active}
                    onChange={() => { setSelectedSource(s.id); setResult(null) }}
                    style={{ accentColor: m.color || 'var(--teal)', display: 'none' }}
                  />
                  <span style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: active ? (m.bg || 'var(--teal-dim)') : 'var(--bg-raised)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: active ? (m.color || 'var(--teal)') : 'var(--text-dim)',
                    flexShrink: 0,
                  }}>
                    <Icon size={15} strokeWidth={1.75} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: active ? 500 : 400, color: active ? 'var(--text-hi)' : 'var(--text)' }}>
                      {s.name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                      {m.desc}
                    </div>
                  </div>
                  <Badge label={s.source_type} />
                  {active && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: m.color || 'var(--teal)', flexShrink: 0,
                    }} />
                  )}
                </label>
              )
            })}
          </div>
        </Card>

        {/* Format hint */}
        {selectedSourceObj && (
          <div style={{
            padding: '11px 14px', marginBottom: 12,
            background: 'rgba(77,158,255,0.06)', border: '1px solid rgba(77,158,255,0.2)',
            borderRadius: 6,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)', marginBottom: 4 }}>
              Expected format
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)', lineHeight: 1.55 }}>
              {FORMAT_HINTS[selectedSourceObj.source_type]}
            </div>
          </div>
        )}

        {/* Travel mode toggle */}
        {selectedSourceObj?.source_type === 'TRAVEL' && (
          <Card style={{ padding: '14px 18px', marginBottom: 12 }}>
            <Label>Ingestion method</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { key: 'file', label: 'File upload', sub: 'Concur CSV export', Icon: Upload },
                { key: 'json', label: 'API pull', sub: 'JSON from Concur / TravelPerk', Icon: Globe },
              ].map(({ key, label, sub, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTravelMode(key)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${travelMode === key ? 'var(--amber)' : 'var(--border)'}`,
                    background: travelMode === key ? 'var(--amber-dim)' : 'var(--bg-input)',
                    color: travelMode === key ? 'var(--amber)' : 'var(--text)',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={15} strokeWidth={1.75} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* File upload zone */}
        {(!selectedSourceObj || selectedSourceObj?.source_type !== 'TRAVEL' || travelMode === 'file') && (
          <Card style={{ padding: 18, marginBottom: 12 }}>
            <Label>File</Label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--teal)' : file ? 'var(--border-hi)' : 'var(--border)'}`,
                borderRadius: 8, padding: '32px 24px', textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
                background: dragOver ? 'var(--teal-dim)' : 'transparent',
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept={meta?.accept || '.csv,.txt,.tsv,.xlsx'}
                style={{ display: 'none' }}
                onChange={e => setFile(e.target.files[0])}
              />
              {file ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <FileText size={18} color="var(--teal)" strokeWidth={1.75} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-hi)' }}>{file.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                    ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  ><X size={14} /></button>
                </div>
              ) : (
                <div>
                  <Upload size={26} color="var(--text-dim)" strokeWidth={1.25} style={{ marginBottom: 10 }} />
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', margin: 0 }}>
                    Drop file here or <span style={{ color: 'var(--teal)' }}>click to browse</span>
                  </p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '6px 0 0' }}>
                    {meta?.accept?.split(',').join(' · ') || '.csv · .xlsx'}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* JSON API pull textarea */}
        {selectedSourceObj?.source_type === 'TRAVEL' && travelMode === 'json' && (
          <Card style={{ padding: 18, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Label>JSON payload</Label>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
                Concur v4 / TravelPerk / TripActions format
              </span>
            </div>
            <textarea
              value={jsonPayload}
              onChange={e => setJsonPayload(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--teal)',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                resize: 'vertical', minHeight: 220, outline: 'none',
                lineHeight: 1.55,
              }}
              onFocus={e => e.target.style.borderColor = 'var(--amber)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </Card>
        )}

        <button
          type="submit"
          disabled={!selectedSource || isBusy || (selectedSourceObj?.source_type !== 'TRAVEL' || travelMode === 'file' ? !file : false)}
          style={{
            width: '100%', padding: '12px', borderRadius: 6, border: 'none',
            background: isBusy ? 'var(--bg-raised)' : 'var(--teal)',
            color: isBusy ? 'var(--text-dim)' : '#000',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
            cursor: isBusy ? 'not-allowed' : 'pointer',
            letterSpacing: '0.02em', transition: 'all 0.15s',
          }}
        >
          {isBusy ? 'Processing...' : selectedSourceObj?.source_type === 'TRAVEL' && travelMode === 'json' ? 'Pull & Ingest →' : 'Upload & Ingest →'}
        </button>
      </form>

      {/* Result panel */}
      {result && (
        <Card style={{ padding: 22, marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            Ingestion result — batch {result.batch_id?.slice(0, 8)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total rows', value: result.row_count, color: 'var(--text-hi)' },
              { label: 'Parsed OK', value: result.parsed_count, color: 'var(--teal)' },
              { label: 'Errors', value: result.error_count, color: result.error_count > 0 ? 'var(--coral)' : 'var(--text-dim)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '14px 16px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500, color, letterSpacing: '-0.02em' }}>{value}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
          {result.processing_log?.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Processing log
              </div>
              <div style={{
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '12px 14px',
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)',
                maxHeight: 140, overflowY: 'auto', lineHeight: 1.7,
              }}>
                {result.processing_log.map((l, i) => (
                  <div key={i} style={{ color: l.level === 'error' ? 'var(--coral)' : 'var(--text)' }}>
                    {JSON.stringify(l)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
