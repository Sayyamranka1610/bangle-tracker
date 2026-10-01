import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { computeFollowUps } from '../lib/followUpUtils';
import ToastContainer from './ToastContainer';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/orders',    label: 'Orders',    icon: '📋' },
  { to: '/designs',   label: 'Designs',   icon: '🎨' },
  { to: '/vendors',   label: 'Vendors',   icon: '🏭' },
  { to: '/masters',   label: 'Masters',   icon: '📋' },
  { to: '/assign',    label: 'Assign',    icon: '↔️' },
  { to: '/pooling',   label: 'Pooling',   icon: '🧲' },
  { to: '/karigar-history', label: 'Karigar History', icon: '💡' },
  { to: '/followups', label: 'Kya Bola?', icon: '💬' },
  { to: '/library',   label: 'Library',   icon: '🖼️' },
  { to: '/analytics', label: 'Analytics', icon: '📊' },
  { to: '/audit',     label: 'Audit',     icon: '🔍' },
  { to: '/users',     label: 'Users',     icon: '👤' },
];

export default function Layout() {
  const { state, logout } = useApp();
  const { session, syncStatus, data } = state;
  const location = useLocation();

  const followUpCount = useMemo(() => computeFollowUps(data).items.length, [data]);

  const isReadOnly = session && session.role !== 'owner';

  // Mobile sidebar: the full desktop nav (icons + labels + sign-out footer)
  // used to render at a fixed width regardless of viewport, which on a real
  // phone (≤768px) squeezed every page's content into a sliver and made
  // stat cards overlap each other — confirmed in-browser at 375px. Below
  // `md`, the sidebar is now off-canvas by default, opened with a hamburger
  // button, and auto-closes on navigation (so tapping a nav link doesn't
  // leave the menu covering the page it just opened).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Reset-on-navigation, done during render (not an effect) — React's own
  // documented pattern for "adjust state when something changes" (state,
  // not a ref, so it stays compatible with the React Compiler's stricter
  // rules here) — avoids an extra render-effect-render round trip for
  // something this simple.
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    if (mobileNavOpen) setMobileNavOpen(false);
  }

  return (
    <div className="flex h-screen bg-[#0f0e1a] text-white overflow-hidden">
      {isReadOnly && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600/90 text-white text-xs text-center py-1 font-medium">
          READ-ONLY MODE — You can view everything but cannot make changes
        </div>
      )}

      {/* Mobile top bar — hamburger only, hidden at md+ where the sidebar is always visible */}
      <div className={`md:hidden fixed left-0 right-0 z-40 flex items-center gap-3 bg-[#1a1750] border-b border-white/10 px-3 py-2.5 ${isReadOnly ? 'top-6' : 'top-0'}`}>
        <button
          onClick={() => setMobileNavOpen(v => !v)}
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          className="text-white/80 hover:text-white text-xl leading-none p-1 -ml-1"
        >
          {mobileNavOpen ? '✕' : '☰'}
        </button>
        <span className="font-bold text-sm text-[#a89fff]">Bangle Tracker</span>
        {followUpCount > 0 && (
          <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {followUpCount}
          </span>
        )}
      </div>

      {/* Backdrop — mobile only, closes the menu on tap outside it */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Sidebar — static in the flex layout at md+; off-canvas drawer below it */}
      <aside className={`w-64 md:w-56 flex-shrink-0 bg-[#1a1750] flex flex-col fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200 ${
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
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

        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
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
                {item.to === '/followups' && followUpCount > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {followUpCount}
                  </span>
                )}
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

      {/* Main content — top padding clears the fixed mobile hamburger bar
          (and the fixed read-only banner above it, when both are present);
          neither is fixed/overlapping at md+, so no padding is needed there. */}
      <main className={`flex-1 overflow-auto ${isReadOnly ? 'pt-[68px] md:pt-6' : 'pt-11 md:pt-0'}`}>
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  );
}
