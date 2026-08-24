import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { Order, AppData } from '../types';
import { computeStats, renumberOrders } from '../lib/orderUtils';
import { orderStatus } from '../lib/coStageUtils';
import { buildAuditLog } from '../lib/auditUtils';
import { rebuildVocab } from '../lib/vocabUtils';
import { uid } from '../lib/orderUtils';
import StatCards from '../components/orders/StatCards';
import OrderCard from '../components/orders/OrderCard';
import OrderModal from '../components/orders/OrderModal';

export default function Orders() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;

  const allOrders: Order[] = useMemo(() => data.orders ?? [], [data.orders]);
  const vendorOrders = data.vendorOrders ?? [];
  const canEdit = session?.role === 'owner' && hasLock;

  const [viewMode, setViewMode]       = useState<'active' | 'archived'>('active');
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'done'>('');
  const [search, setSearch]           = useState('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [modalOrder, setModalOrder]   = useState<Order | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [saving, setSaving]           = useState(false);

  // ── Jump-to-order from Analytics turnaround drilldown (?focus=<orderId>) ─────
  // Mirrors Phase 1's goToOrderFromAnalytics: switch to the right view/client,
  // then auto-expand and scroll to that specific order card.
  const [searchParams] = useSearchParams();
  const [focusOrderId] = useState<string | null>(() => searchParams.get('focus'));
  const [focusApplied, setFocusApplied] = useState(false);

  const stats  = useMemo(() => computeStats(allOrders), [allOrders]);
  const clients = useMemo(() => data.vocabulary?.clients ?? [], [data.vocabulary]);
  const dnames  = useMemo(() => data.vocabulary?.dnames  ?? [], [data.vocabulary]);
  const dcodes  = useMemo(() => data.vocabulary?.dcodes  ?? [], [data.vocabulary]);
  // Cohort tags already in use anywhere, for the new-order tag suggestions
  const knownTags = useMemo(
    () => [...new Set((data.orders ?? []).flatMap(o => o.tags ?? []))].sort(),
    [data.orders],
  );

  // ── Client sidebar (active, non-archived orders only) — mirrors Phase 1 ──────
  const clientMap = useMemo(() => {
    const map = new Map<string, { orders: Order[]; done: number; pending: number }>();
    allOrders.forEach(o => {
      if (o.archived) return;
      if (!map.has(o.client)) map.set(o.client, { orders: [], done: 0, pending: 0 });
      const cd = map.get(o.client)!;
      cd.orders.push(o);
      if (orderStatus(o) === 'done') cd.done++; else cd.pending++;
    });
    return map;
  }, [allOrders]);
  const clientNames = useMemo(() => [...clientMap.keys()].sort(), [clientMap]);

  const effectiveClient = clientMap.has(selectedClient) ? selectedClient : (clientNames[0] ?? '');

  // Apply the focus target once its order is available: route to the Archived
  // tab if that order was archived (otherwise it wouldn't appear in the
  // default Active list and the scroll-to would fail silently). Adjusted
  // directly during render (React's recommended pattern for deriving state
  // from a prop/param change) rather than in an effect, since it's a one-time
  // reaction to data becoming available, not a subscription to an external system.
  if (focusOrderId && !focusApplied) {
    const order = allOrders.find(o => o.id === focusOrderId);
    if (order) {
      setFocusApplied(true);
      setViewMode(order.archived ? 'archived' : 'active');
      if (!order.archived) setSelectedClient(order.client);
      setSearch('');
      setStatusFilter('');
    }
  }

  useEffect(() => {
    if (!focusOrderId || !focusApplied) return;
    const t = setTimeout(() => {
      document.getElementById(`oc-${focusOrderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => clearTimeout(t);
  }, [focusOrderId, focusApplied, viewMode, effectiveClient]);

  const q = search.trim().toLowerCase();
  const isGlobalSearch = q.length > 0;
  const archivedCount = allOrders.filter(o => o.archived).length;
  const completedUnarchivedCount = allOrders.filter(o => !o.archived && orderStatus(o) === 'done').length;

  // ── Which orders are visible right now ────────────────────────────────────────
  const { visibleOrders, sectionTitle, sectionMeta } = useMemo(() => {
    let list: Order[];
    let title: string;
    let meta: string;
    if (viewMode === 'archived') {
      list = allOrders.filter(o => o.archived);
      if (q) list = list.filter(o => matchesSearch(o, q));
      title = '📦 Archived orders';
      meta = `${list.length} order${list.length !== 1 ? 's' : ''} · hidden from active view, still counted in analytics`;
    } else if (isGlobalSearch) {
      list = allOrders.filter(o => !o.archived && matchesSearch(o, q));
      if (statusFilter) list = list.filter(o => orderStatus(o) === statusFilter);
      title = `🔍 Results for "${search}"`;
      meta = `${list.length} order${list.length !== 1 ? 's' : ''} across all clients`;
    } else {
      const cd = clientMap.get(effectiveClient) ?? { orders: [], done: 0, pending: 0 };
      list = [...cd.orders];
      if (statusFilter) list = list.filter(o => orderStatus(o) === statusFilter);
      title = effectiveClient ? `👤 ${effectiveClient}` : '';
      meta = `${cd.orders.length} order${cd.orders.length !== 1 ? 's' : ''} · ${cd.pending} pending · ${cd.done} completed`;
    }
    return { visibleOrders: [...list].sort((a, b) => a.startDate < b.startDate ? -1 : 1), sectionTitle: title, sectionMeta: meta };
  }, [viewMode, allOrders, q, isGlobalSearch, statusFilter, clientMap, effectiveClient, search]);

  // ── Persist helpers ──────────────────────────────────────────────────────────
  // Structural changes (create/delete/archive) push immediately, like Phase 1's
  // fbPushNow() — they can't wait behind the normal 2s debounce.
  async function persistOrders(next: Order[], auditAction?: string, auditDetail?: string, immediate = true) {
    const numbered = renumberOrders(next);
    const patch: Partial<AppData> = {
      orders: numbered,
      vocabulary: rebuildVocab(numbered, data.vocabularyManual ?? {}),
    };
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

  // ── Order-level CRUD ─────────────────────────────────────────────────────────
  async function handleSave(saved: Order) {
    const exists = allOrders.some(o => o.id === saved.id);
    const next = exists ? allOrders.map(o => o.id === saved.id ? saved : o) : [saved, ...allOrders];
    setModalOrder(undefined);
    showToast(exists ? 'Order updated' : 'Order created', 'success');
    const action = exists ? 'Edit order' : 'Create order';
    const detail = exists
      ? `Order ${saved.orderId} updated`
      : `New order for ${saved.client} (${saved.bangleType}) with ${saved.designs.length} design(s)`;
    if (!exists) setSelectedClient(saved.client);
    await persistOrders(next, action, detail);
  }

  // ── Inline order update (from expanded card — details/designs/vendor tabs) ───
  async function handleUpdate(updated: Order) {
    const prev = allOrders.find(o => o.id === updated.id);
    const next = allOrders.map(o => o.id === updated.id ? updated : o);

    const patch: Partial<AppData> = {
      orders: renumberOrders(next),
      vocabulary: rebuildVocab(next, data.vocabularyManual ?? {}),
    };
    if (session?.username) {
      let auditDetail = `Order ${updated.orderId}`;
      if (prev && prev.client !== updated.client) auditDetail += `: client changed`;
      else if (prev && JSON.stringify(prev.designs) !== JSON.stringify(updated.designs)) auditDetail += `: designs/stages updated`;
      patch.auditLog = buildAuditLog('Edit order', auditDetail, session.username, data.auditLog ?? []);
    }

    setSaving(true);
    try {
      // Inline field edits can debounce (2s) like Phase 1's fbSchedulePush.
      await saveAppData(patch);
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const next = allOrders.filter(o => o.id !== deleteTarget.id);
    const detail = `Order ${deleteTarget.orderId} (${deleteTarget.client}) deleted`;
    setDeleteTarget(null);
    showToast(`Deleted ${deleteTarget.orderId}`, 'info');
    await persistOrders(next, 'Delete order', detail);
  }

  // ── Archive / Restore / Duplicate (mirrors Phase 1 exactly) ──────────────────
  async function handleArchive(order: Order) {
    if (orderStatus(order) !== 'done' && !confirm('This order is not completed yet. Do you still want to archive it?')) return;
    const next = allOrders.map(o => o.id === order.id ? { ...o, archived: true, archivedAt: Date.now() } : o);
    showToast(`📦 ${order.orderId} archived — still counted in analytics`, 'success');
    await persistOrders(next, 'Archive order', `Order ${order.orderId} (${order.client}) archived`);
  }

  async function handleRestore(order: Order) {
    const next = allOrders.map(o => o.id === order.id ? { ...o, archived: false, archivedAt: undefined } : o);
    setViewMode('active');
    showToast(`↩ ${order.orderId} restored to active orders`, 'success');
    await persistOrders(next, 'Restore order', `Order ${order.orderId} (${order.client}) restored from archive`);
  }

  async function handleArchiveAllCompleted() {
    const targets = allOrders.filter(o => !o.archived && orderStatus(o) === 'done');
    if (!targets.length) { showToast('No completed orders to archive.', 'info'); return; }
    if (!confirm(`Archive ${targets.length} completed order${targets.length !== 1 ? 's' : ''}?\n\nThey'll be hidden from the active view but kept for analytics. You can restore any of them later from the Archived tab.`)) return;
    const now = Date.now();
    const targetIds = new Set(targets.map(o => o.id));
    const next = allOrders.map(o => targetIds.has(o.id) ? { ...o, archived: true, archivedAt: now } : o);
    showToast(`📦 ${targets.length} order${targets.length !== 1 ? 's' : ''} archived`, 'success');
    await persistOrders(next, 'Archive order', `Bulk-archived ${targets.length} completed order(s)`);
  }

  async function handleDuplicate(order: Order) {
    const copy: Order = {
      ...JSON.parse(JSON.stringify(order)),
      id: uid(),
      orderId: '',
      createdAt: new Date().toISOString(),
      archived: false,
      archivedAt: undefined,
    };
    const next = [copy, ...allOrders];
    showToast(`Duplicated as new order for ${copy.client}`, 'success');
    await persistOrders(next, 'Create order', `Order duplicated from ${order.orderId} for ${copy.client}`);
  }

  function selectClient(name: string) {
    setSelectedClient(name);
    setSearch('');
    setStatusFilter('');
    setViewMode('active');
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Orders</h1>
          <p className="text-sm text-white/40 mt-0.5">{stats.total} active order{stats.total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-yellow-300 animate-pulse">Saving…</span>}
          {!hasLock && session?.role === 'owner' && (
            <span className="text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-lg">Edit lock not held</span>
          )}
          {!canEdit && session?.role !== 'owner' && (
            <span className="text-xs text-white/30 bg-white/5 px-3 py-1.5 rounded-lg">Read-only</span>
          )}
          {canEdit && (
            <button onClick={() => setModalOrder(null)}
              className="flex items-center gap-2 bg-[#534AB7] hover:bg-[#6259c8] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <span className="text-base">+</span> New Order
            </button>
          )}
        </div>
      </div>

      <StatCards stats={stats} activeFilter={viewMode === 'archived' ? 'archived' : (statusFilter || 'all')}
        onFilter={f => {
          if (f === 'archived') { setViewMode('archived'); return; }
          setViewMode('active');
          setStatusFilter(f === 'all' ? '' : (f as 'pending' | 'done'));
        }} />

      {allOrders.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          {canEdit ? 'No orders yet — click "New Order" to create one.' : 'No orders yet.'}
        </div>
      ) : (
        <div className="flex gap-5">
          {/* ── Client sidebar ── */}
          <div className="w-56 shrink-0 border border-white/10 rounded-xl overflow-hidden self-start">
            <div className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider bg-white/5 border-b border-white/10">
              Clients ({clientNames.length})
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {clientNames.map(name => {
                const cd = clientMap.get(name)!;
                const active = !isGlobalSearch && viewMode === 'active' && name === effectiveClient;
                return (
                  <button key={name} onClick={() => selectClient(name)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-white/5 transition-colors ${
                      active ? 'bg-[#534AB7]/20 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}>
                    <span className="truncate">👤 {name}</span>
                    <span className="flex items-center gap-1 text-[10px] shrink-0">
                      {cd.done > 0 && <span className="text-green-400 font-semibold">{cd.done}●</span>}
                      {cd.pending > 0 && <span className="text-red-400 font-semibold">{cd.pending}●</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Main panel ── */}
          <div className="flex-1 min-w-0">
            {/* Top bar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search client, order ID, design code…"
                className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm" />
              <button onClick={() => setStatusFilter('')}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${!statusFilter ? 'bg-[#534AB7] text-white' : 'bg-white/5 text-white/50 hover:text-white'}`}>All</button>
              <button onClick={() => setStatusFilter('pending')}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${statusFilter === 'pending' ? 'bg-[#534AB7] text-white' : 'bg-white/5 text-white/50 hover:text-white'}`}>🔴 Pending</button>
              <button onClick={() => setStatusFilter('done')}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${statusFilter === 'done' ? 'bg-[#534AB7] text-white' : 'bg-white/5 text-white/50 hover:text-white'}`}>✅ Completed</button>
              <div className="flex items-center gap-1 ml-auto bg-white/5 rounded-lg p-0.5">
                <button onClick={() => setViewMode('active')}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors ${viewMode === 'active' ? 'bg-[#534AB7] text-white' : 'text-white/50 hover:text-white'}`}>Active</button>
                <button onClick={() => setViewMode('archived')}
                  className={`text-xs px-3 py-1.5 rounded-md transition-colors ${viewMode === 'archived' ? 'bg-[#534AB7] text-white' : 'text-white/50 hover:text-white'}`}>📦 Archived ({archivedCount})</button>
              </div>
              {viewMode === 'active' && canEdit && (
                <button onClick={handleArchiveAllCompleted} disabled={!completedUnarchivedCount}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  📦 Archive completed ({completedUnarchivedCount})
                </button>
              )}
            </div>

            {/* Section header */}
            {sectionTitle && (
              <div className="mb-3">
                <p className="text-white font-semibold">{sectionTitle}</p>
                <p className="text-xs text-white/40">{sectionMeta}</p>
              </div>
            )}

            {/* Cards */}
            {visibleOrders.length === 0 ? (
              <div className="text-center py-16 text-white/30">
                {viewMode === 'archived' ? 'No archived orders.' : q ? `No orders found for "${search}"` : 'No orders for this client'}
              </div>
            ) : (
              <div className="space-y-2">
                {visibleOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    canEdit={canEdit}
                    dnames={dnames}
                    dcodes={dcodes}
                    vendorOrders={vendorOrders}
                    archivedView={viewMode === 'archived'}
                    autoExpand={order.id === focusOrderId}
                    onUpdate={handleUpdate}
                    onEdit={o => setModalOrder(o)}
                    onDelete={o => setDeleteTarget(o)}
                    onArchive={handleArchive}
                    onRestore={handleRestore}
                    onDuplicate={handleDuplicate}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {modalOrder !== undefined && (
        <OrderModal
          order={modalOrder}
          clients={clients}
          dnames={dnames}
          dcodes={dcodes}
          knownTags={knownTags}
          onSave={handleSave}
          onClose={() => setModalOrder(undefined)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="bg-[#1a1750] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold mb-1">Delete order?</h3>
            <p className="text-sm text-white/50 mb-5">
              This will permanently delete <span className="text-white">{deleteTarget.orderId}</span> for{' '}
              <span className="text-white">{deleteTarget.client}</span> and all its designs and stage data.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={handleDelete}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function matchesSearch(o: Order, q: string): boolean {
  return (
    o.orderId.toLowerCase().includes(q) ||
    o.client.toLowerCase().includes(q) ||
    (o.notes ?? '').toLowerCase().includes(q) ||
    o.designs.some(d => (d.code ?? '').toLowerCase().includes(q) || d.name.toLowerCase().includes(q))
  );
}

