import { useState } from 'react';
import type { AppData, Order, VendorOrder } from '../../types';
import {
  voQty, voSizeStr, addCandidatesFor, addSourceToVendorDesign, unlinkSourceFromVendorDesign,
  type AddCandidate,
} from '../../lib/vendorWhoUtils';

interface Props {
  data: AppData;
  vo: VendorOrder;
  vendorDesignId: string;
  canEdit: boolean;
  onChange: (patch: { vendorOrders: VendorOrder[]; orders: Order[] }, auditDetail: string) => void;
  onClose: () => void;
}

// Ports Phase 1's _openVOWhoModal() — view who a pooled vendor-order row is
// for, unlink a customer (their row reappears on Pooling), or link in
// another customer order that shares the same design code and hasn't been
// sent to a vendor yet.
export default function VendorWhoModal({ data, vo, vendorDesignId, canEdit, onChange, onClose }: Props) {
  const [showAdd, setShowAdd] = useState(false);

  // Read fresh from `data` every render so an add/unlink is reflected
  // immediately without needing to close and reopen the modal.
  const liveVo = data.vendorOrders?.find(v => v.id === vo.id) ?? vo;
  const vd = liveVo.designs?.find(d => d.id === vendorDesignId);

  const sources = vd?.sources ?? [];
  // Cheap merge (a couple of size keys) — not worth memoizing, and `vd` is a
  // fresh object every render anyway (re-derived from `data` above).
  const extraSizes: Record<string, number> = {};
  Object.entries(vd?.bufferSizes ?? {}).forEach(([sz, n]) => { extraSizes[sz] = (extraSizes[sz] ?? 0) + (Number(n) || 0); });
  Object.entries(vd?.stockSizes ?? {}).forEach(([sz, n]) => { extraSizes[sz] = (extraSizes[sz] ?? 0) + (Number(n) || 0); });
  const extraQty = voQty(extraSizes);

  const rowTotal = voQty(vd?.sizes);
  const rowUnit = vd?.unit || 'pcs';
  const accounted = sources.reduce((a, s) => a + voQty(s.sizes), 0) + extraQty;
  const mismatch = accounted !== rowTotal;
  const addends = [...sources.map(s => voQty(s.sizes)), ...(extraQty ? [extraQty] : [])];

  const code = (vd?.code || '').trim();
  // Not memoized — `sources`/`vd` are freshly derived from `data` above (a
  // handful of items at most), and candidates only need computing while the
  // add panel is actually open.
  const linkedKeys = new Set(sources.map(s => `${s.orderDbId}|${s.designId}|${s.varietyId ?? ''}`));
  const candidates = showAdd ? addCandidatesFor(data, code, linkedKeys) : [];

  if (!vd) return null;

  function handleUnlink(si: number) {
    const src = sources[si];
    const qty = voQty(src.sizes);
    if (!confirm(`Remove ${src.client || 'this customer'} (${src.orderLabel || 'CO'}) from this row?\n\nTheir ${qty} pcs will come back out of this vendor row, and their order row will reappear on the Pooling board.`)) return;
    const result = unlinkSourceFromVendorDesign(data, liveVo, vendorDesignId, si);
    if (!result) return;
    onChange(result, `Unlinked ${src.client || ''} (${src.orderLabel || ''}) from ${vd?.code || vd?.name || 'row'} in ${liveVo.orderId}`);
  }

  function handleAdd(candidate: AddCandidate, allowOverride = false) {
    const result = addSourceToVendorDesign(data, liveVo, vendorDesignId, candidate, allowOverride);
    if (result.ok) {
      onChange(result, `Added ${candidate.client} (${candidate.orderLabel}) to ${vd?.code || vd?.name || 'row'} in ${liveVo.orderId}`);
      return;
    }
    if (result.reason === 'conflict') {
      const ok = confirm(
        `Design "${vd?.code || ''}" in ${candidate.orderLabel} already has "${result.current}" as ${result.label}.\n\n` +
        `Replace with "${liveVo.vendor}"?\n\n(Click Cancel to leave this customer out of the vendor order.)`,
      );
      if (ok) handleAdd(candidate, true);
      return;
    }
    if (result.reason === 'unit-undefined') {
      alert(`"${result.badUnit}" has no piece-count set — add it in Masters → Units before adding this customer.`);
      return;
    }
    alert('That customer order row could not be found — it may have been deleted.');
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-lg p-5 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-sm font-bold text-[#a89fff]">👥 Who is this row for?</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Design <strong className="text-white/70">{code || '—'}</strong> in <strong className="text-white/70">{liveVo.orderId}</strong> — {rowTotal} {rowUnit} total
          </p>
        </div>

        {sources.length === 0 && (
          <p className="text-xs text-white/30 text-center py-3">No customer linked to this row yet.</p>
        )}

        <div className="flex flex-col gap-1.5">
          {sources.map((s, si) => (
            <div key={si} className="flex items-start gap-2.5 border border-[#534AB7]/25 rounded-lg px-3 py-2 bg-white/3">
              <span className="text-[10px] font-bold text-white bg-[#534AB7] rounded px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap">{s.orderLabel || 'CO'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{s.client}</p>
                <p className="text-[10px] text-white/40 mt-0.5">{voSizeStr(s.sizes)}</p>
              </div>
              <span className="text-[13px] font-bold text-[#a89fff] flex-shrink-0">{voQty(s.sizes)}</span>
              {canEdit && (
                <button onClick={() => handleUnlink(si)}
                  className="text-[10px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/40 rounded px-2 py-1 flex-shrink-0">
                  ✕ Unlink
                </button>
              )}
            </div>
          ))}

          {extraQty > 0 && (
            <div className="flex items-start gap-2.5 border border-dashed border-white/15 rounded-lg px-3 py-2 bg-white/3">
              <span className="text-[10px] font-bold text-white bg-white/20 rounded px-1.5 py-0.5 flex-shrink-0">Extra</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white/70">Buffer/stock — nobody's</p>
                <p className="text-[10px] text-white/40 mt-0.5">{voSizeStr(extraSizes)}</p>
              </div>
              <span className="text-[13px] font-bold text-white/50 flex-shrink-0">{extraQty}</span>
            </div>
          )}
        </div>

        {canEdit && (
          showAdd ? (
            candidates.length ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] text-white/30">Add which customer order?</p>
                {candidates.map((c, ci) => (
                  <button key={ci} onClick={() => handleAdd(c)}
                    className="flex items-start gap-2.5 border border-[#534AB7]/30 hover:bg-[#534AB7]/10 rounded-lg px-3 py-2 text-left transition-colors">
                    <span className="text-[10px] font-bold text-white bg-[#534AB7] rounded px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap">{c.orderLabel || 'CO'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate">{c.client}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">{voSizeStr(c.sizes)}</p>
                    </div>
                    <span className="text-[13px] font-bold text-[#a89fff] flex-shrink-0">{c.qty} <span className="text-[10px] font-medium text-white/40">{c.unit}</span></span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/30 text-center py-2.5 border border-dashed border-white/15 rounded-lg">
                No other customer order has design "{code}" waiting to be pooled.
              </p>
            )
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="border border-dashed border-[#534AB7]/40 rounded-lg py-2 text-center text-[#a89fff] text-xs font-semibold">
              + Add another customer order
            </button>
          )
        )}

        <div className={`flex justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-bold ${mismatch ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5 text-[#a89fff]'}`}>
          <span>Row total ({rowTotal})</span>
          <span className={mismatch ? 'text-amber-300' : 'text-green-400'}>
            {mismatch ? '⚠ ' : '✓ '}
            {addends.length ? `${addends.join(' + ')} = ` : ''}{accounted}
            {mismatch ? ` — ${Math.abs(rowTotal - accounted)} ${rowUnit} unaccounted for` : ' — matches'}
          </span>
        </div>
        {mismatch && (
          <p className="text-[11px] text-amber-300/70 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2">
            This row's numbers were changed by hand after pooling, so they no longer match the customers behind it. Nothing is broken — the difference is simply untracked, like Buffer.
          </p>
        )}

        <button onClick={onClose} className="self-end text-xs font-semibold bg-white/10 hover:bg-white/15 rounded-lg px-4 py-2 text-white">Close</button>
      </div>
    </div>
  );
}
