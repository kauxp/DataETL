import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, ClipboardCheck, Upload, FolderOpen, LogOut, Leaf } from 'lucide-react'

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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 min-w-56 flex flex-col bg-white border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center">
            <Leaf size={14} className="text-white" strokeWidth={2} />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Breathe ESG</div>
            <div className="text-[10px] text-muted-foreground">Carbon Intelligence</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} strokeWidth={isActive ? 2 : 1.75} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-border">
          <div className="px-3 py-1.5 mb-1">
            <div className="text-sm font-medium text-gray-900">{user?.first_name || user?.username}</div>
            <div className="text-xs text-muted-foreground capitalize">{user?.role || 'analyst'}</div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <LogOut size={14} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
