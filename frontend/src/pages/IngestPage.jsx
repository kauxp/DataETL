import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Badge from '../components/Badge'
import toast from 'react-hot-toast'
import { Upload, Plus, X, FileText, Zap, Database, Plane, Globe } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Textarea } from '../components/ui/textarea'

const SOURCE_META = {
  SAP:     { label: 'SAP Flat File', icon: Database, desc: 'MB51 / ME2M export (CSV or XLSX)', accept: '.csv,.txt,.tsv,.xlsx' },
  UTILITY: { label: 'Utility CSV',   icon: Zap,      desc: 'Electricity billing export (CSV)', accept: '.csv,.txt' },
  TRAVEL:  { label: 'Travel API',    icon: Plane,     desc: 'Concur CSV or JSON API pull', accept: '.csv,.txt' },
}

const FORMAT_HINTS = {
  SAP: 'Semicolon-delimited CSV or XLSX. Expected columns: MBLNR, BUDAT, BWART, MATNR, MAKTX, WERKS, MENGE, MEINS.',
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
      "currency": "SGD"
    }
  ]
}`

export default function IngestPage() {
  const qc = useQueryClient()
  const fileRef = useRef()
  const [selectedSource, setSelectedSource] = useState('')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState(null)
  const [showNewSource, setShowNewSource] = useState(false)
  const [newSource, setNewSource] = useState({ name: '', source_type: 'SAP' })
  const [travelMode, setTravelMode] = useState('file')
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
    <div className="p-6 max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ingest Data</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload files or pull from connected APIs</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowNewSource(!showNewSource)}>
          <Plus size={13} className="mr-1.5" />
          New source
        </Button>
      </div>

      {/* New source form */}
      {showNewSource && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Create data source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source name</Label>
                <Input
                  value={newSource.name}
                  onChange={e => setNewSource(s => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. SAP Plant SIN"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select
                  value={newSource.source_type}
                  onChange={e => setNewSource(s => ({ ...s, source_type: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="SAP">SAP Flat File</option>
                  <option value="UTILITY">Utility CSV</option>
                  <option value="TRAVEL">Corporate Travel</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createSource.mutate(newSource)} disabled={!newSource.name || createSource.isPending}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setShowNewSource(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Select data source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(sources || []).length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No sources configured — create one above</p>
            )}
            {(sources || []).map(s => {
              const m = SOURCE_META[s.source_type] || {}
              const Icon = m.icon || Database
              const active = selectedSource === s.id
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    active ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio" name="source" value={s.id}
                    checked={active}
                    onChange={() => { setSelectedSource(s.id); setResult(null) }}
                    className="hidden"
                  />
                  <span className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    <Icon size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${active ? 'text-emerald-900' : 'text-gray-900'}`}>{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{m.desc}</div>
                  </div>
                  <Badge label={s.source_type} />
                </label>
              )
            })}
          </CardContent>
        </Card>

        {/* Format hint */}
        {selectedSourceObj && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium text-blue-700 mb-1">Expected format</p>
            <p className="text-xs text-blue-600">{FORMAT_HINTS[selectedSourceObj.source_type]}</p>
          </div>
        )}

        {/* Travel mode toggle */}
        {selectedSourceObj?.source_type === 'TRAVEL' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Ingestion method</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'file', label: 'File upload', sub: 'Concur CSV export', Icon: Upload },
                  { key: 'json', label: 'API pull', sub: 'JSON from Concur / TravelPerk', Icon: Globe },
                ].map(({ key, label, sub, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTravelMode(key)}
                    className={`flex items-center gap-2.5 p-3 rounded-md border text-left transition-colors ${
                      travelMode === key ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={14} className={travelMode === key ? 'text-emerald-600' : 'text-gray-400'} />
                    <div>
                      <div className={`text-sm font-medium ${travelMode === key ? 'text-emerald-900' : 'text-gray-900'}`}>{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* File upload zone */}
        {(!selectedSourceObj || selectedSourceObj?.source_type !== 'TRAVEL' || travelMode === 'file') && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">File</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`rounded-md border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-emerald-400 bg-emerald-50' :
                  file ? 'border-gray-400 bg-gray-50' :
                  'border-border hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept={meta?.accept || '.csv,.txt,.tsv,.xlsx'}
                  className="hidden"
                  onChange={e => setFile(e.target.files[0])}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2.5">
                    <FileText size={16} className="text-emerald-600" />
                    <span className="text-sm font-medium text-gray-900">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                    <button type="button" onClick={e => { e.stopPropagation(); setFile(null) }} className="text-muted-foreground hover:text-gray-700">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload size={22} className="text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Drop file here or <span className="text-emerald-600 font-medium">click to browse</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{meta?.accept?.split(',').join(' · ') || '.csv · .xlsx'}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* JSON textarea */}
        {selectedSourceObj?.source_type === 'TRAVEL' && travelMode === 'json' && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">JSON payload</CardTitle>
                <span className="text-xs text-muted-foreground">Concur v4 / TravelPerk format</span>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={jsonPayload}
                onChange={e => setJsonPayload(e.target.value)}
                className="font-mono text-xs min-h-[200px]"
              />
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={!selectedSource || isBusy || (selectedSourceObj?.source_type !== 'TRAVEL' || travelMode === 'file' ? !file : false)}
        >
          {isBusy ? 'Processing...' :
           selectedSourceObj?.source_type === 'TRAVEL' && travelMode === 'json' ? 'Pull & Ingest' :
           'Upload & Ingest'}
        </Button>
      </form>

      {/* Result panel */}
      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-emerald-700">Ingestion complete — batch {result.batch_id?.slice(0, 8)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total rows', value: result.row_count, cls: 'text-gray-900' },
                { label: 'Parsed OK', value: result.parsed_count, cls: 'text-emerald-700' },
                { label: 'Errors', value: result.error_count, cls: result.error_count > 0 ? 'text-red-600' : 'text-muted-foreground' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="rounded-md border bg-gray-50 p-4 text-center">
                  <p className={`text-3xl font-semibold tabular-nums ${cls}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
            {result.processing_log?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Processing log</p>
                <div className="rounded-md border bg-gray-50 p-3 font-mono text-xs max-h-32 overflow-y-auto space-y-0.5">
                  {result.processing_log.map((l, i) => (
                    <div key={i} className={l.level === 'error' ? 'text-red-600' : 'text-gray-700'}>{JSON.stringify(l)}</div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
