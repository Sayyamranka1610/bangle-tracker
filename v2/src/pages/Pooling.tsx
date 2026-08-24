import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import type { AppData, Priority, VendorOrder, VendorOrderType, VendorStatus } from '../types';
import {
  buildPoolGroups, groupByFamily, makeQty, emptyExtras, sumSizes,
  buildVendorDesigns, markPooled,
  type PoolMode, type PoolGroup, type Extras,
} from '../lib/poolUtils';
import { genVendorOrderId } from '../lib/vendorUtils';
import { buildAuditLog } from '../lib/auditUtils';
import { todayISO } from '../lib/orderUtils';

const SIZE_ORDER = ['2/2', '2/4', '2/6', '2/8', '2/10', '2/12', '2/14', '2/16'];

function orderSizes(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

const MODES: { id: PoolMode; label: string; hint: string }[] = [
  { id: 'pipe',    label: '🔩 Pipe',    hint: 'Pooled by design code' },
  { id: 'karigar', label: '🛠️ Karigar', hint: 'Pooled by design code — gold and rose merge into one batch' },
  { id: 'plating', label: '🪙 Plating',  hint: 'Pooled by code + colour — each finish is its own batch' },
];

// ─── One pooled batch ────────────────────────────────────────────────────────

function PoolCard({
  group, extras, selected, canEdit, onToggle, onExtras, familyNote,
}: {
  group: PoolGroup;
  extras: Extras;
  selected: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onExtras: (e: Extras) => void;
  familyNote?: string;
}) {
  const [showWho, setShowWho] = useState(false);

  const make = makeQty(group, extras);
  const sizes = orderSizes([...new Set([
    ...Object.keys(group.ordered),
    ...Object.keys(extras.buffer),
    ...Object.keys(extras.stock),
  ])]);
  const makeTotal = sumSizes(make);
  const bufferTotal = sumSizes(extras.buffer);
  const stockTotal = sumSizes(extras.stock);

  function setExtra(kind: 'buffer' | 'stock', size: string, raw: string) {
    const n = Number(raw);
    const next: Extras = { buffer: { ...extras.buffer }, stock: { ...extras.stock } };
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) delete next[kind][size];
    else next[kind][size] = n;
    onExtras(next);
  }

  return (
    <div className={`border rounded-xl overflow-hidden mb-2.5 transition-colors ${
      selected ? 'border-[#534AB7] bg-[#534AB7]/10' : 'border-white/10 bg-white/3'}`}>
      {/* header */}
      <div className="flex gap-3 p-3 items-start border-b border-white/10">
        {canEdit && (
          <input type="checkbox" checked={selected} onChange={onToggle}
            className="mt-1 w-4 h-4 accent-[#534AB7] cursor-pointer" />
        )}
        {group.image
          ? <img src={group.image} alt="" loading="lazy"
              className="w-14 h-14 rounded-lg object-cover border border-white/10 flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
          : <div className="w-14 h-14 rounded-lg bg-white/5 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{group.code}</div>
          <div className="text-[11px] text-white/40 truncate" title={group.names.join(' · ')}>
            {group.names.join(' · ') || group.family}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {group.finishes.map(f => (
              <span key={f} className="text-[10px] rounded-full px-2 py-0.5 bg-white/10 text-white/70">{f}</span>
            ))}
            {group.finishes.length > 1 && (
              <span className="text-[10px] rounded-full px-2 py-0.5 bg-green-500/20 text-green-300"
                title="Same physical piece — the karigar makes them together">
                ✓ {group.finishes.length} colours merged
              </span>
            )}
            <span className="text-[10px] rounded-full px-2 py-0.5 bg-white/10 text-white/60">
              {group.clients.length} customer{group.clients.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-bold text-[#a89fff] leading-none">{makeTotal}</div>
          <div className="text-[10px] uppercase tracking-wide text-white/40 mt-1">to make</div>
        </div>
      </div>

      {familyNote && (
        <div className="px-3 py-2 text-[11px] text-white/60 bg-white/3 border-b border-white/10">
          <b className="text-[#a89fff]">Family note:</b> {familyNote}
        </div>
      )}

      {/* size matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 420 }}>
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-3 py-1.5 text-white/40 font-normal whitespace-nowrap">Size</th>
              {sizes.map(s => <th key={s} className="px-2 py-1.5 text-white/40 font-normal text-center">{s}</th>)}
              <th className="px-3 py-1.5 text-[#a89fff] font-normal text-center border-l border-white/10">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/5">
              <td className="px-3 py-1.5 text-white/70 whitespace-nowrap">Ordered by customers</td>
              {sizes.map(s => <td key={s} className="px-2 py-1.5 text-center text-white">{group.ordered[s] ?? 0}</td>)}
              <td className="px-3 py-1.5 text-center font-bold text-[#a89fff] border-l border-white/10">{group.orderedTotal}</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="px-3 py-1.5 text-white/70 whitespace-nowrap">+ Buffer for rejections</td>
              {sizes.map(s => (
                <td key={s} className="px-1 py-1.5 text-center">
                  <input type="number" min="0" disabled={!canEdit}
                    value={extras.buffer[s] ?? ''} placeholder="—"
                    onChange={e => setExtra('buffer', s, e.target.value)}
                    className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-xs text-center focus:outline-none focus:border-[#534AB7] placeholder-white/20" />
                </td>
              ))}
              <td className="px-3 py-1.5 text-center text-white/60 border-l border-white/10">{bufferTotal || '—'}</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="px-3 py-1.5 text-white/70 whitespace-nowrap">+ Extra for stock</td>
              {sizes.map(s => (
                <td key={s} className="px-1 py-1.5 text-center">
                  <input type="number" min="0" disabled={!canEdit}
                    value={extras.stock[s] ?? ''} placeholder="—"
                    onChange={e => setExtra('stock', s, e.target.value)}
                    className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-xs text-center focus:outline-none focus:border-[#534AB7] placeholder-white/20" />
                </td>
              ))}
              <td className="px-3 py-1.5 text-center text-white/60 border-l border-white/10">{stockTotal || '—'}</td>
            </tr>
            <tr className="bg-[#534AB7]/15">
              <td className="px-3 py-2 font-bold text-white whitespace-nowrap">MAKE</td>
              {sizes.map(s => <td key={s} className="px-2 py-2 text-center font-bold text-white">{make[s] ?? 0}</td>)}
              <td className="px-3 py-2 text-center font-bold text-[#a89fff] border-l border-white/10">{makeTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* who ordered it */}
      <button onClick={() => setShowWho(v => !v)}
        className="w-full text-left px-3 py-2 text-[11px] text-[#a89fff] hover:bg-white/5 border-t border-white/10 transition-colors">
        {showWho ? '▾' : '▸'} Who ordered this ({group.contributors.length} row{group.contributors.length !== 1 ? 's' : ''})
      </button>
      {showWho && (
        <div className="px-3 pb-2 divide-y divide-white/5 border-t border-white/5">
          {group.contributors.map((c, i) => (
            <div key={`${c.row.designId}-${c.row.varietyId ?? 'flat'}-${i}`} className="py-1.5 flex justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-white truncate">
                  {c.row.client}
                  {c.row.note && <span className="ml-1.5 text-[10px] text-amber-300" title={c.row.note}>📌</span>}
                </div>
                <div className="text-[10px] text-white/35 truncate">
                  {c.row.orderLabel}{c.row.varName ? ` · ${c.row.varName}` : ''} · {c.row.finish} ·{' '}
                  {orderSizes(Object.keys(c.row.sizes)).map(s => `${s}×${c.row.sizes[s]}`).join(', ')}
                </div>
              </div>
              <div className="text-xs font-bold text-[#a89fff] flex-shrink-0">{c.qty}</div>
            </div>
          ))}
          {(bufferTotal > 0 || stockTotal > 0) && (
            <div className="py-1.5 flex justify-between gap-3">
              <div>
                <div className="text-xs text-green-300">Buffer / stock</div>
                <div className="text-[10px] text-white/35">not promised to anyone — stays with you</div>
              </div>
              <div className="text-xs font-bold text-green-300">{bufferTotal + stockTotal}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Pooling() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;
  const canEdit = session?.role === 'owner' && hasLock;

  const [mode, setMode] = useState<PoolMode>('karigar');
  const [multiOnly, setMultiOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extrasByKey, setExtrasByKey] = useState<Record<string, Extras>>({});
  const [saving, setSaving] = useState(false);

  // Vendor order form
  const [vendor, setVendor] = useState('');
  const [start, setStart] = useState(todayISO());
  const [delivery, setDelivery] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [notes, setNotes] = useState('');

  const allGroups = useMemo(() => buildPoolGroups(data, mode), [data, mode]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGroups.filter(g => {
      if (multiOnly && g.clients.length < 2) return false;
      if (!q) return true;
      return g.code.toLowerCase().includes(q)
        || g.family.toLowerCase().includes(q)
        || g.names.some(n => n.toLowerCase().includes(q))
        || g.clients.some(c => c.toLowerCase().includes(q));
    });
  }, [allGroups, multiOnly, search]);

  const families = useMemo(() => groupByFamily(groups), [groups]);

  const knownVendors = useMemo(() => {
    const fromVocab = data.vocabulary?.vendors ?? [];
    const typed = Object.entries(data.vendorTypes ?? {})
      .filter(([, t]) => t === mode).map(([v]) => v);
    return [...new Set([...typed, ...fromVocab])];
  }, [data.vocabulary, data.vendorTypes, mode]);

  const selectedGroups = groups.filter(g => selected.has(g.key));
  const selectedMake = selectedGroups.reduce(
    (a, g) => a + sumSizes(makeQty(g, extrasByKey[g.key] ?? emptyExtras())), 0);

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function createBatch() {
    if (!canEdit) return;
    if (!selectedGroups.length) { showToast('Tick at least one batch first', 'info'); return; }
    if (!vendor.trim()) { showToast('Please choose a vendor', 'error'); return; }

    const { designs, touched } = buildVendorDesigns(selectedGroups, extrasByKey);
    const vo: VendorOrder = {
      id: 'vo_' + Date.now(),
      orderId: genVendorOrderId(data.vendorOrders ?? []),
      vendor: vendor.trim(),
      type: mode as VendorOrderType,
      startDate: start,
      deliveryDate: delivery || undefined,
      priority,
      status: 'pending' as VendorStatus,
      notes: notes.trim() || undefined,
      designs,
    };

    const nextOrders = markPooled(data.orders ?? [], touched, vo.id);
    const patch: Partial<AppData> = {
      vendorOrders: [...(data.vendorOrders ?? []), vo],
      orders: nextOrders,
    };
    if (session?.username) {
      patch.auditLog = buildAuditLog(
        'Pool batch',
        `${vo.orderId} → ${vo.vendor} (${mode}) · ${designs.length} design(s) · ${selectedMake} pcs from ${touched.length} customer row(s)`,
        session.username, data.auditLog ?? []);
    }

    setSaving(true);
    try {
      await saveAppData(patch, { immediate: true });
      showToast(`${vo.orderId} created for ${vo.vendor} — ${selectedMake} pcs`, 'success');
      setSelected(new Set());
      setExtrasByKey({});
      setVendor(''); setNotes(''); setDelivery('');
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  const modeHint = MODES.find(m => m.id === mode)!.hint;
  const totalLoose = allGroups.reduce((a, g) => a + g.orderedTotal, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Pooling Board</h1>
        <p className="text-sm text-white/40 mt-0.5">
          The same design wanted by several customers, added together into one batch worth sending.
          Only items not yet given to any vendor appear here.
        </p>
      </div>

      {/* mode */}
      <div className="flex gap-2 items-center flex-wrap mb-2">
        <span className="text-xs text-white/40">Sending to:</span>
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {MODES.map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setSelected(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === m.id ? 'bg-[#534AB7] text-white' : 'text-white/50 hover:text-white'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-white/35">{modeHint}</span>
      </div>

      <div className="flex gap-2 flex-wrap items-center mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search code, family, design or client…"
          className="flex-1 min-w-[220px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
        <button onClick={() => setMultiOnly(v => !v)}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            multiOnly ? 'bg-[#534AB7] text-white' : 'bg-white/5 text-white/50 hover:text-white border border-white/10'}`}>
          Only where 2+ customers want it
        </button>
      </div>

      <div className="text-xs text-white/40 mb-3">
        {groups.length} batch{groups.length !== 1 ? 'es' : ''} · {totalLoose.toLocaleString()} pieces not yet with any vendor
        {multiOnly && ` · ${allGroups.length - groups.length} hidden (only one customer)`}
      </div>

      {groups.length === 0 && (
        <div className="border border-white/10 rounded-xl p-8 text-center">
          <p className="text-sm text-white/50">
            {allGroups.length === 0
              ? 'Nothing to pool — every item is already with a vendor.'
              : 'No design here is wanted by 2 or more customers.'}
          </p>
          {allGroups.length > 0 && multiOnly && (
            <p className="text-xs text-white/30 mt-2">
              That is normal: most designs are one-offs. The Buffer and Stock rows are what get a batch to a workable size.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        {/* batches */}
        <div>
          {families.map(({ family, groups: gs }) => (
            <div key={family} className="mb-5">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className="text-sm font-bold text-[#a89fff]">{family}</h2>
                <span className="text-[11px] text-white/35">
                  {gs.length} batch{gs.length !== 1 ? 'es' : ''} · {gs.reduce((a, g) => a + g.orderedTotal, 0).toLocaleString()} pcs ordered
                </span>
              </div>
              {gs.map(g => (
                <PoolCard key={g.key} group={g}
                  extras={extrasByKey[g.key] ?? emptyExtras()}
                  selected={selected.has(g.key)}
                  canEdit={canEdit}
                  onToggle={() => toggle(g.key)}
                  onExtras={e => setExtrasByKey(p => ({ ...p, [g.key]: e }))}
                  familyNote={data.familyNotes?.[family]} />
              ))}
            </div>
          ))}
        </div>

        {/* create batch panel */}
        <div>
          <div className="sticky top-4 border border-white/10 rounded-xl bg-white/5 overflow-hidden">
            <div className="px-4 py-3 bg-[#534AB7] text-white text-sm font-semibold">
              Create {MODES.find(m => m.id === mode)!.label.replace(/^\S+\s/, '')} batch
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs text-white/60">
                {selectedGroups.length} batch{selectedGroups.length !== 1 ? 'es' : ''} selected ·{' '}
                <b className="text-[#a89fff]">{selectedMake}</b> pcs to make
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1">Vendor *</label>
                <input list="bt-pool-vendors" value={vendor} onChange={e => setVendor(e.target.value)}
                  disabled={!canEdit} placeholder="Vendor name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
                <datalist id="bt-pool-vendors">
                  {knownVendors.map(v => <option key={v} value={v} />)}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/60 mb-1">Start</label>
                  <input type="date" value={start} onChange={e => setStart(e.target.value)} disabled={!canEdit}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-[#534AB7] [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Wanted by</label>
                  <input type="date" value={delivery} onChange={e => setDelivery(e.target.value)} disabled={!canEdit}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-[#534AB7] [color-scheme:dark]" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as Priority)} disabled={!canEdit}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]">
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="critical">🔴 Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} disabled={!canEdit}
                  placeholder="Anything the vendor should know…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-xs resize-none focus:outline-none focus:border-[#534AB7]" />
              </div>

              <button onClick={createBatch}
                disabled={!canEdit || saving || !selectedGroups.length}
                className="w-full py-2.5 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
                {saving ? 'Saving…' : `Create vendor order →`}
              </button>

              {!canEdit && (
                <p className="text-[11px] text-white/35 leading-relaxed">
                  {session?.role !== 'owner'
                    ? 'Read-only — only the owner can create vendor orders.'
                    : 'Another device holds the edit lock. Creating batches is disabled until it is released.'}
                </p>
              )}
              <p className="text-[11px] text-white/30 leading-relaxed">
                Every piece stays linked to the customer who ordered it, so when the goods come back
                the app knows exactly who gets what.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
