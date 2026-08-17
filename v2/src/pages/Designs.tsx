import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import type { Order, DesignStage } from '../types';
import { buildCodeMap } from '../lib/designUtils';
import DesignGroupCard from '../components/designs/DesignGroupCard';

export default function Designs() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;

  const orders: Order[] = useMemo(() => data.orders ?? [], [data.orders]);
  const canEdit = session?.role === 'owner' && hasLock;

  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Build code map from all orders
  const codeMap = useMemo(() => buildCodeMap(orders), [orders]);

  // Filter by search
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result: [string, ReturnType<typeof buildCodeMap> extends Map<string, infer V> ? V : never][] = [];
    codeMap.forEach((entries, code) => {
      if (!q) {
        result.push([code, entries]);
        return;
      }
      const matchesCode = code.toLowerCase().includes(q);
      const matchesName = entries.some(e => e.design.name.toLowerCase().includes(q));
      const matchesClient = entries.some(e => e.order.client.toLowerCase().includes(q));
      if (matchesCode || matchesName || matchesClient) result.push([code, entries]);
    });
    return result.sort(([a], [b]) => a.localeCompare(b));
  }, [codeMap, search]);

  const totalDesigns = useMemo(() => {
    let count = 0;
    codeMap.forEach(entries => { count += entries.length; });
    return count;
  }, [codeMap]);

  // ── Stage update ─────────────────────────────────────────────────────────────

  async function handleStageUpdate(
    orderIndex: number,
    designIndex: number,
    stageIndex: number,
    patch: Partial<DesignStage>,
  ) {
    const nextOrders: Order[] = orders.map((o, oi) => {
      if (oi !== orderIndex) return o;
      return {
        ...o,
        designs: o.designs.map((d, di) => {
          if (di !== designIndex) return d;
          return {
            ...d,
            stages: d.stages.map((s, si) => si === stageIndex ? { ...s, ...patch } : s),
          };
        }),
      };
    });

    setSaving(true);
    try {
      await saveAppData({ orders: nextOrders });
      showToast('Stage updated', 'success');
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Designs</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {codeMap.size} unique code{codeMap.size !== 1 ? 's' : ''} · {totalDesigns} design{totalDesigns !== 1 ? 's' : ''} across all orders
          </p>
        </div>
        {saving && (
          <span className="text-xs text-yellow-300 animate-pulse">Saving…</span>
        )}
        {!hasLock && session?.role === 'owner' && (
          <span className="text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-lg">
            Edit lock not held — read only
          </span>
        )}
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by design code, name, or client…"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
        />
      </div>

      {/* Design groups */}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          {orders.length === 0
            ? 'No orders yet. Create an order first, then add designs to it.'
            : 'No designs match your search.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map(([code, entries]) => (
            <DesignGroupCard
              key={code}
              code={code}
              entries={entries}
              canEdit={canEdit}
              onStageUpdate={handleStageUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
