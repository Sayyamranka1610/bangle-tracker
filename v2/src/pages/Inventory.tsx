import { useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../store/AppContext';
import { db, PATHS } from '../lib/firebase';
import type { LedgerEntry, Order } from '../types';
import {
  INV_TYPE_META, ALL_INV_TYPES, COL_META,
  computeTotals, computeDesignRows,
  typeColor, newEntryId,
  type InvType,
} from '../lib/inventoryUtils';

// ─── Add Entry Modal ──────────────────────────────────────────────────────────

interface AddEntryModalProps {
  orders: Order[];
  onSave: (entry: LedgerEntry) => void;
  onClose: () => void;
}

function AddEntryModal({ orders, onSave, onClose }: AddEntryModalProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate]             = useState(today);
  const [type, setType]             = useState<InvType>('raw_in');
  const [qty, setQty]               = useState('');
  const [designName, setDesignName] = useState('');
  const [designCode, setDesignCode] = useState('');
  const [vendor, setVendor]         = useState('');
  const [note, setNote]             = useState('');
  const [orderId, setOrderId]       = useState('');
  const [error, setError]           = useState('');

  // Unique designs from all orders for autocomplete
  const allDesigns = useMemo(() => {
    const seen = new Set<string>();
    const list: { name: string; code: string; orderId: string }[] = [];
    orders.forEach(o => o.designs?.forEach(d => {
      const key = `${d.name}__${d.code}`;
      if (!seen.has(key)) { seen.add(key); list.push({ name: d.name, code: d.code ?? '', orderId: o.id }); }
    }));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  function pickDesign(d: { name: string; code: string; orderId: string }) {
    setDesignName(d.name);
    setDesignCode(d.code);
    setOrderId(d.orderId);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!designName.trim()) { setError('Select or enter a design name.'); return; }
    if (!qty || Number(qty) <= 0) { setError('Quantity must be greater than 0.'); return; }
    const entry: LedgerEntry = {
      id: newEntryId(),
      date,
      designName: designName.trim(),
      designCode: designCode.trim() || undefined,
      type,
      qty: Number(qty),
      qtyKg: 0,
      qtySets: Number(qty),
      orderId: orderId || undefined,
      vendor: vendor.trim() || undefined,
      note: note.trim() || undefined,
      source: 'manual',
      autoType: type,
    };
    onSave(entry);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-semibold">Add Inventory Movement</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7] [color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Movement type *</label>
              <select value={type} onChange={e => setType(e.target.value as InvType)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]">
                {ALL_INV_TYPES.map(t => (
                  <option key={t} value={t}>{INV_TYPE_META[t].icon} {INV_TYPE_META[t].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Design picker */}
          <div>
            <label className="block text-xs text-white/60 mb-1">Design *</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input value={designName} onChange={e => setDesignName(e.target.value)}
                placeholder="Design name"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
              <input value={designCode} onChange={e => setDesignCode(e.target.value)}
                placeholder="Design code (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
            </div>
            {allDesigns.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {allDesigns.map((d, i) => (
                  <button key={i} type="button" onClick={() => pickDesign(d)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      designName === d.name ? 'bg-[#534AB7] border-[#534AB7] text-white' : 'border-white/10 text-white/50 hover:text-white hover:bg-white/5'
                    }`}>
                    {d.name}{d.code ? ` (${d.code})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Quantity (pcs) *</label>
              <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
                placeholder="e.g. 200"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Vendor / Party</label>
              <input value={vendor} onChange={e => setVendor(e.target.value)}
                placeholder="e.g. Ram Cutting Works"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="Optional note…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">Cancel</button>
            <button type="submit"
              className="flex-1 py-2 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] text-white font-medium text-sm transition-colors">Add Entry</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Inventory Page ──────────────────────────────────────────────────────

export default function Inventory() {
  const { state, showToast } = useApp();
  const { data, session, hasLock } = state;

  const ledger: LedgerEntry[] = useMemo(() => data.invLedger ?? [], [data.invLedger]);
  const orders: Order[]       = useMemo(() => data.orders ?? [], [data.orders]);
  const canEdit = session?.role === 'owner' && hasLock;

  const [tab, setTab]           = useState<'ledger' | 'history'>('ledger');
  const [groupBy, setGroupBy]   = useState<'designName' | 'designCode'>('designName');
  const [search, setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totals      = useMemo(() => computeTotals(ledger), [ledger]);
  const designRows  = useMemo(() => computeDesignRows(ledger, groupBy), [ledger, groupBy]);

  // Filtered history entries
  const historyRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger
      .filter(e => {
        if (typeFilter && e.type !== typeFilter) return false;
        if (q) {
          const hay = `${e.designName ?? ''} ${e.designCode ?? ''} ${e.vendor ?? ''} ${e.note ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [ledger, search, typeFilter]);

  // ── Save helpers ──────────────────────────────────────────────────────────────
  async function persistLedger(next: LedgerEntry[]) {
    setSaving(true);
    try {
      await db.set(`${PATHS.appData}/invLedger`, next);
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEntry(entry: LedgerEntry) {
    setShowModal(false);
    showToast('Entry added', 'success');
    await persistLedger([...ledger, entry]);
  }

  async function handleDelete(id: string) {
    setDeleteId(null);
    showToast('Entry deleted', 'info');
    await persistLedger(ledger.filter(e => e.id !== id));
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-sm text-white/40 mt-0.5">{ledger.length} movement{ledger.length !== 1 ? 's' : ''} recorded</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-yellow-300 animate-pulse">Saving…</span>}
          {!hasLock && session?.role === 'owner' && (
            <span className="text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-lg">Edit lock not held</span>
          )}
          {canEdit && (
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-[#534AB7] hover:bg-[#6259c8] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <span>+</span> Add Movement
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(['raw', 'semi', 'fin'] as const).map(col => {
          const meta = COL_META[col];
          const val = col === 'raw' ? totals.totalRaw : col === 'semi' ? totals.totalSemi : totals.totalFin;
          return (
            <div key={col} className={`border rounded-xl p-4 ${meta.bg} ${meta.border}`}>
              <p className={`text-2xl font-bold ${meta.color}`}>{val.toLocaleString()}</p>
              <p className="text-xs font-medium text-white/70 mt-0.5">{meta.label}</p>
              <p className="text-xs text-white/30">{meta.sublabel}</p>
            </div>
          );
        })}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <p className="text-2xl font-bold text-white">{totals.totalMoves}</p>
          <p className="text-xs font-medium text-white/70 mt-0.5">Movements</p>
          <p className="text-xs text-white/30">total entries</p>
        </div>
      </div>

      {/* Sub-tab */}
      <div className="flex gap-1 mb-5 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
        {(['ledger', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-[#534AB7] text-white' : 'text-white/50 hover:text-white'
            }`}>
            {t === 'ledger' ? '📊 Current Balance' : '📋 History'}
          </button>
        ))}
      </div>

      {/* ── Current Balance tab ─────────────────────────────────────────────── */}
      {tab === 'ledger' && (
        <>
          {/* Group by toggle */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-white/40">Group by:</span>
            {(['designName', 'designCode'] as const).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  groupBy === g ? 'bg-[#534AB7] border-[#534AB7] text-white' : 'border-white/10 text-white/50 hover:text-white'
                }`}>
                {g === 'designName' ? 'Design Name' : 'Design Code'}
              </button>
            ))}
          </div>

          {designRows.length === 0 ? (
            <div className="text-center py-12 text-white/30">
              No inventory data yet.{canEdit ? ' Click "Add Movement" to record the first entry.' : ''}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-white/40">
                    <th className="text-left px-5 py-3 font-normal">Design</th>
                    <th className={`text-right px-4 py-3 font-medium ${COL_META.raw.color}`}>Raw (pcs)</th>
                    <th className={`text-right px-4 py-3 font-medium ${COL_META.semi.color}`}>Semi-Finished</th>
                    <th className={`text-right px-4 py-3 font-medium ${COL_META.fin.color}`}>Finished</th>
                    <th className="text-right px-5 py-3 font-normal">Movements</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {designRows.map(row => (
                    <tr key={row.key} className="hover:bg-white/3 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-white font-medium">{row.label}</p>
                        {row.sublabel && <p className="text-xs text-white/40">{row.sublabel}</p>}
                      </td>
                      <td className="text-right px-4 py-3">
                        <span className={`font-semibold ${row.raw > 0 ? COL_META.raw.color : 'text-white/20'}`}>
                          {row.raw.toLocaleString()}
                        </span>
                      </td>
                      <td className="text-right px-4 py-3">
                        <span className={`font-semibold ${row.semi > 0 ? COL_META.semi.color : 'text-white/20'}`}>
                          {row.semi.toLocaleString()}
                        </span>
                      </td>
                      <td className="text-right px-4 py-3">
                        <span className={`font-semibold ${row.fin > 0 ? COL_META.fin.color : 'text-white/20'}`}>
                          {row.fin.toLocaleString()}
                        </span>
                      </td>
                      <td className="text-right px-5 py-3 text-white/40 text-xs">{row.moves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── History tab ─────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <>
          <div className="flex gap-2 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search design, vendor, note…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm" />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]">
              <option value="">All types</option>
              {ALL_INV_TYPES.map(t => (
                <option key={t} value={t}>{INV_TYPE_META[t].label}</option>
              ))}
            </select>
          </div>

          {historyRows.length === 0 ? (
            <div className="text-center py-12 text-white/30">
              {ledger.length === 0 ? 'No entries yet.' : 'No entries match your filter.'}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-white/40">
                    <th className="text-left px-5 py-3 font-normal">Date</th>
                    <th className="text-left px-4 py-3 font-normal">Type</th>
                    <th className="text-left px-4 py-3 font-normal">Design</th>
                    <th className="text-right px-4 py-3 font-normal">Qty</th>
                    <th className="text-left px-4 py-3 font-normal">Vendor</th>
                    <th className="text-left px-4 py-3 font-normal">Note</th>
                    {canEdit && <th className="px-5 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {historyRows.map(e => {
                    const meta = INV_TYPE_META[e.type as InvType];
                    const { text, bg } = typeColor(e.type);
                    return (
                      <tr key={e.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-5 py-2.5 text-white/60 text-xs font-mono">{e.date}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${text} ${bg}`}>
                            {meta?.icon} {meta?.label ?? e.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-white">{e.designName}</span>
                          {e.designCode && <span className="text-white/40 ml-1.5 text-xs">({e.designCode})</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-white">{Number(e.qty).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-white/50 text-xs max-w-[100px] truncate">{e.vendor || '—'}</td>
                        <td className="px-4 py-2.5 text-white/40 text-xs max-w-[160px] truncate">{e.note || '—'}</td>
                        {canEdit && (
                          <td className="px-5 py-2.5">
                            <button onClick={() => setDeleteId(e.id)}
                              className="text-white/20 hover:text-red-400 transition-colors text-xs">🗑️</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add Entry Modal */}
      {showModal && (
        <AddEntryModal orders={orders} onSave={handleAddEntry} onClose={() => setShowModal(false)} />
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}>
          <div className="bg-[#1a1750] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold mb-1">Delete entry?</h3>
            <p className="text-sm text-white/50 mb-5">This inventory movement will be permanently removed. Current balances will update automatically.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteId)}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
