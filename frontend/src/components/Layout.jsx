import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, ClipboardCheck, Upload, FolderOpen, LogOut, Leaf, Menu, X } from 'lucide-react'

const nav = [
  { to: '/',        label: 'Dashboard',    icon: LayoutDashboard, exact: true },
  { to: '/review',  label: 'Review Queue', icon: ClipboardCheck },
  { to: '/ingest',  label: 'Ingest Data',  icon: Upload },
  { to: '/batches', label: 'Batches',      icon: FolderOpen },
]

function SidebarContents({ user, onNavigate, onSignOut }) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center">
          <Leaf size={14} className="text-white" strokeWidth={2} />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">Breathe ESG</div>
          <div className="text-[10px] text-muted-foreground">Carbon Intelligence</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={onNavigate}
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

      <div className="p-3 border-t border-border">
        <div className="px-3 py-1.5 mb-1">
          <div className="text-sm font-medium text-gray-900">{user?.first_name || user?.username}</div>
          <div className="text-xs text-muted-foreground capitalize">{user?.role || 'analyst'}</div>
        </div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <LogOut size={14} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function handleSignOut() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 min-w-56 flex-col bg-white border-r border-border">
        <SidebarContents user={user} onNavigate={() => {}} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative z-50 w-64 h-full flex flex-col bg-white border-r border-border shadow-lg">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            >
              <X size={18} />
            </button>
            <SidebarContents user={user} onNavigate={() => setOpen(false)} onSignOut={handleSignOut} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-border shrink-0">
          <button onClick={() => setOpen(true)} className="text-gray-600 hover:text-gray-900">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center">
              <Leaf size={12} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900">Breathe ESG</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
