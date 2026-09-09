import { useState } from 'react';
import type { AppData, Order, VendorOrder } from '../../types';
import {
  voQty, voSizeStr, rowUnit, extraInRowUnit, remainderBySize, finerUnitFor,
  addCandidatesFor, addSourceToVendorDesign, unlinkSourceFromVendorDesign,
  sweepRemainderToExtra, growRowToMatchSources, applySurplusOffer,
  type AddCandidate,
} from '../../lib/vendorWhoUtils';

interface Props {
  data: AppData;
  vo: VendorOrder;
  vendorDesignId: string;
  canEdit: boolean;
  onChange: (patch: { vendorOrders: VendorOrder[]; orders?: Order[] }, auditDetail: string) => void;
  onClose: () => void;
}

// Ports Phase 1's _openVOWhoModal() — view who a pooled vendor-order row is
// for, unlink a customer (their row reappears on Pooling), or link in
// another customer order that shares the same design code and hasn't been
// sent to a vendor yet. Includes the Sept 2026 correction pass: a row built
// by Pooling still grows/shrinks as customers link/unlink (unchanged), but a
// manually-typed or legacy row's own quantity is never touched by linking —
// any gap is surfaced instead, with one-click "record as Extra" / "increase
// to match" actions, ported exactly (f9879a2, 70cf572, dabb3cf, 84986c4,
// 6a3db87, 762d811).
export default function VendorWhoModal({ data, vo, vendorDesignId, canEdit, onChange, onClose }: Props) {
  const [showAdd, setShowAdd] = useState(false);

  // Read fresh from `data` every render so an add/unlink is reflected
  // immediately without needing to close and reopen the modal.
  const liveVo = data.vendorOrders?.find(v => v.id === vo.id) ?? vo;
  const vd = liveVo.designs?.find(d => d.id === vendorDesignId);

  if (!vd) return null;

  const sources = vd.sources ?? [];
  const unit = rowUnit(vd);
  const extraSizes = extraInRowUnit(data, vd); // in the row's own unit, for display next to sources
  const extraQty = voQty(extraSizes);
  const rowTotal = voQty(vd.sizes);
  const { remainder, anyNegative, anyPositive } = remainderBySize(data, vd);
  const totalDiff = Object.values(remainder).reduce((a, n) => a + n, 0);
  const mismatch = Math.abs(totalDiff) > 1e-9;
  const accounted = rowTotal - totalDiff;
  const addends = [...sources.map(s => voQty(s.sizes)), ...(extraQty ? [extraQty] : [])];

  const code = (vd.code || '').trim();
  const linkedKeys = new Set(sources.map(s => `${s.orderDbId}|${s.designId}|${s.varietyId ?? ''}`));
  const candidates = showAdd ? addCandidatesFor(data, code, linkedKeys) : [];

  function handleUnlink(si: number) {
    const src = sources[si];
    const qty = voQty(src.sizes);
    const willShrink = !vd!.manualSizes;
    const msg = `Remove ${src.client || 'this customer'} (${src.orderLabel || 'CO'}) from this row?\n\n` + (
      willShrink
        ? `Their ${qty} ${unit} will come back out of this vendor row, and their order row will reappear on the Pooling board.`
        : `This row's own quantity stays exactly as it is — only the "who this is for" record is removed. Their order row will reappear on the Pooling board.`
    );
    if (!confirm(msg)) return;
    const result = unlinkSourceFromVendorDesign(data, liveVo, vendorDesignId, si);
    if (!result) return;
    onChange(result, `Unlinked ${src.client || ''} (${src.orderLabel || ''}) from ${vd!.code || vd!.name || 'row'} in ${liveVo.orderId}`);
  }

  function handleAdd(candidate: AddCandidate, opts: { allowConflictOverride?: boolean; allowShortfall?: boolean } = {}) {
    const result = addSourceToVendorDesign(data, liveVo, vendorDesignId, candidate, opts);

    if (!result.ok) {
      if (result.reason === 'conflict') {
        const ok = confirm(
          `Design "${vd!.code || ''}" in ${candidate.orderLabel} already has "${result.current}" as ${result.label}.\n\n` +
          `Replace with "${liveVo.vendor}"?\n\n(Click Cancel to leave this customer out of the vendor order.)`,
        );
        if (ok) handleAdd(candidate, { ...opts, allowConflictOverride: true });
        return;
      }
      if (result.reason === 'shortfall-confirm') {
        const proceed = confirm(
          `${candidate.client} ka order is row mein abhi jitna banaya ja raha hai usse zyada hai — ${result.shortfallTotal} ${result.unit} kam hai.\n\n` +
          `Customer order ki quantity vendor order se zyada hai jisse link karna hai. Aage badhein?`,
        );
        if (proceed) handleAdd(candidate, { ...opts, allowShortfall: true });
        else alert(`Link nahi hua — pehle row ki quantity badhao ya ${candidate.orderLabel} ka order check karo`);
        return;
      }
      if (result.reason === 'unit-undefined') {
        alert(`"${result.badUnit}" has no piece-count set — add it in Masters → Units before adding this customer.`);
        return;
      }
      alert('That customer order row could not be found — it may have been deleted.');
      return;
    }

    const addDetail = `${result.grew ? 'Added' : 'Linked'} ${candidate.client} (${candidate.orderLabel}) to ${vd!.code || vd!.name || 'row'} in ${liveVo.orderId}`;

    if (result.offerSweepSurplus) {
      const { total, unit: extraUnit } = result.offerSweepSurplus;
      if (confirm(`Is row mein ${total} ${extraUnit} zyada hai jo kisi customer ke liye nahi hai.\n\nIse Extra stock mein daal doon?`)) {
        // Compose onto the vendorOrders the add itself just produced (NOT
        // fresh `data`, which is still the pre-add state at this instant —
        // the add is saved asynchronously) so the surplus recorded matches
        // exactly what was just offered.
        const swept = applySurplusOffer(result.vendorOrders, liveVo.id, vendorDesignId, result.offerSweepSurplus);
        onChange({ vendorOrders: swept, orders: result.orders }, `${addDetail}; Extra stock recorded: +${total} ${extraUnit}`);
        return;
      }
    }
    onChange(result, addDetail);
  }

  function handleSweep() {
    const result = sweepRemainderToExtra(data, liveVo, vendorDesignId);
    if (!result.ok) {
      if (result.reason === 'has-shortfall') alert("Some sizes show less than what's already linked — fix those by hand first; only a genuine surplus can be swept to Extra.");
      else alert('Nothing left over — already fully accounted for.');
      return;
    }
    onChange({ vendorOrders: result.vendorOrders }, `Extra stock recorded: ${vo.orderId} › ${vd!.code || ''}: +${result.total} ${result.unit}`);
  }

  function handleGrow() {
    const result = growRowToMatchSources(data, liveVo, vendorDesignId);
    if (!result.ok) {
      if (result.reason === 'has-surplus') alert("Some sizes already show more than what's linked — that surplus belongs in Extra, not mixed with a shortfall elsewhere.");
      else alert('Nothing short — already fully accounted for.');
      return;
    }
    onChange({ vendorOrders: result.vendorOrders }, `Row increased to match customers: ${vo.orderId} › ${vd!.code || ''}: +${result.total} ${result.unit}`);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-lg p-5 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-sm font-bold text-[#a89fff]">👥 Who is this row for?</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Design <strong className="text-white/70">{code || '—'}</strong> in <strong className="text-white/70">{liveVo.orderId}</strong> — {rowTotal} {unit} total
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
          <span>Row total ({rowTotal} {unit})</span>
          <span className={mismatch ? 'text-amber-300' : 'text-green-400'}>
            {mismatch ? '⚠ ' : '✓ '}
            {addends.length ? `${addends.join(' + ')} = ` : ''}{accounted}
            {mismatch ? ` — ${Math.abs(totalDiff)} ${unit} unaccounted for` : ' — matches'}
          </span>
        </div>

        {mismatch && canEdit && (
          totalDiff > 0 ? (
            <div className="text-[11px] text-amber-300/80 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2">
              This row has <strong>{Object.values(remainder).reduce((a, n) => a + Math.max(n, 0), 0)} {finerUnitFor(data, vd)}</strong> more than what's linked above — either another customer order still needs adding, or that's genuine extra stock made beyond any order.
              <div className="mt-1.5">
                <button onClick={handleSweep} className="text-xs font-semibold bg-[#534AB7] hover:bg-[#453d9e] text-white rounded-lg px-3 py-1.5">
                  → Record as Extra stock
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-red-300/80 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
              This row shows <strong>{Math.abs(totalDiff)} {unit} less</strong> than what's linked above — either a size was edited down by hand, or the customers linked need more made than this row currently has.
              <div className="mt-1.5">
                <button onClick={handleGrow} className="text-xs font-semibold bg-[#534AB7] hover:bg-[#453d9e] text-white rounded-lg px-3 py-1.5">
                  → Increase this row by {Math.abs(totalDiff)} {unit} to match
                </button>
              </div>
            </div>
          )
        )}
        {mismatch && !canEdit && (
          <p className="text-[11px] text-amber-300/70 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2">
            {anyPositive && !anyNegative
              ? "This row has more linked than what's accounted for — either another customer order still needs adding, or it's genuine extra stock."
              : "This row shows less than what's linked above — a size may have been edited down by hand, or the linked customers need more than this row currently has."}
          </p>
        )}

        <button onClick={onClose} className="self-end text-xs font-semibold bg-white/10 hover:bg-white/15 rounded-lg px-4 py-2 text-white">Close</button>
      </div>
    </div>
  );
}
