import type { AppData, Order, VendorOrder, VendorOrderType, VendorDesign, PoolSource, VendorPipelineFields, EmbeddedDesign, DesignVariety } from '../types';
import { setPipeVendor, setPlatingVendor, setKarigarVendor } from './coStageUtils';
import { catalogRows } from './familyUtils';

// ─── "Who is this row for?" — multi-customer vendor-order rows ───────────────
// Ports Phase 1's _openVOWhoModal()/_voWhoAdd()/_voWhoUnlink() (and its
// Sept 2026 correction pass — f9879a2, 70cf572, dabb3cf, 84986c4, 6a3db87,
// 762d811) exactly. A pooled vendor-order design carries `sources[]` (see
// poolUtils.ts's buildVendorDesigns) recording which customer contributed
// how much; this lets the owner view that after the fact, unlink a customer
// (their row reappears on Pooling), or link in another customer order
// sharing the same design code that hasn't been sent to a vendor yet.

export const voQty = (sizes?: Record<string, number>): number =>
  Object.values(sizes ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);

export function voSizeStr(sizes?: Record<string, number>): string {
  return Object.keys(sizes ?? {})
    .filter(k => (Number(sizes![k]) || 0) > 0)
    .sort((a, b) => {
      const na = Number((a || '').split('/')[1]) || 0, nb = Number((b || '').split('/')[1]) || 0;
      return na !== nb ? na - nb : a.localeCompare(b);
    })
    .map(k => `${k}: ${sizes![k]}`)
    .join(' · ');
}

type CoVendorField = 'pipeVendor' | 'platingVendor' | 'assignedVendor';

export function coVendorField(type: VendorOrderType | undefined): CoVendorField {
  return type === 'pipe' ? 'pipeVendor' : type === 'plating' ? 'platingVendor' : 'assignedVendor';
}

function setCoVendorField<T extends VendorPipelineFields>(holder: T, type: VendorOrderType | undefined, name: string): T {
  if (type === 'pipe') return setPipeVendor(holder, name);
  if (type === 'plating') return setPlatingVendor(holder, name);
  return setKarigarVendor(holder, name);
}

// Rounds only to clean up floating-point noise (e.g. 0.30000000000000004
// from repeated fraction math) — never to hide a real fractional piece.
// Deliberately NOT rounded to whole numbers: doing that once made a real
// 1-jotta/2-pair surplus look like it "matched exactly" (owner-corrected).
const clean = (n: number): number => Math.round(n * 10000) / 10000;

// How many actual bangle pieces one unit contains — owner-defined in
// Masters → Units, with a safety-net default so conversion still works
// before the owner has ever configured it. null = genuinely unknown, which
// callers must refuse to guess past (never silently treat as 1).
const DEFAULT_UNIT_PIECES: Record<string, number> = { pcs: 1, pairs: 2, jotta: 4 };

export function unitPieces(data: AppData, unit: string): number | null {
  const u = (unit || 'pcs').trim() || 'pcs';
  const map = data.vocabulary?.unitPieces ?? {};
  const n = Number(map[u]);
  if (n > 0) return n;
  return DEFAULT_UNIT_PIECES[u] ?? null;
}

// A flat/CNC vendor design's real unit can live on the design itself OR on
// its single legacy "Default" variety (same quirk the customer side already
// works around in familyUtils.ts) — reading vd.unit alone silently defaulted
// to "pcs" for any row whose real unit sat on the Default variety instead.
export function rowUnit(vd: VendorDesign): string {
  const varieties = vd.varieties ?? [];
  const hasOnlyDefault = varieties.length === 1 && (varieties[0].name || '').trim().toLowerCase() === 'default';
  return (hasOnlyDefault ? (varieties[0].unit || vd.unit) : vd.unit) || 'pcs';
}

// Backward-compat merge for vendor designs created before Buffer/Stock were
// combined into one "Extra" field — plain merge would silently DROP one
// side's number whenever both had the same size key. Sum instead.
function mergedLegacyExtra(vd: VendorDesign): Record<string, number> {
  const out: Record<string, number> = { ...(vd.bufferSizes ?? {}) };
  Object.entries(vd.stockSizes ?? {}).forEach(([sz, n]) => { out[sz] = (out[sz] ?? 0) + (Number(n) || 0); });
  return out;
}

function extraSizesOf(vd: VendorDesign): Record<string, number> {
  return vd.extraSizes ?? mergedLegacyExtra(vd);
}

// Picks whichever unit, among the row's own unit and every customer actually
// linked to it, has the SMALLER piece-count (the finer-grained one) — jotta
// (4 pcs) vs pairs (2 pcs) picks pairs. A surplus/shortfall recorded as
// Extra then reads as a real whole quantity instead of a decimal.
export function finerUnitFor(data: AppData, vd: VendorDesign): string {
  const ru = rowUnit(vd);
  const units = [ru, ...(vd.sources ?? []).map(s => s.origUnit).filter((u): u is string => !!u)];
  let best = ru, bestPieces = unitPieces(data, ru) ?? Infinity;
  units.forEach(u => {
    const p = unitPieces(data, u);
    if (p && p < bestPieces) { best = u; bestPieces = p; }
  });
  return best;
}

// Once Extra already has something recorded in a unit, keep using that same
// unit so it never silently mixes two units in one field.
export function extraUnitOf(data: AppData, vd: VendorDesign): string {
  if (vd.extraUnit && voQty(vd.extraSizes) > 0) return vd.extraUnit;
  return finerUnitFor(data, vd);
}

// How much of a row's Extra (stored in its own extraUnit) equals in the
// ROW's own unit, per size — used everywhere Extra needs to be compared
// against sources/sizes that are already in the row's unit.
export function extraInRowUnit(data: AppData, vd: VendorDesign): Record<string, number> {
  const extra = extraSizesOf(vd);
  const ru = rowUnit(vd);
  const eu = vd.extraUnit || ru; // legacy Extra with no unit tag was always stored in the row's own unit
  const rowPcs = unitPieces(data, ru), extraPcs = unitPieces(data, eu);
  const factor = (rowPcs && extraPcs) ? extraPcs / rowPcs : 1;
  const out: Record<string, number> = {};
  Object.entries(extra).forEach(([sz, n]) => { out[sz] = clean((Number(n) || 0) * factor); });
  return out;
}

// Per size, how far off a row is from what's actually linked to it (sources)
// plus Extra: positive = row has more than accounted for (genuine surplus,
// or a customer not yet added), negative = row has less (a size was edited
// down, or a manually-typed row's customers need more than it currently has).
export function remainderBySize(data: AppData, vd: VendorDesign, sourcesOverride?: PoolSource[]): {
  remainder: Record<string, number>; anyNegative: boolean; anyPositive: boolean;
} {
  const sources = sourcesOverride ?? vd.sources ?? [];
  const extra = extraInRowUnit(data, vd);
  const szKeys = new Set([...Object.keys(vd.sizes ?? {}), ...sources.flatMap(s => Object.keys(s.sizes ?? {})), ...Object.keys(extra)]);
  const remainder: Record<string, number> = {};
  let anyNegative = false, anyPositive = false;
  szKeys.forEach(sz => {
    const total = Number(vd.sizes?.[sz]) || 0;
    const fromSources = sources.reduce((a, s) => a + (Number(s.sizes?.[sz]) || 0), 0);
    const fromExtra = Number(extra[sz]) || 0;
    const diff = clean(total - fromSources - fromExtra);
    if (diff !== 0) remainder[sz] = diff;
    if (diff > 0) anyPositive = true;
    if (diff < 0) anyNegative = true;
  });
  return { remainder, anyNegative, anyPositive };
}

// ─── Resolving a source back to its live customer-order holder ───────────────

export interface SourceHolder {
  order: Order;
  design: EmbeddedDesign;
  holder: EmbeddedDesign | DesignVariety;
}

export function findSourceHolder(orders: Order[], src: { orderDbId: string; designId: string; varietyId: string | null }): SourceHolder | null {
  const order = orders.find(o => o.id === src.orderDbId);
  if (!order) return null;
  const design = order.designs.find(d => d.id === src.designId);
  if (!design) return null;
  const holder = src.varietyId ? (design.varieties ?? []).find(v => v.id === src.varietyId) : design;
  if (!holder) return null;
  return { order, design, holder };
}

// ─── Candidates: other customer orders with this same code, not yet sent ─────

export interface AddCandidate {
  orderDbId: string;
  orderLabel: string;
  client: string;
  designId: string;
  varietyId: string | null;
  sizes: Record<string, number>;
  qty: number;
  unit: string;
}

export function addCandidatesFor(data: AppData, code: string, linkedKeys: Set<string>): AddCandidate[] {
  const c = (code || '').trim();
  if (!c) return [];
  const orders = data.orders ?? [];
  const out: AddCandidate[] = [];
  catalogRows(data).forEach(row => {
    if ((row.code || '').trim() !== c || row.qty <= 0) return;
    const key = `${row.orderDbId}|${row.designId}|${row.varietyId ?? ''}`;
    if (linkedKeys.has(key)) return;
    const found = findSourceHolder(orders, { orderDbId: row.orderDbId, designId: row.designId, varietyId: row.varietyId });
    if (!found || found.holder.importedToVOId) return;
    out.push({
      orderDbId: row.orderDbId, orderLabel: row.orderLabel, client: row.client,
      designId: row.designId, varietyId: row.varietyId,
      sizes: { ...row.sizes }, qty: row.qty, unit: row.unit || 'pcs',
    });
  });
  return out;
}

// ─── Adding a candidate onto an existing vendor-order row ────────────────────

export interface SurplusOffer { unit: string; total: number; bySize: Record<string, number> }

export type AddSourceOutcome =
  | { ok: true; vendorOrders: VendorOrder[]; orders: Order[]; grew: boolean; offerSweepSurplus?: SurplusOffer }
  | { ok: false; reason: 'unit-undefined'; badUnit: string }
  | { ok: false; reason: 'conflict'; current: string; label: string }
  | { ok: false; reason: 'shortfall-confirm'; shortfallTotal: number; unit: string }
  | { ok: false; reason: 'not-found' };

export interface AddSourceOpts {
  /** Pass true only after the owner confirmed overwriting an existing
   *  Pipe/Karigar/Plating value on the customer's row. */
  allowConflictOverride?: boolean;
  /** Pass true only after the owner confirmed linking despite this row
   *  (a manually-typed one) having less than its customers now need. */
  allowShortfall?: boolean;
}

/**
 * Links one candidate customer-order row onto a vendor-order design.
 *
 * A row built by Pooling IS DEFINED as the sum of its customers — linking
 * here grows it, exactly as before. A row that was typed by hand (or
 * inherited from data older than the multi-customer system) has its own
 * independently-decided quantity — linking here does NOT change it; the
 * link is recorded, and any gap between the row's quantity and what's now
 * linked is surfaced instead (see remainderBySize / sweepRemainderToExtra /
 * growRowToMatchSources), never silently added on top. This is the exact
 * real bug Phase 1 shipped and fixed (a manually-typed 51 jotta became 102
 * the instant one customer was linked) — see `manualSizes` on VendorDesign.
 */
export function addSourceToVendorDesign(
  data: AppData,
  vo: VendorOrder,
  vendorDesignId: string,
  candidate: AddCandidate,
  opts: AddSourceOpts = {},
): AddSourceOutcome {
  const orders = data.orders ?? [];
  const found = findSourceHolder(orders, candidate);
  if (!found) return { ok: false, reason: 'not-found' };

  const field = coVendorField(vo.type);
  const label = vo.type === 'pipe' ? 'Pipe' : vo.type === 'plating' ? 'Plating' : 'Karigar';
  const cur = found.holder[field];
  if (!opts.allowConflictOverride && vo.vendor && cur && cur !== vo.vendor) {
    return { ok: false, reason: 'conflict', current: cur, label };
  }

  const vendorOrder = (data.vendorOrders ?? []).find(v => v.id === vo.id);
  const vd = vendorOrder?.designs?.find(d => d.id === vendorDesignId);
  if (!vd) return { ok: false, reason: 'not-found' };

  const ru = rowUnit(vd);
  const candPcs = unitPieces(data, candidate.unit);
  const rowPcs = unitPieces(data, ru);
  if (!candPcs || !rowPcs) {
    return { ok: false, reason: 'unit-undefined', badUnit: !candPcs ? candidate.unit : ru };
  }

  const factor = candPcs / rowPcs;
  const convSizes: Record<string, number> = {};
  Object.entries(candidate.sizes).forEach(([sz, n]) => {
    const q = Number(n) || 0;
    if (q > 0) convSizes[sz] = clean(q * factor);
  });

  // A pooled row is never empty of sources while carrying a real quantity
  // (buildVendorDesigns always seeds both together) — so a row with NO
  // sources yet but a non-zero quantity can only be manually-typed / legacy
  // data getting its first link. Once flagged, it stays flagged.
  const isFirstLink = !(vd.sources?.length);
  const existingTotal = voQty(vd.sizes);
  const grow = !vd.manualSizes && (!isFirstLink || existingTotal === 0);

  if (!grow) {
    const hypotheticalSources = [...(vd.sources ?? []), { sizes: convSizes } as PoolSource];
    const { remainder } = remainderBySize(data, vd, hypotheticalSources);
    const shortfallTotal = clean(Object.values(remainder).filter(n => n < 0).reduce((a, n) => a - n, 0));
    if (shortfallTotal > 0 && !opts.allowShortfall) {
      return { ok: false, reason: 'shortfall-confirm', shortfallTotal, unit: ru };
    }
  }

  const newSource: PoolSource = {
    orderDbId: candidate.orderDbId, orderLabel: candidate.orderLabel, client: candidate.client,
    designId: candidate.designId, varietyId: candidate.varietyId, sizes: convSizes,
    origUnit: candidate.unit, origSizes: { ...candidate.sizes },
  };

  let updatedVd: VendorDesign | null = null;
  const nextVendorOrders = (data.vendorOrders ?? []).map(v => {
    if (v.id !== vo.id) return v;
    return {
      ...v,
      designs: (v.designs ?? []).map(d => {
        if (d.id !== vendorDesignId) return d;
        let sizes = d.sizes;
        if (grow) {
          sizes = { ...(d.sizes ?? {}) };
          Object.entries(convSizes).forEach(([sz, q]) => { sizes![sz] = clean((Number(sizes![sz]) || 0) + q); });
        }
        const next: VendorDesign = { ...d, sizes, sources: [...(d.sources ?? []), newSource] };
        if (!grow && isFirstLink) next.manualSizes = true;
        updatedVd = next;
        return next;
      }),
    };
  });

  const nextOrders = orders.map(o => {
    if (o.id !== candidate.orderDbId) return o;
    return {
      ...o,
      designs: o.designs.map(d => {
        if (d.id !== candidate.designId) return d;
        if (candidate.varietyId === null) {
          let next = { ...d, importedToVOId: vo.id };
          if (vo.vendor) next = setCoVendorField(next, vo.type, vo.vendor);
          return next;
        }
        return {
          ...d,
          varieties: (d.varieties ?? []).map(v => {
            if (v.id !== candidate.varietyId) return v;
            let next = { ...v, importedToVOId: vo.id };
            if (vo.vendor) next = setCoVendorField(next, vo.type, vo.vendor);
            return next;
          }),
        };
      }),
    };
  });

  // If this leaves a clean SURPLUS (never mixed with a shortfall elsewhere
  // on the same row), offer to record it as Extra right away instead of
  // leaving it as a banner the owner has to notice separately.
  let offerSweepSurplus: SurplusOffer | undefined;
  if (!grow && updatedVd) {
    const { remainder, anyNegative } = remainderBySize(data, updatedVd);
    if (!anyNegative) {
      const surplus: Record<string, number> = {};
      Object.entries(remainder).forEach(([sz, n]) => { if (n > 0) surplus[sz] = n; });
      if (Object.keys(surplus).length) {
        const extraUnit = extraUnitOf(data, updatedVd);
        const extraPcs = unitPieces(data, extraUnit), rowPcsForExtra = unitPieces(data, ru);
        const toExtra = (rowPcsForExtra && extraPcs) ? rowPcsForExtra / extraPcs : 1;
        const bySize: Record<string, number> = {};
        let total = 0;
        Object.entries(surplus).forEach(([sz, n]) => { const v = clean(n * toExtra); bySize[sz] = v; total += v; });
        if (total > 0) offerSweepSurplus = { unit: extraUnit, total: clean(total), bySize };
      }
    }
  }

  return { ok: true, vendorOrders: nextVendorOrders, orders: nextOrders, grew: grow, offerSweepSurplus };
}

// ─── Unlinking a source from a vendor-order row ───────────────────────────────

export function unlinkSourceFromVendorDesign(
  data: AppData,
  vo: VendorOrder,
  vendorDesignId: string,
  sourceIndex: number,
): { vendorOrders: VendorOrder[]; orders: Order[]; willShrink: boolean } | null {
  const vendorOrder = (data.vendorOrders ?? []).find(v => v.id === vo.id);
  const vd = vendorOrder?.designs?.find(d => d.id === vendorDesignId);
  const src = vd?.sources?.[sourceIndex];
  if (!vd || !src) return null;

  // A manually-typed row's own quantity is never touched by linking (see
  // addSourceToVendorDesign) — so unlinking must symmetrically leave it
  // alone too, instead of subtracting a customer's pieces out of a number
  // the owner decided independently.
  const willShrink = !vd.manualSizes;

  const nextVendorOrders = (data.vendorOrders ?? []).map(v => {
    if (v.id !== vo.id) return v;
    return {
      ...v,
      designs: (v.designs ?? []).map(d => {
        if (d.id !== vendorDesignId) return d;
        let sizes = d.sizes;
        if (willShrink) {
          sizes = { ...(d.sizes ?? {}) };
          Object.entries(src.sizes ?? {}).forEach(([sz, n]) => {
            const q = Number(n) || 0;
            if (q <= 0) return;
            const next = Math.max(0, clean((Number(sizes![sz]) || 0) - q));
            if (next <= 0) delete sizes![sz]; else sizes![sz] = next;
          });
        }
        return { ...d, sizes, sources: (d.sources ?? []).filter((_, i) => i !== sourceIndex) };
      }),
    };
  });

  const orders = data.orders ?? [];
  const field = coVendorField(vo.type);
  const nextOrders = orders.map(o => {
    if (o.id !== src.orderDbId) return o;
    return {
      ...o,
      designs: o.designs.map(d => {
        if (d.id !== src.designId) return d;
        if (src.varietyId === null) {
          if (d.importedToVOId !== vo.id && !d.importedToVOId) return d;
          const next: EmbeddedDesign = { ...d };
          delete next.importedToVOId;
          return (vo.vendor && next[field] === vo.vendor) ? setCoVendorField(next, vo.type, '') : next;
        }
        return {
          ...d,
          varieties: (d.varieties ?? []).map(v => {
            if (v.id !== src.varietyId) return v;
            const next: DesignVariety = { ...v };
            delete next.importedToVOId;
            return (vo.vendor && next[field] === vo.vendor) ? setCoVendorField(next, vo.type, '') : next;
          }),
        };
      }),
    };
  });

  return { vendorOrders: nextVendorOrders, orders: nextOrders, willShrink };
}

/**
 * Records a `SurplusOffer` (as returned inline by addSourceToVendorDesign)
 * into a vendor design's Extra field. Takes an ALREADY-UPDATED vendorOrders
 * array — the one addSourceToVendorDesign just produced — rather than
 * re-deriving the surplus from fresh `data`, which would still be the
 * pre-add state at the moment the owner confirms the follow-up prompt (the
 * add itself is saved asynchronously). This is the one write in this file
 * that composes with another instead of reading `data` fresh, precisely to
 * avoid computing against stale numbers.
 */
export function applySurplusOffer(vendorOrders: VendorOrder[], voId: string, vendorDesignId: string, offer: SurplusOffer): VendorOrder[] {
  return vendorOrders.map(v => {
    if (v.id !== voId) return v;
    return {
      ...v,
      designs: (v.designs ?? []).map(d => {
        if (d.id !== vendorDesignId) return d;
        const extraSizes = { ...(d.extraSizes ?? mergedLegacyExtra(d)) };
        Object.entries(offer.bySize).forEach(([sz, n]) => { extraSizes[sz] = clean((Number(extraSizes[sz]) || 0) + n); });
        const next: VendorDesign = { ...d, extraSizes, extraUnit: offer.unit };
        delete next.bufferSizes; delete next.stockSizes;
        return next;
      }),
    };
  });
}

// ─── Explicit reconciliation actions (sweep surplus / grow to match) ─────────

export type SweepOutcome =
  | { ok: true; vendorOrders: VendorOrder[]; total: number; unit: string; bySize: Record<string, number> }
  | { ok: false; reason: 'has-shortfall' | 'nothing-to-sweep' };

/** Takes whatever a row has left over after its sources + existing Extra are
 *  subtracted out, and records THAT — per size — as Extra stock. Refuses if
 *  the row is instead SHORT of what's linked (needs growRowToMatchSources,
 *  or a size fixed by hand, not a sweep). */
export function sweepRemainderToExtra(data: AppData, vo: VendorOrder, vendorDesignId: string): SweepOutcome {
  const vendorOrder = (data.vendorOrders ?? []).find(v => v.id === vo.id);
  const vd = vendorOrder?.designs?.find(d => d.id === vendorDesignId);
  if (!vd) return { ok: false, reason: 'nothing-to-sweep' };

  const { remainder, anyNegative } = remainderBySize(data, vd);
  if (anyNegative) return { ok: false, reason: 'has-shortfall' };
  const surplus: Record<string, number> = {};
  Object.entries(remainder).forEach(([sz, n]) => { if (n > 0) surplus[sz] = n; });
  if (!Object.keys(surplus).length) return { ok: false, reason: 'nothing-to-sweep' };

  const ru = rowUnit(vd);
  const extraUnit = extraUnitOf(data, vd);
  const rowPcs = unitPieces(data, ru), extraPcs = unitPieces(data, extraUnit);
  const factor = (rowPcs && extraPcs) ? rowPcs / extraPcs : 1;
  const bySize: Record<string, number> = {};
  Object.entries(surplus).forEach(([sz, n]) => { bySize[sz] = clean(n * factor); });
  const total = clean(Object.values(bySize).reduce((a, n) => a + n, 0));

  const nextVendorOrders = (data.vendorOrders ?? []).map(v => {
    if (v.id !== vo.id) return v;
    return {
      ...v,
      designs: (v.designs ?? []).map(d => {
        if (d.id !== vendorDesignId) return d;
        const extraSizes = { ...(d.extraSizes ?? mergedLegacyExtra(d)) };
        Object.entries(bySize).forEach(([sz, n]) => { extraSizes[sz] = clean((Number(extraSizes[sz]) || 0) + n); });
        const next: VendorDesign = { ...d, extraSizes, extraUnit };
        delete next.bufferSizes; delete next.stockSizes; // fully migrated into the merged Extra field now
        return next;
      }),
    };
  });

  return { ok: true, vendorOrders: nextVendorOrders, total, unit: extraUnit, bySize };
}

export type GrowOutcome =
  | { ok: true; vendorOrders: VendorOrder[]; total: number; unit: string; bySize: Record<string, number> }
  | { ok: false; reason: 'has-surplus' | 'nothing-short' };

/** The mirror of the sweep above: the customers linked to this row need MORE
 *  made than it currently has. Raises each short size up to match; never
 *  lowers anything, and refuses if the row is instead ahead (that's what
 *  Extra is for). */
export function growRowToMatchSources(data: AppData, vo: VendorOrder, vendorDesignId: string): GrowOutcome {
  const vendorOrder = (data.vendorOrders ?? []).find(v => v.id === vo.id);
  const vd = vendorOrder?.designs?.find(d => d.id === vendorDesignId);
  if (!vd) return { ok: false, reason: 'nothing-short' };

  const { remainder, anyPositive } = remainderBySize(data, vd);
  if (anyPositive) return { ok: false, reason: 'has-surplus' };
  const shortfall: Record<string, number> = {};
  Object.entries(remainder).forEach(([sz, n]) => { if (n < 0) shortfall[sz] = -n; });
  if (!Object.keys(shortfall).length) return { ok: false, reason: 'nothing-short' };
  const total = clean(Object.values(shortfall).reduce((a, n) => a + n, 0));
  const unit = rowUnit(vd);

  const nextVendorOrders = (data.vendorOrders ?? []).map(v => {
    if (v.id !== vo.id) return v;
    return {
      ...v,
      designs: (v.designs ?? []).map(d => {
        if (d.id !== vendorDesignId) return d;
        const sizes = { ...(d.sizes ?? {}) };
        Object.entries(shortfall).forEach(([sz, n]) => { sizes[sz] = clean((Number(sizes[sz]) || 0) + n); });
        return { ...d, sizes };
      }),
    };
  });

  return { ok: true, vendorOrders: nextVendorOrders, total, unit, bySize: shortfall };
}
