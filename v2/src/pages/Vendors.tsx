import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import type { VendorOrder, VendorStatus, AppData } from '../types';
import { vendorAlert, computeVendorStats, ALERT_CONFIG } from '../lib/vendorUtils';
import { buildAuditLog } from '../lib/auditUtils';
import VendorOrderCard from '../components/vendors/VendorOrderCard';
import VendorModal from '../components/vendors/VendorModal';

type FilterKey = 'all' | 'ok' | 'warn' | 'late' | 'done';

export default function Vendors() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;

  const vendorOrders: VendorOrder[] = useMemo(() => data.vendorOrders ?? [], [data.vendorOrders]);
  const canEdit = session?.role === 'owner' && hasLock;

  const [filter, setFilter]           = useState<FilterKey>('all');
  const [search, setSearch]           = useState('');
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

  const filtered = useMemo(() => {
    let list = vendorOrders;
    if (filter !== 'all') list = list.filter(o => vendorAlert(o) === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.vendor.toLowerCase().includes(q) ||
        o.orderId.toLowerCase().includes(q) ||
        o.notes?.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  }, [vendorOrders, filter, search]);

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
      next.has(vendor) ? next.delete(vendor) : next.add(vendor);
      return next;
    });
  }

  // ── Stat cards ────────────────────────────────────────────────────────────────

  const statCards = [
    { key: 'all',  label: 'Total',    value: stats.total,   border: 'border-white/10' },
    { key: 'ok',   label: 'On Track', value: stats.onTrack, border: 'border-green-500/30' },
    { key: 'warn', label: 'Due Soon', value: stats.soon,    border: 'border-yellow-500/30' },
    { key: 'late', label: 'Overdue',  value: stats.late,    border: 'border-red-500/30' },
    { key: 'done', label: 'Delivered',value: stats.done,    border: 'border-indigo-500/30' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Vendors</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {vendorOrders.length} order{vendorOrders.length !== 1 ? 's' : ''} · {grouped.length} vendor{grouped.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-yellow-300 animate-pulse">Saving…</span>}
          {!hasLock && session?.role === 'owner' && (
            <span className="text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-lg">
              Edit lock not held — read only
            </span>
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
      <div className="grid grid-cols-5 gap-3 mb-6">
        {statCards.map(card => (
          <button
            key={card.key}
            onClick={() => setFilter(card.key as FilterKey)}
            className={`bg-white/5 border rounded-xl p-4 text-left transition-all cursor-pointer ${card.border} ${
              filter === card.key ? 'ring-2 ring-white/20 bg-white/10' : 'hover:bg-white/8'
            }`}
          >
            <p className="text-2xl font-bold text-white">{card.value}</p>
            <p className="text-xs text-white/50 mt-1">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by vendor name, order ID, or notes…"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
        />
      </div>

      {/* Vendor groups */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          {vendorOrders.length === 0
            ? canEdit ? 'No vendor orders yet — click "New Vendor Order" to create one.' : 'No vendor orders yet.'
            : 'No vendor orders match your filter.'}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([vendorName, orders]) => {
            const isCollapsed = collapsed.has(vendorName);
            const lateCount = orders.filter(o => vendorAlert(o) === 'late').length;

            return (
              <div key={vendorName} className="border border-white/10 rounded-xl overflow-hidden">
                {/* Vendor section header */}
                <button
                  onClick={() => toggleCollapse(vendorName)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-[#1a1750] hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">🏭 {vendorName}</span>
                    <span className="text-xs text-white/40">
                      {orders.length} order{orders.length !== 1 ? 's' : ''}
                    </span>
                    {lateCount > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ALERT_CONFIG.late.color} ${ALERT_CONFIG.late.bg}`}>
                        {lateCount} overdue
                      </span>
                    )}
                  </div>
                  <span className={`text-white/30 text-xs transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                </button>

                {/* Order cards grid */}
                {!isCollapsed && (
                  <div className="p-4 bg-black/10 grid gap-3 sm:grid-cols-2">
                    {orders.map(order => (
                      <VendorOrderCard
                        key={order.id}
                        order={order}
                        canEdit={canEdit}
                        onEdit={o => setModalOrder(o)}
                        onDelete={o => setDeleteTarget(o)}
                        onStatusChange={handleStatusChange}
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
          <div className="bg-[#1a1750] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold mb-1">Delete vendor order?</h3>
            <p className="text-sm text-white/50 mb-5">
              This will permanently delete <span className="text-white">{deleteTarget.orderId}</span> from{' '}
              <span className="text-white">{deleteTarget.vendor}</span>.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors"
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
