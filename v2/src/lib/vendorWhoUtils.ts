import type { AppData, Order, VendorOrder, VendorOrderType, PoolSource, VendorPipelineFields, EmbeddedDesign, DesignVariety } from '../types';
import { setPipeVendor, setPlatingVendor, setKarigarVendor } from './coStageUtils';
import { catalogRows } from './familyUtils';

// ─── "Who is this row for?" — multi-customer vendor-order rows ───────────────
// Ports Phase 1's _openVOWhoModal()/_voWhoAdd()/_voWhoUnlink() exactly. A
// pooled vendor-order design carries `sources[]` (see poolUtils.ts's
// buildVendorDesigns) recording which customer contributed how much; this
// lets the owner view that after the fact, unlink a customer (their row
// reappears on Pooling), or link in another customer order sharing the same
// design code that hasn't been sent to a vendor yet.

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

export type AddSourceOutcome =
  | { ok: true; vendorOrders: VendorOrder[]; orders: Order[] }
  | { ok: false; reason: 'unit-undefined'; badUnit: string }
  | { ok: false; reason: 'conflict'; current: string; label: string }
  | { ok: false; reason: 'not-found' };

/**
 * Links one candidate customer-order row onto a vendor-order design.
 * `allowConflictOverride`: pass true only after the caller has already
 * confirmed with the owner that it's OK to replace an existing
 * Pipe/Karigar/Plating value on that customer's row (mirrors Phase 1's
 * confirm() gate — this function never shows its own confirm dialog).
 */
export function addSourceToVendorDesign(
  data: AppData,
  vo: VendorOrder,
  vendorDesignId: string,
  candidate: AddCandidate,
  allowConflictOverride = false,
): AddSourceOutcome {
  const orders = data.orders ?? [];
  const found = findSourceHolder(orders, candidate);
  if (!found) return { ok: false, reason: 'not-found' };

  const field = coVendorField(vo.type);
  const label = vo.type === 'pipe' ? 'Pipe' : vo.type === 'plating' ? 'Plating' : 'Karigar';
  const cur = found.holder[field];
  if (!allowConflictOverride && vo.vendor && cur && cur !== vo.vendor) {
    return { ok: false, reason: 'conflict', current: cur, label };
  }

  const vendorOrder = (data.vendorOrders ?? []).find(v => v.id === vo.id);
  const vd = vendorOrder?.designs?.find(d => d.id === vendorDesignId);
  const rowUnit = vd?.unit || 'pcs';
  const candPcs = unitPieces(data, candidate.unit);
  const rowPcs = unitPieces(data, rowUnit);
  if (!candPcs || !rowPcs) {
    return { ok: false, reason: 'unit-undefined', badUnit: !candPcs ? candidate.unit : rowUnit };
  }

  const factor = candPcs / rowPcs;
  const convSizes: Record<string, number> = {};
  Object.entries(candidate.sizes).forEach(([sz, n]) => {
    const q = Number(n) || 0;
    if (q > 0) convSizes[sz] = Math.round(q * factor * 100) / 100;
  });

  const newSource: PoolSource = {
    orderDbId: candidate.orderDbId, orderLabel: candidate.orderLabel, client: candidate.client,
    designId: candidate.designId, varietyId: candidate.varietyId, sizes: convSizes,
  };

  const nextVendorOrders = (data.vendorOrders ?? []).map(v => {
    if (v.id !== vo.id) return v;
    return {
      ...v,
      designs: (v.designs ?? []).map(d => {
        if (d.id !== vendorDesignId) return d;
        const sizes = { ...(d.sizes ?? {}) };
        Object.entries(convSizes).forEach(([sz, q]) => { sizes[sz] = Math.round(((Number(sizes[sz]) || 0) + q) * 100) / 100; });
        return { ...d, sizes, sources: [...(d.sources ?? []), newSource] };
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

  return { ok: true, vendorOrders: nextVendorOrders, orders: nextOrders };
}

// ─── Unlinking a source from a vendor-order row ───────────────────────────────

export function unlinkSourceFromVendorDesign(
  data: AppData,
  vo: VendorOrder,
  vendorDesignId: string,
  sourceIndex: number,
): { vendorOrders: VendorOrder[]; orders: Order[] } | null {
  const vendorOrder = (data.vendorOrders ?? []).find(v => v.id === vo.id);
  const vd = vendorOrder?.designs?.find(d => d.id === vendorDesignId);
  const src = vd?.sources?.[sourceIndex];
  if (!src) return null;

  const nextVendorOrders = (data.vendorOrders ?? []).map(v => {
    if (v.id !== vo.id) return v;
    return {
      ...v,
      designs: (v.designs ?? []).map(d => {
        if (d.id !== vendorDesignId) return d;
        const sizes = { ...(d.sizes ?? {}) };
        Object.entries(src.sizes ?? {}).forEach(([sz, n]) => {
          const q = Number(n) || 0;
          if (q <= 0) return;
          const next = Math.max(0, (Number(sizes[sz]) || 0) - q);
          if (next <= 0) delete sizes[sz]; else sizes[sz] = next;
        });
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

  return { vendorOrders: nextVendorOrders, orders: nextOrders };
}
