import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { AuditEntry } from '../types';

// ─── Action colour coding ─────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  'Create order':   { bg: 'bg-green-500/15',  text: 'text-green-400' },
  'Delete order':   { bg: 'bg-red-500/15',    text: 'text-red-400' },
  'Edit order':     { bg: 'bg-blue-500/15',   text: 'text-blue-400' },
  'Add design':     { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  'Remove design':  { bg: 'bg-red-500/15',    text: 'text-red-400' },
  'Edit design':    { bg: 'bg-blue-500/15',   text: 'text-blue-400' },
  'Stage status':   { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  'Stage days':     { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  'Stage date':     { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  'Add variety':    { bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
  'Remove variety': { bg: 'bg-red-500/15',    text: 'text-red-400' },
  'Add size':       { bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
  'Upload image':   { bg: 'bg-teal-500/15',   text: 'text-teal-400' },
  'Backup':         { bg: 'bg-white/10',       text: 'text-white/60' },
  'Restore':        { bg: 'bg-orange-500/15', text: 'text-orange-400' },
  'Add stage':      { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  'Archive order':  { bg: 'bg-white/10',       text: 'text-white/60' },
  'Restore order':  { bg: 'bg-orange-500/15', text: 'text-orange-400' },
};

function actionStyle(action: string) {
  return ACTION_COLORS[action] ?? { bg: 'bg-white/5', text: 'text-white/50' };
}

// Broad category for grouping the filter dropdown
function actionCategory(action: string): string {
  if (action.includes('order')) return 'Orders';
  if (action.includes('design') || action.includes('variety') || action.includes('size') || action.includes('image')) return 'Designs';
  if (action.startsWith('Stage')) return 'Stages';
  if (action === 'Backup' || action === 'Restore') return 'Data';
  return 'Other';
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ts.slice(0, 10); }
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ts.slice(11, 16); }
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Audit() {
  const { state } = useApp();
  const entries: AuditEntry[] = useMemo(
    () => state.data.auditLog ?? [],
    [state.data.auditLog],
  );

  const [search, setSearch]         = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [page, setPage]             = useState(1);
  const PAGE_SIZE = 50;

  // Unique users + actions for filter dropdowns
  const uniqueUsers   = useMemo(() => [...new Set(entries.map(e => e.user).filter(Boolean))].sort() as string[], [entries]);
  const uniqueActions = useMemo(() => [...new Set(entries.map(e => e.action))].sort(), [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (userFilter   && e.user   !== userFilter)   return false;
      if (actionFilter && e.action !== actionFilter) return false;
      if (dateFrom && e.ts.slice(0, 10) < dateFrom)  return false;
      if (dateTo   && e.ts.slice(0, 10) > dateTo)    return false;
      if (q) {
        const haystack = `${e.action} ${e.detail ?? ''} ${e.user ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, userFilter, actionFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageEntries = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Group current page by date
  const grouped = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    pageEntries.forEach(e => {
      const day = e.ts.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    });
    return [...map.entries()];
  }, [pageEntries]);

  function resetFilters() {
    setSearch(''); setUserFilter(''); setActionFilter('');
    setDateFrom(''); setDateTo(''); setPage(1);
  }

  function exportCSV() {
    const rows = [['Date', 'Time', 'Action', 'User', 'Details']];
    filtered.forEach(e => {
      rows.push([fmtDate(e.ts), fmtTime(e.ts), e.action, e.user ?? '—', (e.detail ?? '').replace(/,/g, ';')]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit_trail_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters = search || userFilter || actionFilter || dateFrom || dateTo;

  // Quick date presets
  function applyPreset(label: string) {
    setPage(1);
    if (label === 'today')   { setDateFrom(todayStr());      setDateTo(todayStr()); }
    if (label === '7d')      { setDateFrom(daysAgoStr(7));   setDateTo(todayStr()); }
    if (label === '30d')     { setDateFrom(daysAgoStr(30));  setDateTo(todayStr()); }
    if (label === 'all')     { setDateFrom('');              setDateTo(''); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Trail</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {entries.length} entries · showing {filtered.length}
            {filtered.length !== entries.length ? ' (filtered)' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {hasFilters && (
            <button onClick={resetFilters}
              className="text-xs text-white/50 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors">
              Clear filters
            </button>
          )}
          {filtered.length > 0 && (
            <button onClick={exportCSV}
              className="text-xs text-white/50 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors">
              📥 Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-5 space-y-3">
        {/* Search */}
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search actions, details, users…"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* User filter */}
          <select
            value={userFilter}
            onChange={e => { setUserFilter(e.target.value); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#534AB7]"
          >
            <option value="">All users</option>
            {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#534AB7]"
          >
            <option value="">All actions</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{a} ({actionCategory(a)})</option>
            ))}
          </select>

          {/* Date from */}
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#534AB7] [color-scheme:dark]"
            placeholder="From"
          />

          {/* Date to */}
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#534AB7] [color-scheme:dark]"
            placeholder="To"
          />
        </div>

        {/* Quick presets */}
        <div className="flex gap-2">
          {[
            { label: 'today', display: 'Today' },
            { label: '7d',    display: 'Last 7 days' },
            { label: '30d',   display: 'Last 30 days' },
            { label: 'all',   display: 'All time' },
          ].map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.label)}
              className="text-xs px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors border border-white/10"
            >
              {p.display}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-white/30">
          {entries.length === 0
            ? 'No audit entries yet. Changes made in the app will appear here.'
            : 'No entries match your filters.'}
        </div>
      )}

      {/* Log grouped by date */}
      <div className="space-y-5">
        {grouped.map(([day, dayEntries]) => (
          <div key={day}>
            {/* Day separator */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-semibold text-white/50">{fmtDate(day)}</span>
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-white/30">{dayEntries.length} event{dayEntries.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Entries for this day */}
            <div className="space-y-1">
              {dayEntries.map(e => {
                const { bg, text } = actionStyle(e.action);
                return (
                  <div
                    key={e.id}
                    className="flex items-start gap-3 px-4 py-2.5 rounded-lg bg-white/3 hover:bg-white/5 transition-colors"
                  >
                    {/* Time */}
                    <span className="text-xs text-white/30 w-16 flex-shrink-0 pt-0.5 font-mono">
                      {fmtTime(e.ts)}
                    </span>

                    {/* Action badge */}
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex-shrink-0 ${bg} ${text}`}>
                      {e.action}
                    </span>

                    {/* User */}
                    <span className="text-xs bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-white/50 flex-shrink-0">
                      {e.user || '—'}
                    </span>

                    {/* Detail */}
                    <span className="text-xs text-white/60 min-w-0 break-words">
                      {e.detail || '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
          <span className="text-xs text-white/40">
            Page {page} of {totalPages} · {filtered.length} entries
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
