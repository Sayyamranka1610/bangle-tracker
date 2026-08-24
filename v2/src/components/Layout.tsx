import { NavLink, Outlet } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import ToastContainer from './ToastContainer';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/orders',    label: 'Orders',    icon: '📋' },
  { to: '/designs',   label: 'Designs',   icon: '🎨' },
  { to: '/vendors',   label: 'Vendors',   icon: '🏭' },
  { to: '/masters',   label: 'Masters',   icon: '📋' },
  { to: '/assign',    label: 'Assign',    icon: '↔️' },
  { to: '/pooling',   label: 'Pooling',   icon: '🧲' },
  { to: '/library',   label: 'Library',   icon: '🖼️' },
  { to: '/analytics', label: 'Analytics', icon: '📊' },
  { to: '/audit',     label: 'Audit',     icon: '🔍' },
  { to: '/users',     label: 'Users',     icon: '👤' },
];

export default function Layout() {
  const { state, logout } = useApp();
  const { session, syncStatus } = state;

  const isReadOnly = session && session.role !== 'owner';

  return (
    <div className="flex h-screen bg-[#0f0e1a] text-white">
      {isReadOnly && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600/90 text-white text-xs text-center py-1 font-medium">
          READ-ONLY MODE — You can view everything but cannot make changes
        </div>
      )}
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#1a1750] flex flex-col">
        <div className="px-4 py-5 border-b border-white/10">
          <p className="text-xs text-white/50 uppercase tracking-wider">Siddhi Bangles</p>
          <h1 className="font-bold text-lg text-[#a89fff]">Bangle Tracker</h1>
          {syncStatus === 'error' && (
            <span className="text-xs text-red-400">⚠ Offline</span>
          )}
          {syncStatus === 'syncing' && (
            <span className="text-xs text-yellow-300 animate-pulse">⟳ Syncing…</span>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(item => {
            if (item.to === '/users' && session?.role !== 'owner') return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-[#534AB7] text-white font-medium'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-xs text-white/50 mb-1 truncate">{session?.username}</p>
          <p className="text-xs text-[#a89fff] mb-3 capitalize">{session?.role}</p>
          <button
            onClick={logout}
            className="w-full text-xs text-white/50 hover:text-white py-1 rounded hover:bg-white/5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 overflow-auto ${isReadOnly ? 'pt-6' : ''}`}>
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  );
}
