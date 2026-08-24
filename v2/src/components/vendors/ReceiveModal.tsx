import { useState, useMemo } from 'react';
import type { AppData, VendorOrder, VendorDesign } from '../../types';
import { useApp } from '../../store/AppContext';
import {
  initReceiveLines, recomputeGood, suggestEvenSplit, allocatedTotal,
  validateReceive, applyAllocation, applyVendorReceipt, applyToStock,
  demandOf, receivableDesigns, alreadyReceivedFrom, remainingOf, type ReceiveLine,
} from '../../lib/receiveUtils';
import { buildAuditLog } from '../../lib/auditUtils';
import { familyOf } from '../../lib/familyUtils';

// Receiving a pooled batch back from a vendor, and deciding who gets what.
// Nothing is allocated automatically — "Suggest a split" only fills the boxes.

export default function ReceiveModal({ vo, onClose }: { vo: VendorOrder; onClose: () => void }) {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;
  const canEdit = session?.role === 'owner' && hasLock;

  const designs = useMemo(() => receivableDesigns(vo), [vo]);
  const [designId, setDesignId] = useState(designs[0]?.id ?? '');
  const design: VendorDesign | undefined = designs.find(d => d.id === designId);
  const sources = useMemo(() => design?.sources ?? [], [design]);

  const [lines, setLines] = useState<ReceiveLine[]>(() => design ? initReceiveLines(design) : []);
  // What each customer already got in earlier part-deliveries of this batch.
  const already = useMemo(() => alreadyReceivedFrom(data.orders ?? [], sources), [data.orders, sources]);
  const [saving, setSaving] = useState(false);

  function switchDesign(id: string) {
    setDesignId(id);
    const d = designs.find(x => x.id === id);
    setLines(d ? initReceiveLines(d) : []);
  }

  function updateLine(i: number, patch: Partial<ReceiveLine>) {
    setLines(prev => prev.map((l, j) => j === i ? recomputeGood({ ...l, ...patch }) : l));
  }

  function setAlloc(i: number, srcIdx: number, val: string) {
    const n = Math.max(0, Number(val) || 0);
    setLines(prev => prev.map((l, j) => {
      if (j !== i) return l;
      const alloc = [...l.alloc];
      alloc[srcIdx] = n;
      return { ...l, alloc };
    }));
  }

  function suggestAll() {
    setLines(prev => prev.map(l => suggestEvenSplit(recomputeGood(l), sources, already)));
  }

  const validation = useMemo(() => validateReceive(lines, sources, already), [lines, sources, already]);
  const totalGood = lines.reduce((a, l) => a + l.good, 0);
  const totalAllocated = lines.reduce((a, l) => a + allocatedTotal(l), 0);
  const totalReceived = lines.reduce((a, l) => a + (Number(l.received) || 0), 0);

  async function confirm() {
    if (!canEdit || !design) return;
    if (!validation.ok) { showToast('Fix the highlighted problems first', 'error'); return; }
    if (totalReceived <= 0) { showToast('Enter how many pieces came back', 'info'); return; }

    const nextOrders = applyAllocation(data.orders ?? [], design, lines);
    const nextVOs = applyVendorReceipt(data.vendorOrders ?? [], vo.id, design.id, lines);
    const family = familyOf(data, design.code ?? '', design.name ?? '');
    const nextStock = applyToStock(data.stockItems ?? [], design, lines, family);

    const patch: Partial<AppData> = {
      orders: nextOrders,
      vendorOrders: nextVOs,
      stockItems: nextStock,
    };
    if (session?.username) {
      patch.auditLog = buildAuditLog(
        'Receive batch',
        `${vo.orderId} · ${design.code ?? design.name}: received ${totalReceived}, ${totalGood} good, ${totalAllocated} allocated`,
        session.username, data.auditLog ?? []);
    }

    setSaving(true);
    try {
      await saveAppData(patch, { immediate: true });
      showToast(`Received ${totalReceived} pcs — ${totalAllocated} allocated`, 'success');
      onClose();
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl my-4">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#1a1750] rounded-t-2xl z-10">
          <div>
            <h2 className="text-white font-semibold">Receive from {vo.vendor}</h2>
            <p className="text-xs text-white/40 mt-0.5">{vo.orderId} · decide who gets what</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {!designs.length && (
            <p className="text-sm text-white/50 text-center py-6">
              This vendor order has no pooled lines, so there is nothing to split back.
              It was created before pooling existed, or added by hand.
            </p>
          )}

          {designs.length > 1 && (
            <div>
              <label className="block text-xs text-white/60 mb-1">Which design came back?</label>
              <select value={designId} onChange={e => switchDesign(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]">
                {designs.map(d => (
                  <option key={d.id} value={d.id}>{d.code ?? '(no code)'} — {d.name}</option>
                ))}
              </select>
            </div>
          )}

          {design && (
            <>
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <span className="text-white font-semibold text-sm">{design.code ?? design.name}</span>
                <span className="text-white/40">{sources.length} customer row{sources.length !== 1 ? 's' : ''} in this batch</span>
                {canEdit && (
                  <button onClick={suggestAll}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs transition-colors">
                    ⇄ Suggest a split
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-white/10 rounded-xl">
                <table className="w-full text-xs" style={{ minWidth: 640 }}>
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="text-left px-3 py-2 text-white/40 font-normal">Size</th>
                      <th className="px-2 py-2 text-white/40 font-normal">Sent</th>
                      <th className="px-2 py-2 text-white/40 font-normal">Received</th>
                      <th className="px-2 py-2 text-white/40 font-normal">Rejected</th>
                      <th className="px-2 py-2 text-green-300 font-normal">Good</th>
                      {sources.map((s, i) => (
                        <th key={i} className="px-2 py-2 text-white/50 font-normal whitespace-nowrap"
                          title={`${s.client} — ${s.orderLabel}`}>
                          {s.client.length > 10 ? s.client.slice(0, 10) + '…' : s.client}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-white/50 font-normal">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const over = allocatedTotal(l) > l.good;
                      return (
                        <tr key={l.size} className="border-b border-white/5">
                          <td className="px-3 py-1.5 text-white font-medium">{l.size}</td>
                          <td className="px-2 py-1.5 text-center text-white/50">{l.sent}</td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" disabled={!canEdit} value={l.received || ''}
                              onChange={e => updateLine(i, { received: Math.max(0, Number(e.target.value) || 0) })}
                              placeholder="0"
                              className="w-14 bg-white/5 border border-white/10 rounded px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-[#534AB7]" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" disabled={!canEdit} value={l.rejected || ''}
                              onChange={e => updateLine(i, { rejected: Math.max(0, Number(e.target.value) || 0) })}
                              placeholder="0"
                              className="w-14 bg-white/5 border border-white/10 rounded px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-[#534AB7]" />
                          </td>
                          <td className={`px-2 py-1.5 text-center font-bold ${over ? 'text-red-400' : 'text-green-300'}`}>{l.good}</td>
                          {sources.map((s, si) => {
                            const ordered = demandOf(sources, si, l.size);
                            const want = remainingOf(sources, si, l.size, already);
                            const had = already(si, l.size);
                            const got = l.alloc[si] ?? 0;
                            const short = want - got;
                            return (
                              <td key={si} className="px-2 py-1.5 text-center">
                                {ordered > 0 ? (
                                  <>
                                    <input type="number" min="0" max={want} disabled={!canEdit} value={got || ''}
                                      onChange={e => setAlloc(i, si, e.target.value)} placeholder="0"
                                      title={`${s.client} ordered ${ordered}${had ? ` · already has ${had}` : ''} · still owed ${want}`}
                                      className={`w-12 bg-white/5 border rounded px-1 py-1 text-white text-xs text-center focus:outline-none ${
                                        got > want ? 'border-red-500' : 'border-white/10 focus:border-[#534AB7]'}`} />
                                    <div className={`text-[9px] mt-0.5 ${short > 0 ? 'text-amber-400' : 'text-white/25'}`}>
                                      {short > 0 ? `short ${short}` : `of ${want}`}{had ? ` (+${had} earlier)` : ''}
                                    </div>
                                  </>
                                ) : <span className="text-white/15">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" disabled={!canEdit} value={l.toStock || ''}
                              onChange={e => updateLine(i, { toStock: Math.max(0, Number(e.target.value) || 0) })}
                              placeholder="0"
                              className="w-12 bg-white/5 border border-white/10 rounded px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-[#534AB7]" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-4 text-xs flex-wrap">
                <span className="text-white/50">Received: <b className="text-white">{totalReceived}</b></span>
                <span className="text-white/50">Good: <b className="text-green-300">{totalGood}</b></span>
                <span className="text-white/50">Allocated: <b className={totalAllocated > totalGood ? 'text-red-400' : 'text-[#a89fff]'}>{totalAllocated}</b></span>
                {totalGood - totalAllocated > 0 && (
                  <span className="text-amber-300">{totalGood - totalAllocated} not yet allocated</span>
                )}
              </div>

              {!validation.ok && (
                <div className="border border-red-500/40 bg-red-500/10 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-300 mb-1">Please fix before saving:</p>
                  <ul className="text-xs text-red-200/90 list-disc pl-4 space-y-0.5">
                    {validation.problems.slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-white/35 leading-relaxed">
                Saving records what came back against each customer's own order, and puts any
                leftover into finished-goods stock. Existing tick-boxes are left untouched.
              </p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm transition-colors">Cancel</button>
          <button onClick={confirm} disabled={!canEdit || saving || !design || !validation.ok}
            className="px-4 py-2 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
            {saving ? 'Saving…' : 'Confirm allocation'}
          </button>
        </div>
      </div>
    </div>
  );
}
