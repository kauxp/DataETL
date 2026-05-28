import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie,
} from 'recharts'
import api from '../lib/api'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import { Activity, AlertTriangle, CheckCircle, Clock, Zap, Plane, Flame, TrendingUp } from 'lucide-react'

const CATEGORY_COLORS = {
  fuel:             '#f59e0b',
  electricity:      '#8b5cf6',
  flight:           '#3b82f6',
  hotel:            '#10b981',
  ground_transport: '#6ee7b7',
  procurement:      '#94a3b8',
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n?.toFixed?.(1) ?? n
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-white p-3 shadow-md text-xs">
      <p className="font-medium text-gray-900 mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.fill }} />
          <span className="text-gray-600">{p.name}</span>
          <span className="font-medium text-gray-900 ml-auto">{p.value?.toFixed?.(2)} t</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/dashboard/').then(r => r.data),
    refetchInterval: 30_000,
  })

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  )

  const d = data || {}

  const monthlyMap = {}
  ;(d.monthly_co2e || []).forEach(r => {
    if (!r.month) return
    if (!monthlyMap[r.month]) monthlyMap[r.month] = { month: r.month.slice(0, 7) }
    monthlyMap[r.month][`s${r.scope}`] = (monthlyMap[r.month][`s${r.scope}`] || 0) + r.co2e_tonnes
  })
  const chartData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month))

  const pieData = (d.category_breakdown || []).map(r => ({
    name: r.category.replace('_', ' '),
    value: parseFloat(r.co2e_tonnes),
    fill: CATEGORY_COLORS[r.category] || '#94a3b8',
  }))

  const total = d.total_co2e_tonnes || 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Emissions Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">{d.total_records || 0} activity records across all scopes</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-gray-900 tabular-nums">{fmt(total)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">tCO₂e total</p>
        </div>
      </div>

      {/* Scope cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Scope 1" value={`${fmt(d.scope1_co2e || 0)} t`} sub="Direct — fuel combustion" color="amber" icon={Flame} />
        <StatCard label="Scope 2" value={`${fmt(d.scope2_co2e || 0)} t`} sub="Purchased electricity" color="purple" icon={Zap} />
        <StatCard label="Scope 3" value={`${fmt(d.scope3_co2e || 0)} t`} sub="Business travel & more" color="blue" icon={Plane} />
        <StatCard label="Total CO₂e" value={`${fmt(total)} t`} sub="All scopes combined" color="teal" icon={TrendingUp} />
      </div>

      {/* Review status */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Pending Review" value={d.pending_count || 0} color="amber" icon={Clock} />
        <StatCard label="Flagged" value={d.flagged_count || 0} color="red" icon={AlertTriangle} />
        <StatCard label="Approved" value={d.approved_count || 0} color="teal" icon={CheckCircle} />
        <StatCard label="Total Records" value={d.total_records || 0} color="gray" icon={Activity} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-[1fr_320px] gap-4">
        {/* Bar chart */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-900">Monthly emissions by scope</h3>
            <p className="text-xs text-muted-foreground mt-0.5">tCO₂e by reporting period</p>
          </div>
          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={10} barGap={3}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  <Bar dataKey="s1" name="Scope 1" fill="#f59e0b" radius={[2,2,0,0]} />
                  <Bar dataKey="s2" name="Scope 2" fill="#8b5cf6" radius={[2,2,0,0]} />
                  <Bar dataKey="s3" name="Scope 3" fill="#3b82f6" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-3 pt-3 border-t border-border">
                {[['Scope 1', '#f59e0b'], ['Scope 2', '#8b5cf6'], ['Scope 3', '#3b82f6']].map(([label, color]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />
                    <span className="text-xs text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No data yet — upload a batch to begin</p>
            </div>
          )}
        </div>

        {/* Pie chart */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-medium text-gray-900 mb-4">By category</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={55} innerRadius={25} dataKey="value" strokeWidth={0}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => active && payload?.length ? (
                      <div className="rounded-lg border bg-white p-2 shadow-md text-xs">
                        <p className="capitalize text-gray-700">{payload[0].name}</p>
                        <p className="font-semibold text-gray-900">{payload[0].value?.toFixed(2)} t</p>
                      </div>
                    ) : null}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {pieData.map(p => (
                  <div key={p.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0" style={{ background: p.fill }} />
                      <span className="text-xs capitalize text-gray-600">{p.name}</span>
                    </div>
                    <span className="text-xs font-medium text-gray-900 tabular-nums">{p.value.toFixed(1)} t</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No data</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent batches */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-gray-900">Recent ingestion batches</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Source', 'File / Pull', 'Status', 'Parsed', 'Errors', 'Date'].map(h => (
                <th key={h} className={`px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide ${['Parsed','Errors','Date'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d.recent_batches || []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">No batches yet</td>
              </tr>
            ) : (d.recent_batches || []).map(b => (
              <tr key={b.id} className="border-b border-border last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="font-medium text-gray-900 text-sm">{b.source_name}</div>
                  <Badge label={b.source_type} />
                </td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">{b.original_filename}</td>
                <td className="px-5 py-3"><Badge label={b.status} /></td>
                <td className="px-5 py-3 text-right font-medium text-emerald-700 tabular-nums">{b.parsed_count}</td>
                <td className="px-5 py-3 text-right tabular-nums">{b.error_count > 0 ? <span className="text-red-600 font-medium">{b.error_count}</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-5 py-3 text-right text-xs text-muted-foreground">{new Date(b.uploaded_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
