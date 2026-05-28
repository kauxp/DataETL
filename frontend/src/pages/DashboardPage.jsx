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
  fuel:             '#f0a040',
  electricity:      '#a880ff',
  flight:           '#4d9eff',
  hotel:            '#00d4a3',
  ground_transport: '#5eceff',
  procurement:      '#8a95a8',
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n?.toFixed?.(1) ?? n
}

function SectionHeader({ children, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{
        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
        color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em',
        margin: 0,
      }}>{children}</h2>
      {sub && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-raised)', border: '1px solid var(--border-hi)',
      borderRadius: 6, padding: '10px 14px',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, display: 'inline-block' }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)' }}>{p.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)', marginLeft: 'auto' }}>{p.value?.toFixed?.(2)} t</span>
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
        Loading dashboard data...
      </div>
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
    fill: CATEGORY_COLORS[r.category] || '#8a95a8',
  }))

  const total = d.total_co2e_tonnes || 0

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeSlideIn 0.3s ease both' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            — Overview
          </div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 30, color: 'var(--text-hi)', margin: 0, letterSpacing: '-0.02em' }}>
            Emissions Dashboard
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', margin: '6px 0 0' }}>
            {d.total_records || 0} activity records across all scopes
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 500, color: 'var(--text-hi)', letterSpacing: '-0.03em' }}>
            {fmt(total)} <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>tCO₂e</span>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>Total carbon footprint</div>
        </div>
      </div>

      {/* Scope cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <StatCard label="Scope 1" value={`${fmt(d.scope1_co2e || 0)} t`} sub="Direct — fuel combustion" color="amber" icon={Flame} />
        <StatCard label="Scope 2" value={`${fmt(d.scope2_co2e || 0)} t`} sub="Purchased electricity" color="purple" icon={Zap} />
        <StatCard label="Scope 3" value={`${fmt(d.scope3_co2e || 0)} t`} sub="Business travel & more" color="blue" icon={Plane} />
        <StatCard label="Total CO₂e" value={`${fmt(total)} t`} sub="All scopes combined" color="teal" icon={TrendingUp} />
      </div>

      {/* Review status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        <StatCard label="Pending Review" value={d.pending_count || 0} color="amber" icon={Clock} />
        <StatCard label="Flagged" value={d.flagged_count || 0} color="red" icon={AlertTriangle} />
        <StatCard label="Approved" value={d.approved_count || 0} color="green" icon={CheckCircle} />
        <StatCard label="Total Records" value={d.total_records || 0} color="gray" icon={Activity} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 20 }}>
        {/* Bar chart */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 24px 16px' }}>
          <SectionHeader sub="tCO₂e by reporting period">Monthly emissions by scope</SectionHeader>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={10} barGap={3}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-dim)', fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)', fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} width={45} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="s1" name="Scope 1" fill="#f0a040" radius={[2,2,0,0]} />
                <Bar dataKey="s2" name="Scope 2" fill="#a880ff" radius={[2,2,0,0]} />
                <Bar dataKey="s3" name="Scope 3" fill="#4d9eff" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>No data yet — upload a batch to begin</span>
            </div>
          )}
          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {[['Scope 1', '#f0a040'], ['Scope 2', '#a880ff'], ['Scope 3', '#4d9eff']].map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pie / Category */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px' }}>
          <SectionHeader>By category</SectionHeader>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={58} innerRadius={28} dataKey="value" strokeWidth={0}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => active && payload?.length ? (
                      <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-hi)', borderRadius: 6, padding: '8px 12px' }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)', textTransform: 'capitalize' }}>{payload[0].name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-hi)' }}>{payload[0].value?.toFixed(2)} t</div>
                      </div>
                    ) : null}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                {pieData.map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text)', textTransform: 'capitalize' }}>{p.name}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)' }}>{p.value.toFixed(1)} t</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>No data</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent batches */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px' }}>
        <SectionHeader>Recent ingestion batches</SectionHeader>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Source', 'File / Pull', 'Status', 'Parsed', 'Errors', 'Date'].map(h => (
                <th key={h} style={{
                  padding: '0 12px 10px 0', textAlign: h === 'Parsed' || h === 'Errors' || h === 'Date' ? 'right' : 'left',
                  fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                  color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
                  borderBottom: '1px solid var(--border)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d.recent_batches || []).length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px 0', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                  No batches yet
                </td>
              </tr>
            ) : (d.recent_batches || []).map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 12px 12px 0' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--text-hi)', marginBottom: 4 }}>{b.source_name}</div>
                  <Badge label={b.source_type} />
                </td>
                <td style={{ padding: '12px 12px 12px 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.original_filename}
                </td>
                <td style={{ padding: '12px 12px 12px 0' }}><Badge label={b.status} /></td>
                <td style={{ padding: '12px 12px 12px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--teal)' }}>
                  {b.parsed_count}
                </td>
                <td style={{ padding: '12px 12px 12px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: b.error_count > 0 ? 'var(--coral)' : 'var(--text-dim)' }}>
                  {b.error_count > 0 ? b.error_count : '—'}
                </td>
                <td style={{ padding: '12px 0', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                  {new Date(b.uploaded_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
