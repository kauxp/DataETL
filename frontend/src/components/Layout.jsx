import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, ClipboardCheck, Upload, FolderOpen, LogOut } from 'lucide-react'

const nav = [
  { to: '/',        label: 'Dashboard',    icon: LayoutDashboard, exact: true },
  { to: '/review',  label: 'Review Queue', icon: ClipboardCheck },
  { to: '/ingest',  label: 'Ingest Data',  icon: Upload },
  { to: '/batches', label: 'Batches',      icon: FolderOpen },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        minWidth: 220,
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{
          padding: '24px 20px 22px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{ position: 'relative', width: 28, height: 28 }}>
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              background: 'var(--teal)',
              opacity: 0.15,
              animation: 'breathe 3.5s ease-in-out infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 4,
              borderRadius: '50%',
              background: 'var(--teal)',
            }} />
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-head)',
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--text-hi)',
              letterSpacing: '0.01em',
            }}>Breathe ESG</div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-dim)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginTop: 1,
            }}>Carbon Intelligence</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {nav.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 6,
                textDecoration: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? 'var(--teal)' : 'var(--text)',
                background: isActive ? 'var(--teal-dim)' : 'transparent',
                borderLeft: `2px solid ${isActive ? 'var(--teal)' : 'transparent'}`,
                transition: 'all 0.15s ease',
              })}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 12px', marginBottom: 4 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: 'var(--text-hi)' }}>
              {user?.first_name || user?.username}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'capitalize', marginTop: 2 }}>
              {user?.role || 'analyst'}
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-raised)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'transparent' }}
          >
            <LogOut size={14} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  )
}
