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
