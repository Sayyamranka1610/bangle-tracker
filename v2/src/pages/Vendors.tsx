import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { VendorOrder, VendorStatus, AppData, Order } from '../types';
import { vendorAlert, isVoDone, computeVendorStats, ALERT_CONFIG } from '../lib/vendorUtils';
import { reconcileReceivedStatus } from '../lib/receiveUtils';
import { buildAuditLog } from '../lib/auditUtils';
import VendorOrderCard from '../components/vendors/VendorOrderCard';
import VendorModal from '../components/vendors/VendorModal';

type StatusChip = '' | 'pending' | 'done';
type TypeTab = '' | 'pipe' | 'karigar' | 'plating';

const TYPE_TABS: { key: TypeTab; icon: string; label: string; color: string; bg: string }[] = [
  { key: '',        icon: '📋', label: 'All',     color: '#534AB7', bg: '#EEEDFE' },
  { key: 'pipe',    icon: '🔩', label: 'Pipe',    color: '#1565C0', bg: '#E3F2FD' },
  { key: 'karigar', icon: '🛠️', label: 'Karigar', color: '#4A148C', bg: '#F3E5F5' },
  { key: 'plating', icon: '🪙', label: 'Plating', color: '#BF360C', bg: '#FFF3E0' },
];

export default function Vendors() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;

  const vendorOrders: VendorOrder[] = useMemo(() => data.vendorOrders ?? [], [data.vendorOrders]);
  const canEdit = session?.role === 'owner' && hasLock;

  // Same controls as Phase 1: Pipe/Karigar/Plating tabs, All/Pending/Completed
  // chips, and an Active ⇄ Archived switch (archived orders never mix into the
  // live list or its counts).
  const [statusChip, setStatusChip]   = useState<StatusChip>('');
  const [typeTab, setTypeTab]         = useState<TypeTab>('');
  const [archMode, setArchMode]       = useState(false);
  // Jump-to-order-here from the Follow-ups list (?q=<vendor order ID>) —
  // reuses the existing search box rather than building separate scroll-to
  // infrastructure, since a vendor-order ID search already narrows to
  // exactly one card.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [modalOrder, setModalOrder]   = useState<VendorOrder | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<VendorOrder | null>(null);
  const [saving, setSaving]           = useState(false);
  const [collapsed, setCollapsed]     = useState<Set<string>>(new Set());

  const stats = useMemo(() => computeVendorStats(vendorOrders), [vendorOrders]);

  // Known vendors from vocabulary + existing orders
  const knownVendors = useMemo(() => {
    const fromVocab = data.vocabulary?.vendors ?? [];
    const fromOrders = vendorOrders.map(o => o.vendor).filter(Boolean);
    return [...new Set([...fromVocab, ...fromOrders])].sort();
  }, [data.vocabulary, vendorOrders]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { '': 0, pipe: 0, karigar: 0, plating: 0 };
    vendorOrders.filter(o => !o.archived).forEach(o => { c['']++; c[o.type ?? 'karigar']++; });
    return c;
  }, [vendorOrders]);
  const completedUnarchived = useMemo(
    () => vendorOrders.filter(o => !o.archived && isVoDone(o)).length, [vendorOrders]);

  const filtered = useMemo(() => {
    let list = vendorOrders.filter(o => archMode ? !!o.archived : !o.archived);
    if (typeTab && !archMode) list = list.filter(o => (o.type ?? 'karigar') === typeTab);
    if (statusChip === 'done') list = list.filter(o => isVoDone(o));
    else if (statusChip === 'pending') list = list.filter(o => !isVoDone(o));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.vendor.toLowerCase().includes(q) ||
        o.orderId.toLowerCase().includes(q) ||
        o.notes?.toLowerCase().includes(q) ||
        (o.designs ?? []).some(d => (d.code ?? '').toLowerCase().includes(q) || (d.name ?? '').toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  }, [vendorOrders, archMode, typeTab, statusChip, search]);

  // Group by vendor
  const grouped = useMemo(() => {
    const map = new Map<string, VendorOrder[]>();
    filtered.forEach(o => {
      const key = o.vendor || '(unknown)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // ── Persist helpers ───────────────────────────────────────────────────────────

  // Create/delete push immediately (Phase 1's fbPushNow — structural changes
  // can't wait behind the normal 2s debounce). Field edits use the default
  // debounce.
  async function persist(next: VendorOrder[], auditAction?: string, auditDetail?: string, immediate = true) {
    const patch: Partial<AppData> = { vendorOrders: next };
    if (auditAction && session?.username) {
      patch.auditLog = buildAuditLog(auditAction, auditDetail ?? '', session.username, data.auditLog ?? []);
    }
    setSaving(true);
    try {
      await saveAppData(patch, { immediate });
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(saved: VendorOrder) {
    const exists = vendorOrders.some(o => o.id === saved.id);
    const next = exists
      ? vendorOrders.map(o => o.id === saved.id ? saved : o)
      : [saved, ...vendorOrders];
    setModalOrder(undefined);
    showToast(exists ? 'Vendor order updated' : 'Vendor order created', 'success');
    await persist(next, exists ? 'Edit vendor order' : 'Create vendor order', `${saved.orderId} — ${saved.vendor}`);
  }

  async function handleStatusChange(order: VendorOrder, status: VendorStatus) {
    const next = vendorOrders.map(o => o.id === order.id ? { ...o, status } : o);
    await persist(next, 'Edit vendor order', `${order.orderId} status → ${status}`, false);
  }

  // A reason is required to put a row ON hold (never a blank click) but NOT
  // required to take it back off — clearing the text is how you resolve it.
  // Mirrors Phase 1's _holdPrompt()/toggleVOHold() exactly.
  function handleHoldToggle(order: VendorOrder, designId: string) {
    const d = order.designs?.find(x => x.id === designId);
    if (!d) return;
    const label = d.code || d.name || 'this design';
    let reason: string | null;
    let cleared = false;
    if (d.onHold) {
      reason = prompt(`Hold reason for ${label}:\n\n(clear the text and press OK to take it off hold)`, d.holdReason ?? '');
      if (reason === null) return;
      cleared = !reason.trim();
    } else {
      reason = prompt(`Why is "${label}" on hold?\n\n(e.g. waiting on gold rate, client changed mind, material shortage)`);
      if (reason === null || !reason.trim()) return;
    }
    const next = vendorOrders.map(o => o.id !== order.id ? o : {
      ...o,
      designs: o.designs?.map(x => x.id !== designId ? x : (
        cleared ? { ...x, onHold: false, holdReason: undefined } : { ...x, onHold: true, holdReason: (reason ?? '').trim() }
      )),
    });
    persist(next, 'Hold', `"${label}" in ${order.orderId} — ${cleared ? 'removed' : (d.onHold ? 'updated' : 'added')}${!cleared && reason ? `: ${reason.trim()}` : ''}`, false);
  }

  // Who-modal (link/unlink a customer on a pooled vendor-order row) touches
  // BOTH vendorOrders and orders at once — a customer's own row and the
  // vendor batch it's linked to must always agree on importedToVOId, so
  // they're saved together in one patch, never as two separate writes.
  async function handleWhoChange(patch: { vendorOrders: VendorOrder[]; orders?: Order[] }, auditDetail: string) {
    const full: Partial<AppData> = { vendorOrders: patch.vendorOrders };
    if (patch.orders) full.orders = patch.orders;
    if (session?.username) {
      full.auditLog = buildAuditLog('Edit vendor order', auditDetail, session.username, data.auditLog ?? []);
    }
    setSaving(true);
    try {
      await saveAppData(full, { immediate: true });
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Ports Phase 1's reconcileAllVendorCustomerStatus() (`7fe0b19`) — sweeps
  // every customer order for recvQty already recorded (e.g. from before
  // syncReceivedFlagsForAllocation existed, or receives already recorded
  // before that wiring landed) and catches up any pipeReceived/
  // karigarReceived/platingReceived flag that's still behind it. No
  // confirm() prompts needed (unlike Phase 1's ambiguous-batch case) — see
  // the comment above syncReceivedFlagsForAllocation in receiveUtils.ts.
  async function handleReconcile() {
    if (!canEdit) return;
    const { orders: nextOrders, updatedCount } = reconcileReceivedStatus(data);
    if (!updatedCount) {
      showToast('Already up to date — nothing to reconcile', 'success');
      return;
    }
    const patch: Partial<AppData> = { orders: nextOrders };
    if (session?.username) {
      patch.auditLog = buildAuditLog(
        'Reconcile status',
        `${updatedCount} customer row(s) caught up to match what's already been received`,
        session.username, data.auditLog ?? []);
    }
    setSaving(true);
    try {
      await saveAppData(patch, { immediate: true });
      showToast(`🔄 Reconciled — ${updatedCount} customer row(s) updated`, 'success');
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Archive = hide from the live list but keep for analytics (Phase 1
  // archiveVendorOrder / restoreVendorOrder / archiveAllCompletedVendorOrders).
  async function handleArchive(order: VendorOrder) {
    if (!isVoDone(order) && !confirm('This order is not completed yet. Do you still want to archive it?')) return;
    const next = vendorOrders.map(o => o.id === order.id ? { ...o, archived: true, archivedAt: Date.now() } : o);
    showToast(`📦 ${order.orderId} archived — still counted in analytics`, 'success');
    await persist(next, 'VendorOrder', `Archived vendor order ${order.orderId} (${order.vendor})`);
  }

  async function handleRestore(order: VendorOrder) {
    const next = vendorOrders.map(o => {
      if (o.id !== order.id) return o;
      const { archived: _a, archivedAt: _t, ...rest } = o;
      void _a; void _t;
      return rest as VendorOrder;
    });
    setArchMode(false);
    showToast(`↩ ${order.orderId} restored to active vendor orders`, 'success');
    await persist(next, 'VendorOrder', `Restored vendor order ${order.orderId} (${order.vendor}) from archive`);
  }

  async function handleArchiveCompleted() {
    const targets = vendorOrders.filter(o => !o.archived && isVoDone(o));
    if (!targets.length) { showToast('No completed vendor orders to archive.', 'info'); return; }
    if (!confirm(`Archive ${targets.length} completed vendor order${targets.length !== 1 ? 's' : ''}?

They'll be hidden from the active view but kept for analytics. You can restore any of them later from the Archived tab.`)) return;
    const now = Date.now();
    const ids = new Set(targets.map(t => t.id));
    const next = vendorOrders.map(o => ids.has(o.id) ? { ...o, archived: true, archivedAt: now } : o);
    showToast(`📦 ${targets.length} vendor order${targets.length !== 1 ? 's' : ''} archived`, 'success');
    await persist(next, 'VendorOrder', `Bulk-archived ${targets.length} completed vendor order(s)`);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const next = vendorOrders.filter(o => o.id !== deleteTarget.id);
    setDeleteTarget(null);
    showToast(`Deleted vendor order ${deleteTarget.orderId}`, 'info');
    await persist(next, 'Delete vendor order', `${deleteTarget.orderId} (${deleteTarget.vendor}) deleted`);
  }

  function toggleCollapse(vendor: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(vendor)) next.delete(vendor); else next.add(vendor);
      return next;
    });
  }

  // ── Stat cards ────────────────────────────────────────────────────────────────

  // Same four cards as Phase 1's vendor stats bar. "Total" counts only active
  // (non-archived) orders, so archived history never inflates the live numbers.
  const statCards = [
    { label: 'Total Orders', value: stats.total,    color: '#1a1916', border: 'border-black/10' },
    { label: 'Pending',      value: stats.pending,  color: '#A32D2D', border: 'border-red-500/30' },
    { label: 'Completed',    value: stats.done,     color: '#0F6E56', border: 'border-green-500/30' },
    { label: 'Archived',     value: stats.archived, color: '#6b6478', border: 'border-black/10' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1916]">Vendors</h1>
          <p className="text-sm text-[#1a1916]/55 mt-0.5">
            {filtered.length} {archMode ? 'archived ' : ''}order{filtered.length !== 1 ? 's' : ''} · {grouped.length} vendor{grouped.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-yellow-700 animate-pulse">Saving…</span>}
          {!hasLock && session?.role === 'owner' && (
            <span className="text-xs text-yellow-700 bg-yellow-500/10 px-3 py-1.5 rounded-lg">
              Edit lock not held — read only
            </span>
          )}
          {canEdit && (
            <button
              onClick={handleReconcile}
              title="Checks every customer order ↔ vendor order link for received-status mismatches and catches them up"
              className="flex items-center gap-2 bg-white hover:bg-black/[0.06] border border-[#534AB7]/40 text-[#534AB7] px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              🔄 Reconcile Status
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setModalOrder(null)}
              className="flex items-center gap-2 bg-[#534AB7] hover:bg-[#6259c8] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <span className="text-base">+</span> New Vendor Order
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {statCards.map(card => (
          <div key={card.label} className={`bg-white border rounded-xl p-4 ${card.border}`}>
            <p className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</p>
            <p className="text-xs text-[#1a1916]/60 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Pipe / Karigar / Plating tabs (active orders only) */}
      {!archMode && (
        <div className="flex gap-0.5 border-b-2 border-[#E0DFFF] mb-3 overflow-x-auto">
          {TYPE_TABS.map(tab => {
            const act = typeTab === tab.key;
            return (
              <button key={tab.key || 'all'} onClick={() => setTypeTab(tab.key)}
                className="flex items-center gap-1.5 px-4 py-2 text-[12.5px] whitespace-nowrap border-b-[2.5px] -mb-[2px] transition-colors"
                style={{ background: act ? tab.bg : 'transparent', color: act ? tab.color : '#777',
                  fontWeight: act ? 800 : 600, borderBottomColor: act ? tab.color : 'transparent' }}>
                {tab.icon} {tab.label}
                <span className="text-[10.5px] font-bold rounded-full px-2 py-px"
                  style={{ background: act ? '#fff' : '#EEEDFE', color: act ? tab.color : '#777' }}>{typeCounts[tab.key]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + status chips + Active/Archived */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search vendor, order ID, design code…"
          className="flex-1 min-w-[200px] bg-white border border-black/10 rounded-lg px-4 py-2.5 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
        />
        {([['', 'All'], ['pending', '🔴 Pending'], ['done', '✅ Completed']] as [StatusChip, string][]).map(([k, label]) => (
          <button key={k || 'all'} onClick={() => setStatusChip(k)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
              statusChip === k ? 'bg-[#534AB7] border-[#534AB7] text-white' : 'bg-white border-black/10 text-[#1a1916]/60 hover:text-[#1a1916]'}`}>
            {label}
          </button>
        ))}
        <div className="flex rounded-lg border border-black/10 overflow-hidden">
          <button onClick={() => { setArchMode(false); setStatusChip(''); }}
            className={`text-xs px-3 py-2 ${!archMode ? 'bg-[#534AB7] text-white' : 'bg-white text-[#1a1916]/60 hover:text-[#1a1916]'}`}>Active</button>
          <button onClick={() => { setArchMode(true); setStatusChip(''); setTypeTab(''); }}
            className={`text-xs px-3 py-2 ${archMode ? 'bg-[#6b6478] text-white' : 'bg-white text-[#1a1916]/60 hover:text-[#1a1916]'}`}>📦 Archived ({stats.archived})</button>
        </div>
        {!archMode && canEdit && (
          <button onClick={handleArchiveCompleted} disabled={!completedUnarchived}
            className="text-xs px-3 py-2 rounded-lg border border-black/10 bg-white text-[#1a1916]/70 hover:bg-black/[0.06] disabled:opacity-40 disabled:cursor-not-allowed">
            📦 Archive completed ({completedUnarchived})
          </button>
        )}
      </div>

      {/* Vendor groups */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#1a1916]/40">
          {vendorOrders.length === 0
            ? canEdit ? 'No vendor orders yet — click "New Vendor Order" to create one.' : 'No vendor orders yet.'
            : archMode && !search.trim() ? 'No archived vendor orders.' : 'No vendor orders match your filter.'}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([vendorName, orders]) => {
            const isCollapsed = collapsed.has(vendorName);
            const lateCount = orders.filter(o => vendorAlert(o) === 'late').length;

            return (
              <div key={vendorName} className="border border-black/10 rounded-xl overflow-hidden">
                {/* Vendor section header */}
                <button
                  onClick={() => toggleCollapse(vendorName)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-black/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[#1a1916] font-semibold">🏭 {vendorName}</span>
                    <span className="text-xs text-[#1a1916]/55">
                      {orders.length} order{orders.length !== 1 ? 's' : ''}
                    </span>
                    {lateCount > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ALERT_CONFIG.late.color} ${ALERT_CONFIG.late.bg}`}>
                        {lateCount} overdue
                      </span>
                    )}
                  </div>
                  <span className={`text-[#1a1916]/40 text-xs transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                </button>

                {/* Order cards grid */}
                {!isCollapsed && (
                  <div className="p-4 bg-black/10 grid gap-3 sm:grid-cols-2">
                    {orders.map(order => (
                      <VendorOrderCard
                        key={order.id}
                        order={order}
                        data={data}
                        canEdit={canEdit}
                        onEdit={o => setModalOrder(o)}
                        onDelete={o => setDeleteTarget(o)}
                        onArchive={handleArchive}
                        onRestore={handleRestore}
                        onStatusChange={handleStatusChange}
                        onWhoChange={handleWhoChange}
                        onHoldToggle={handleHoldToggle}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {modalOrder !== undefined && (
        <VendorModal
          order={modalOrder}
          allOrders={vendorOrders}
          vendors={knownVendors}
          onSave={handleSave}
          onClose={() => setModalOrder(undefined)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div className="bg-white border border-black/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-[#1a1916] font-semibold mb-1">Delete vendor order?</h3>
            <p className="text-sm text-[#1a1916]/60 mb-5">
              This will permanently delete <span className="text-[#1a1916]">{deleteTarget.orderId}</span> from{' '}
              <span className="text-[#1a1916]">{deleteTarget.vendor}</span>.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-black/10 text-[#1a1916]/70 hover:text-[#1a1916] text-sm transition-colors"
              >Cancel</button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors"
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
