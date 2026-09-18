import type { AppData, Order, VendorOrder, VendorDesign, PoolSource, StockItem } from '../types';
import { uid } from './orderUtils';

// ─── Receiving a pooled batch back from a vendor ─────────────────────────────
// A pooled batch is one number to the vendor but many customers inside it.
// When it comes back — often short, often with rejections — somebody has to
// decide who gets what. That decision is the owner's, always: nothing here
// allocates automatically. `suggestEvenSplit` only fills the boxes in as a
// starting point, and every number stays editable.

export const sumSizes = (s?: Record<string, number>) =>
  Object.values(s ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);

export interface ReceiveLine {
  size: string;
  sent: number;
  received: number;
  rejected: number;
  good: number;
  /** allocation per source index (parallel to design.sources) */
  alloc: number[];
  toStock: number;
}

export function initReceiveLines(design: VendorDesign): ReceiveLine[] {
  const sizes = Object.keys(design.sizes ?? {}).filter(s => (Number(design.sizes![s]) || 0) > 0);
  const nSources = (design.sources ?? []).length;
  return sizes.map(size => ({
    size,
    sent: Number(design.sizes![size]) || 0,
    received: 0,
    rejected: 0,
    good: 0,
    alloc: new Array(nSources).fill(0),
    toStock: 0,
  }));
}

export function recomputeGood(line: ReceiveLine): ReceiveLine {
  return { ...line, good: Math.max(0, line.received - line.rejected) };
}

/** Demand for one source at one size. */
export function demandOf(sources: PoolSource[], idx: number, size: string): number {
  return Number(sources[idx]?.sizes?.[size]) || 0;
}

/**
 * How many pieces a source has ALREADY been given in earlier part-deliveries.
 * Without this, a second receipt against the same batch could hand a customer
 * more than they ever ordered.
 */
export type AlreadyFn = (srcIdx: number, size: string) => number;

const noneReceived: AlreadyFn = () => 0;

/** What a source is still owed at one size, after earlier deliveries. */
export function remainingOf(
  sources: PoolSource[], idx: number, size: string, already: AlreadyFn = noneReceived,
): number {
  return Math.max(0, demandOf(sources, idx, size) - already(idx, size));
}

/**
 * Fills the allocation boxes as a starting point: give each customer what they
 * are still owed, in order, until the good pieces run out. Leftover goes to
 * stock. The owner then edits freely — this is a convenience, not a rule.
 */
export function suggestEvenSplit(
  line: ReceiveLine, sources: PoolSource[], already: AlreadyFn = noneReceived,
): ReceiveLine {
  let left = line.good;
  const alloc = sources.map((_, i) => {
    const give = Math.min(remainingOf(sources, i, line.size, already), left);
    left -= give;
    return give;
  });
  return { ...line, alloc, toStock: left };
}

/**
 * Builds an AlreadyFn by reading what each source's own customer row has
 * already recorded as received.
 */
export function alreadyReceivedFrom(orders: Order[], sources: PoolSource[]): AlreadyFn {
  const cache = sources.map(s => {
    const o = orders.find(x => x.id === s.orderDbId);
    const d = o?.designs.find(x => x.id === s.designId);
    if (!d) return {} as Record<string, number>;
    const holder = s.varietyId === null ? d : (d.varieties ?? []).find(v => v.id === s.varietyId);
    return (holder?.recvQty ?? {}) as Record<string, number>;
  });
  return (idx, size) => Number(cache[idx]?.[size]) || 0;
}

export function allocatedTotal(line: ReceiveLine): number {
  return line.alloc.reduce((a, b) => a + (Number(b) || 0), 0) + (Number(line.toStock) || 0);
}

export interface ReceiveValidation {
  ok: boolean;
  problems: string[];
}

export function validateReceive(
  lines: ReceiveLine[], sources: PoolSource[], already: AlreadyFn = noneReceived,
): ReceiveValidation {
  const problems: string[] = [];
  lines.forEach(l => {
    if (l.received < 0 || l.rejected < 0) problems.push(`Size ${l.size}: quantities cannot be negative.`);
    if (l.rejected > l.received) problems.push(`Size ${l.size}: rejected (${l.rejected}) is more than received (${l.received}).`);
    const alloc = allocatedTotal(l);
    if (alloc > l.good) problems.push(`Size ${l.size}: you have allocated ${alloc} but only ${l.good} are good.`);
    l.alloc.forEach((a, i) => {
      // Cap against what is still OWED, not the original order — otherwise a
      // second part-delivery could over-deliver to the same customer.
      const left = remainingOf(sources, i, l.size, already);
      if (a > left) {
        const had = already(i, l.size);
        problems.push(had > 0
          ? `Size ${l.size}: ${sources[i].client} already has ${had} of ${demandOf(sources, i, l.size)} — only ${left} still owed, but ${a} allocated.`
          : `Size ${l.size}: ${sources[i].client} is allocated ${a} but only ordered ${left}.`);
      }
    });
  });
  return { ok: problems.length === 0, problems };
}

// ─── Applying the decision ───────────────────────────────────────────────────

function addInto(target: Record<string, number>, size: string, qty: number) {
  if (qty > 0) target[size] = (target[size] ?? 0) + qty;
}

/**
 * Writes the allocation back onto each customer's own design/variety row as
 * `recvQty` (and `rejQty` proportionally is NOT invented — rejections belong to
 * the batch, not to a customer, so they are recorded on the vendor design).
 *
 * Existing received flags are left exactly as they are; this is an extra
 * detail layer, not a replacement. Nothing is deleted.
 */
export function applyAllocation(
  orders: Order[],
  design: VendorDesign,
  lines: ReceiveLine[],
): Order[] {
  const sources = design.sources ?? [];
  // orderDbId -> designId -> varietyId|flat -> {size: qty}
  const add = new Map<string, Map<string, Map<string, Record<string, number>>>>();

  lines.forEach(line => {
    line.alloc.forEach((qty, i) => {
      const n = Number(qty) || 0;
      if (n <= 0) return;
      const s = sources[i];
      if (!s) return;
      if (!add.has(s.orderDbId)) add.set(s.orderDbId, new Map());
      const byDesign = add.get(s.orderDbId)!;
      if (!byDesign.has(s.designId)) byDesign.set(s.designId, new Map());
      const byVariety = byDesign.get(s.designId)!;
      const vk = s.varietyId ?? '__flat__';
      if (!byVariety.has(vk)) byVariety.set(vk, {});
      addInto(byVariety.get(vk)!, line.size, n);
    });
  });

  if (!add.size) return orders;

  return orders.map(o => {
    const byDesign = add.get(o.id);
    if (!byDesign) return o;
    return {
      ...o,
      designs: o.designs.map(d => {
        const byVariety = byDesign.get(d.id);
        if (!byVariety) return d;
        let next = d;
        const flat = byVariety.get('__flat__');
        if (flat) {
          const merged = { ...(d.recvQty ?? {}) };
          Object.entries(flat).forEach(([sz, q]) => addInto(merged, sz, q));
          next = { ...next, recvQty: merged };
        }
        if (d.varieties?.length) {
          next = {
            ...next,
            varieties: d.varieties.map(v => {
              const inc = byVariety.get(v.id);
              if (!inc) return v;
              const merged = { ...(v.recvQty ?? {}) };
              Object.entries(inc).forEach(([sz, q]) => addInto(merged, sz, q));
              return { ...v, recvQty: merged };
            }),
          };
        }
        return next;
      }),
    };
  });
}

/** Records what the vendor actually returned, on the vendor design itself. */
export function applyVendorReceipt(
  vendorOrders: VendorOrder[],
  voId: string,
  designId: string,
  lines: ReceiveLine[],
): VendorOrder[] {
  const recv: Record<string, number> = {};
  const rej: Record<string, number> = {};
  lines.forEach(l => {
    addInto(recv, l.size, Number(l.received) || 0);
    addInto(rej, l.size, Number(l.rejected) || 0);
  });

  return vendorOrders.map(vo => {
    if (vo.id !== voId) return vo;
    return {
      ...vo,
      designs: (vo.designs ?? []).map(d => {
        if (d.id !== designId) return d;
        const mergedRecv = { ...(d.recvQty ?? {}) };
        const mergedRej  = { ...(d.rejQty ?? {}) };
        Object.entries(recv).forEach(([s, q]) => addInto(mergedRecv, s, q));
        Object.entries(rej).forEach(([s, q]) => addInto(mergedRej, s, q));
        return { ...d, recvQty: mergedRecv, rejQty: mergedRej };
      }),
    };
  });
}

// ─── Syncing "received" onto the customer's own row ───────────────────────────
// Phase 1 tracks a per-row boolean `received` on the vendor-order side and
// keeps it in sync with each customer's own pipeReceived/karigarReceived/
// platingReceived flags (`_syncVOReceivedForCOHolder`/`_syncCOReceivedForVORow`,
// `e58de9b`; refined with a "ask about pooled siblings" confirm in `11f6af3`;
// swept retroactively across the whole app via a "Reconcile Status" button in
// `7fe0b19`). Phase 2 has no such boolean and doesn't need one: it already
// tracks the REAL, finer-grained signal — `recvQty` per size, written by
// applyAllocation() above — so "has this customer fully received what they
// ordered" is simply "does recvQty cover demand for every size", computed
// from data that already exists rather than a second field to keep in sync.
// That also means Phase 2 needs no Hinglish confirm() for the ambiguous
// "some customers say yes, some don't" case Phase 1 has to ask about — a
// quantity either covers the demand or it doesn't, no guessing required.

function receivedFieldFor(voType: VendorOrder['type']): 'pipeReceived' | 'karigarReceived' | 'platingReceived' {
  return voType === 'pipe' ? 'pipeReceived' : voType === 'plating' ? 'platingReceived' : 'karigarReceived';
}

/**
 * Sets pipeReceived/karigarReceived/platingReceived (matching `voType`) on
 * every customer holder linked to `design` whose allocation now fully
 * covers what they ordered — reading `orders` FRESH (i.e. after
 * applyAllocation has already run), so it sees the allocation just made.
 * Already-set flags are left alone; a customer still short of their order
 * is left untouched, exactly like every other "received" check in this file.
 */
export interface SyncReceivedFlagsResult {
  orders: Order[];
  /** How many customer design/variety rows this call newly marked received. */
  touchedCount: number;
}

export function syncReceivedFlagsForAllocation(
  orders: Order[],
  voType: VendorOrder['type'],
  design: VendorDesign,
): SyncReceivedFlagsResult {
  const sources = design.sources ?? [];
  if (!sources.length) return { orders, touchedCount: 0 };
  const field = receivedFieldFor(voType);
  const atField = `${field}At` as const;
  const already = alreadyReceivedFrom(orders, sources);

  const coveredIdx = new Set<number>();
  sources.forEach((s, i) => {
    const sizes = Object.keys(s.sizes ?? {}).filter(sz => (Number(s.sizes[sz]) || 0) > 0);
    if (sizes.length && sizes.every(sz => remainingOf(sources, i, sz, already) === 0)) coveredIdx.add(i);
  });
  if (!coveredIdx.size) return { orders, touchedCount: 0 };

  let touchedCount = 0;
  const nextOrders = orders.map(o => {
    let touched = false;
    const nextDesigns = o.designs.map(d => {
      let nd = d;
      sources.forEach((s, i) => {
        if (!coveredIdx.has(i) || s.orderDbId !== o.id || s.designId !== d.id) return;
        if (s.varietyId === null) {
          if (!nd[field]) { nd = { ...nd, [field]: true, [atField]: Date.now() }; touched = true; touchedCount++; }
        } else {
          const vi = (nd.varieties ?? []).findIndex(v => v.id === s.varietyId);
          if (vi >= 0 && !nd.varieties![vi][field]) {
            const varieties = [...nd.varieties!];
            varieties[vi] = { ...varieties[vi], [field]: true, [atField]: Date.now() };
            nd = { ...nd, varieties };
            touched = true; touchedCount++;
          }
        }
      });
      return nd;
    });
    return touched ? { ...o, designs: nextDesigns } : o;
  });
  return { orders: nextOrders, touchedCount };
}

export interface ReconcileResult {
  orders: Order[];
  /** Customer design/variety rows whose received flag this pass turned on. */
  updatedCount: number;
}

/**
 * Retroactive, whole-app sweep — for `recvQty` already recorded before this
 * sync existed (or from any other path), catches up every customer row that
 * is fully covered but whose received flag was never set. Ports the intent
 * of Phase 1's `reconcileAllVendorCustomerStatus()` (`7fe0b19`), adapted to
 * Phase 2's quantity-based model (see the comment above
 * syncReceivedFlagsForAllocation) — no confirm() prompts needed, and running
 * it twice is a no-op the second time for the same reason: nothing left to
 * catch up once every recvQty is already reflected.
 */
export function reconcileReceivedStatus(data: AppData): ReconcileResult {
  let orders = data.orders ?? [];
  let updatedCount = 0;

  (data.vendorOrders ?? []).forEach(vo => {
    receivableDesigns(vo).forEach(design => {
      const result = syncReceivedFlagsForAllocation(orders, vo.type, design);
      orders = result.orders;
      updatedCount += result.touchedCount;
    });
  });

  return { orders, updatedCount };
}

/** Adds the unallocated leftover into finished-goods stock. */
export function applyToStock(
  stock: StockItem[],
  design: VendorDesign,
  lines: ReceiveLine[],
  family?: string,
): StockItem[] {
  const add: Record<string, number> = {};
  lines.forEach(l => addInto(add, l.size, Number(l.toStock) || 0));
  if (!Object.keys(add).length) return stock;

  const code = (design.code || '').trim();
  const idx = stock.findIndex(s => (s.code || '').trim().toUpperCase() === code.toUpperCase()
    && (s.name || '') === (design.name || ''));

  if (idx === -1) {
    return [...stock, {
      id: uid(),
      code,
      name: design.name || code,
      family,
      sizes: add,
      images: design.images,
      updatedAt: Date.now(),
    }];
  }

  const existing = stock[idx];
  const merged = { ...existing.sizes };
  Object.entries(add).forEach(([s, q]) => addInto(merged, s, q));
  const next = [...stock];
  next[idx] = { ...existing, sizes: merged, updatedAt: Date.now() };
  return next;
}

// ─── Reading back what a customer row is still owed ──────────────────────────

export function outstandingOf(
  ordered: Record<string, number>,
  received: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  Object.entries(ordered ?? {}).forEach(([s, q]) => {
    const left = (Number(q) || 0) - (Number(received?.[s]) || 0);
    if (left > 0) out[s] = left;
  });
  return out;
}

/** Vendor designs in this order that came from pooling and can be received. */
export function receivableDesigns(vo: VendorOrder): VendorDesign[] {
  return (vo.designs ?? []).filter(d => (d.sources ?? []).length > 0);
}

export type { AppData };
