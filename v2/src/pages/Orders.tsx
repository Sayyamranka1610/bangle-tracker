import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import type { Order } from '../types';
import { orderAlert, computeStats, renumberOrders } from '../lib/orderUtils';
import { db, PATHS } from '../lib/firebase';
import { writeAudit } from '../lib/auditUtils';
import { rebuildVocab, saveVocab } from '../lib/vocabUtils';
import { syncInventoryForOrder } from '../lib/inventoryAutoSync';
import StatCards from '../components/orders/StatCards';
import OrderCard from '../components/orders/OrderCard';
import OrderModal from '../components/orders/OrderModal';

type FilterKey = 'all' | 'ok' | 'warn' | 'late' | 'done';

export default function Orders() {
  const { state, showToast } = useApp();
  const { data, session, hasLock } = state;

  const orders: Order[]    = useMemo(() => data.orders    ?? [], [data.orders]);
  const canEdit = session?.role === 'owner' && hasLock;

  const [filter, setFilter]           = useState<FilterKey>('all');
  const [search, setSearch]           = useState('');
  const [modalOrder, setModalOrder]   = useState<Order | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [saving, setSaving]           = useState(false);

  const stats  = useMemo(() => computeStats(orders), [orders]);
  const clients = useMemo(() => data.vocabulary?.clients ?? [], [data.vocabulary]);
  const dnames  = useMemo(() => data.vocabulary?.dnames  ?? [], [data.vocabulary]);
  const dcodes  = useMemo(() => data.vocabulary?.dcodes  ?? [], [data.vocabulary]);

  const filtered = useMemo(() => {
    let list = orders;
    if (filter !== 'all') list = list.filter(o => orderAlert(o) === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.client.toLowerCase().includes(q) ||
        o.orderId.toLowerCase().includes(q) ||
        o.notes?.toLowerCase().includes(q) ||
        o.designs.some(d => d.name.toLowerCase().includes(q) || d.code?.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  }, [orders, filter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Order[]>();
    filtered.forEach(o => {
      const key = o.client || '(unknown)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // ── Persist helpers ──────────────────────────────────────────────────────────
  async function persistOrders(next: Order[], auditAction?: string, auditDetail?: string) {
    const numbered = renumberOrders(next);
    setSaving(true);
    try {
      await db.set(`${PATHS.appData}/orders`, numbered);

      // Audit
      if (auditAction && session?.username) {
        await writeAudit(auditAction, auditDetail ?? '', session.username, data.auditLog ?? []);
      }

      // Vocabulary rebuild
      const vocab = rebuildVocab(numbered, data.vocabularyManual ?? {});
      await saveVocab(vocab);

    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Order-level CRUD ─────────────────────────────────────────────────────────
  async function handleSave(saved: Order) {
    const exists = orders.some(o => o.id === saved.id);
    const next = exists ? orders.map(o => o.id === saved.id ? saved : o) : [saved, ...orders];
    setModalOrder(undefined);
    showToast(exists ? 'Order updated' : 'Order created', 'success');
    const action = exists ? 'Edit order' : 'Create order';
    const detail = exists
      ? `Order ${saved.orderId} updated`
      : `New order for ${saved.client} (${saved.bangleType}) with ${saved.designs.length} design(s)`;
    await persistOrders(next, action, detail);
  }

  // ── Inline order update (from expanded card — details/designs/stages tabs) ───
  async function handleUpdate(updated: Order) {
    const prev = orders.find(o => o.id === updated.id);
    const next = orders.map(o => o.id === updated.id ? updated : o);

    // Auto-sync inventory from any stage changes
    const orderIndex = next.findIndex(o => o.id === updated.id);
    const syncedLedger = syncInventoryForOrder(next, orderIndex, data.invLedger ?? []);
    const hasLedgerChange = syncedLedger.length !== (data.invLedger ?? []).length;

    setSaving(true);
    try {
      await db.set(`${PATHS.appData}/orders`, renumberOrders(next));

      if (hasLedgerChange) {
        await db.set(`${PATHS.appData}/invLedger`, syncedLedger);
      }

      if (session?.username) {
        // Determine what changed for audit
        let auditDetail = `Order ${updated.orderId}`;
        if (prev && prev.client !== updated.client) auditDetail += `: client changed`;
        else if (prev && JSON.stringify(prev.designs) !== JSON.stringify(updated.designs)) auditDetail += `: designs/stages updated`;

        await writeAudit('Edit order', auditDetail, session.username, data.auditLog ?? []);
      }

      const vocab = rebuildVocab(next, data.vocabularyManual ?? {});
      await saveVocab(vocab);

    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const next = orders.filter(o => o.id !== deleteTarget.id);
    const detail = `Order ${deleteTarget.orderId} (${deleteTarget.client}) deleted`;
    setDeleteTarget(null);
    showToast(`Deleted ${deleteTarget.orderId}`, 'info');
    await persistOrders(next, 'Delete order', detail);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Orders</h1>
          <p className="text-sm text-white/40 mt-0.5">{orders.length} total order{orders.length !== 1 ? 's' : ''}</p>
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

      <StatCards stats={stats} activeFilter={filter} onFilter={f => setFilter(f as FilterKey)} />

      <div className="mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by client, order ID, design name or code…"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          {orders.length === 0
            ? canEdit ? 'No orders yet — click "New Order" to create one.' : 'No orders yet.'
            : 'No orders match your filter.'}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([clientName, clientOrders]) => (
            <div key={clientName}>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2 px-1">
                {clientName}
                <span className="ml-2 text-white/30 font-normal normal-case">
                  {clientOrders.length} order{clientOrders.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="space-y-2">
                {clientOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    canEdit={canEdit}
                    dnames={dnames}
                    dcodes={dcodes}
                    onUpdate={handleUpdate}
                    onEdit={o => setModalOrder(o)}
                    onDelete={o => setDeleteTarget(o)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOrder !== undefined && (
        <OrderModal
          order={modalOrder}
          clients={clients}
          dnames={dnames}
          dcodes={dcodes}
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
