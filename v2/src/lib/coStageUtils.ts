import type { EmbeddedDesign, DesignVariety, Order, VendorPipelineFields } from '../types';

// ─── CO (customer order) production stage tracker ────────────────────────────
// Ports Phase 1's _coStage/_coOrderStageCounts exactly (bangle_v19.html ~L6430).
// This is what ACTUALLY drives order completion — not the design.stages[]
// 9-step deadline checklist, which Phase 1 kept for per-row badges only after
// scrapping it as a standalone "Production Stages" tab.

export type CoStageKey = 'notStarted' | 'pipe' | 'karigar' | 'plating' | 'packing' | 'dispatched';

export const CO_STAGE_DEFS: { k: CoStageKey; bg: string; tx: string; lbl: string }[] = [
  { k: 'notStarted', bg: '#FFCDD2', tx: '#C62828', lbl: 'Not started' },
  { k: 'pipe',        bg: '#FFE082', tx: '#6D4C00', lbl: 'Pipe' },
  { k: 'karigar',     bg: '#90CAF9', tx: '#0D47A1', lbl: 'Karigar' },
  { k: 'plating',     bg: '#FFF176', tx: '#827717', lbl: 'Plating' },
  { k: 'packing',     bg: '#C8E6C9', tx: '#2E7D32', lbl: 'Packing' },
  { k: 'dispatched',  bg: '#A5D6A7', tx: '#1B5E20', lbl: 'Dispatched' },
];

// Same holder-priority cascade as Phase 1: dispatched > packing > plating > karigar > pipe > notStarted
export function coStage(holder: VendorPipelineFields & { stages?: { status: string }[]; done?: boolean; dispatchedToClient?: boolean }): CoStageKey {
  const allStageDone = Array.isArray(holder.stages) && holder.stages.length > 0 && holder.stages.every(st => st.status === 'done');
  if (holder.done || holder.dispatchedToClient || allStageDone) return 'dispatched';
  if (holder.platingReceived) return 'packing';
  if (holder.platingVendor) return 'plating';
  if (holder.assignedVendor) return 'karigar';
  if (holder.pipeVendor) return 'pipe';
  return 'notStarted';
}

// A design counts as "flat" (single row, no per-variety breakdown) when it's
// CNC, has no varieties, or has only a legacy "Default" placeholder variety.
export function hasOnlyDefault(d: EmbeddedDesign): boolean {
  return (d.varieties ?? []).length === 1 && (d.varieties![0].name || '').trim().toLowerCase() === 'default';
}

export function isFlatDesign(order: Order, d: EmbeddedDesign): boolean {
  const isCnc = order.bangleType === 'cnc' || d.bangleType === 'cnc';
  return isCnc || !(d.varieties ?? []).length || hasOnlyDefault(d);
}

export type CoStageCounts = Record<CoStageKey, number>;

export function coOrderStageCounts(order: Order): CoStageCounts {
  const c: CoStageCounts = { notStarted: 0, pipe: 0, karigar: 0, plating: 0, packing: 0, dispatched: 0 };
  (order.designs ?? []).forEach(d => {
    if (isFlatDesign(order, d)) {
      c[coStage(d)]++;
    } else {
      (d.varieties ?? []).forEach(v => { c[coStage(v)]++; });
    }
  });
  return c;
}

// ─── Order-level status (mirrors Phase 1's real orderAlert/orderPct exactly) ──
// Binary: 'done' when every row has reached 'dispatched', otherwise 'pending'.
// There is no deadline-based ok/warn/late state at the order level in Phase 1.

export function orderPct(order: Order): number {
  const c = coOrderStageCounts(order);
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  return total ? Math.round((c.dispatched / total) * 100) : 0;
}

export function orderStatus(order: Order): 'done' | 'pending' {
  return orderPct(order) === 100 ? 'done' : 'pending';
}

// ─── Vendor-of-type lookup (for the Pipe/Karigar/Plating assignment dropdowns) ─

export function dedupedVendorsOfType(vendorOrders: { type?: string; vendor: string }[], type: 'pipe' | 'karigar' | 'plating'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  vendorOrders.forEach(vo => {
    if ((vo.type || 'karigar') !== type || !vo.vendor) return;
    if (seen.has(vo.vendor)) return;
    seen.add(vo.vendor);
    out.push(vo.vendor);
  });
  return out;
}

export function setPipeVendor<T extends VendorPipelineFields>(holder: T, val: string): T {
  const next = { ...holder };
  if (val) { next.pipeVendor = val; next.pipeVendorAt = Date.now(); }
  else { delete next.pipeVendor; delete next.pipeVendorAt; }
  return next;
}

export function setPlatingVendor<T extends VendorPipelineFields>(holder: T, val: string): T {
  const next = { ...holder };
  if (val) { next.platingVendor = val; next.platingVendorAt = Date.now(); }
  else { delete next.platingVendor; delete next.platingVendorAt; }
  return next;
}

export function setKarigarVendor<T extends VendorPipelineFields>(holder: T, val: string): T {
  const next = { ...holder };
  if (val) { next.assignedVendor = val; next.assignedVendorAt = Date.now(); }
  else { delete next.assignedVendor; delete next.assignedVendorAt; }
  return next;
}

export function toggleReceived<T extends VendorPipelineFields>(holder: T, stage: 'pipe' | 'karigar' | 'plating'): T {
  const field = stage === 'pipe' ? 'pipeReceived' : stage === 'plating' ? 'platingReceived' : 'karigarReceived';
  const atField = `${field}At` as const;
  const next = { ...holder, [field]: !holder[field] };
  // Timestamp companion — used by Turnaround Time to measure days-since-received.
  if (next[field]) (next as VendorPipelineFields)[atField] = Date.now();
  else delete (next as VendorPipelineFields)[atField];
  return next;
}

// Design-level "mark complete" shortcut — mirrors Phase 1's markDesignComplete
// exactly. Ticks every stage done AND every vendor-stage received flag, both
// on the design itself (for flat/CNC rows) and on every variety (for dye-gold
// rows) — either could be the "holder" coStage() reads from.
export function markDesignCompleteFields(design: EmbeddedDesign): EmbeddedDesign {
  const today = new Date().toISOString().slice(0, 10);
  const stages = design.stages.map(st => ({ ...st, status: 'done' as const, completionDate: st.completionDate ?? today }));
  const varieties = (design.varieties ?? []).map(v => ({ ...v, pipeReceived: true, karigarReceived: true, platingReceived: true }));
  return {
    ...design,
    stages,
    varieties,
    receivedFromKarigar: true,
    dispatchedToClient: true,
    pipeReceived: true,
    karigarReceived: true,
    platingReceived: true,
    dispatchedAt: design.dispatchedAt ?? Date.now(),
  };
}

// Per-variety dispatch toggle — mirrors Phase 1's markVarietyDone exactly.
// Independent of the design-level shortcut above; undoing does NOT clear the
// individual stage-received ticks (matches Phase 1's documented behavior).
export function toggleVarietyDone<T extends DesignVariety>(variety: T): T {
  const next = { ...variety, done: !variety.done };
  if (next.done) {
    next.receivedFromKarigar = true;
    next.dispatchedToClient = true;
    next.pipeReceived = true;
    next.karigarReceived = true;
    next.platingReceived = true;
    next.dispatchedAt = Date.now();
  } else {
    next.receivedFromKarigar = false;
    next.dispatchedToClient = false;
    delete next.dispatchedAt;
  }
  return next;
}

// ─── Production Pipeline (mirrors Phase 1's Analytics "Production Pipeline") ──
// Grand totals across every order, plus a per-client breakdown — same shape
// as bangle_v19.html's _ppGrand/_ppPerRows.

export interface ClientPipelineRow {
  client: string;
  orderCount: number;
  designCount: number;
  counts: CoStageCounts;
  dispatchPct: number;
}

export interface ProductionPipeline {
  grand: CoStageCounts;
  total: number;
  perClient: ClientPipelineRow[];
}

export function computeProductionPipeline(orders: Order[]): ProductionPipeline {
  const grand: CoStageCounts = { notStarted: 0, pipe: 0, karigar: 0, plating: 0, packing: 0, dispatched: 0 };
  const byClient = new Map<string, { client: string; orders: Order[]; designCount: number; counts: CoStageCounts }>();

  orders.forEach(o => {
    const c = coOrderStageCounts(o);
    (Object.keys(grand) as CoStageKey[]).forEach(k => { grand[k] += c[k]; });

    if (!byClient.has(o.client)) {
      byClient.set(o.client, { client: o.client, orders: [], designCount: 0, counts: { notStarted: 0, pipe: 0, karigar: 0, plating: 0, packing: 0, dispatched: 0 } });
    }
    const cd = byClient.get(o.client)!;
    cd.orders.push(o);
    cd.designCount += (o.designs ?? []).length;
    (Object.keys(grand) as CoStageKey[]).forEach(k => { cd.counts[k] += c[k]; });
  });

  const total = Object.values(grand).reduce((a, b) => a + b, 0);

  const perClient: ClientPipelineRow[] = [...byClient.values()]
    .map(cd => {
      const t = Object.values(cd.counts).reduce((a, b) => a + b, 0);
      return {
        client: cd.client,
        orderCount: cd.orders.length,
        designCount: cd.designCount,
        counts: cd.counts,
        dispatchPct: t ? Math.round((cd.counts.dispatched / t) * 100) : 0,
      };
    })
    .sort((a, b) => Object.values(b.counts).reduce((x, y) => x + y, 0) - Object.values(a.counts).reduce((x, y) => x + y, 0));

  return { grand, total, perClient };
}

// ─── "All stages" full view (mirrors Phase 1's _allStagesHtml) ───────────────
// Every design/variety row across every order, grouped by its real current
// pipeline stage — same source as computeProductionPipeline, row-level detail.

export interface StageRow {
  orderDbId: string;
  orderId: string;
  client: string;
  code: string;
  name: string;
  varName: string | null;
  qty: number;
}

export function computeAllStagesRows(orders: Order[]): Record<CoStageKey, StageRow[]> {
  const out: Record<CoStageKey, StageRow[]> = { notStarted: [], pipe: [], karigar: [], plating: [], packing: [], dispatched: [] };

  orders.forEach(order => {
    (order.designs ?? []).forEach(d => {
      if (isFlatDesign(order, d)) {
        const qty = Object.values(hasOnlyDefault(d) ? (d.varieties?.[0]?.sizes ?? {}) : (d.sizes ?? {})).reduce((a, v) => a + (Number(v) || 0), 0);
        out[coStage(d)].push({ orderDbId: order.id, orderId: order.orderId, client: order.client, code: d.code || '', name: d.name || '—', varName: null, qty });
      } else {
        (d.varieties ?? []).forEach((v, vi) => {
          const qty = Object.values(v.sizes ?? {}).reduce((a, x) => a + (Number(x) || 0), 0);
          out[coStage(v)].push({ orderDbId: order.id, orderId: order.orderId, client: order.client, code: d.code || '', name: d.name || '—', varName: v.name || `Variety ${vi + 1}`, qty });
        });
      }
    });
  });

  return out;
}

export interface VendorSummaryRow {
  designName: string;
  designCode: string;
  varName: string | null;
  sizes: Record<string, number>;
  importedToVOId: string | null;
}

// Groups every design/variety row in an order by its assigned karigar vendor —
// mirrors Phase 1's buildVendorSummaryPanel grouping (import-to-VO linking is
// a separate, deferred feature — see PHASE2_TRACKER.md).
export function buildVendorSummary(order: Order): { vendor: string; rows: VendorSummaryRow[] }[] {
  const groups = new Map<string, VendorSummaryRow[]>();
  const unassigned: VendorSummaryRow[] = [];

  (order.designs ?? []).forEach(d => {
    if (isFlatDesign(order, d)) {
      const vendor = d.assignedVendor || '';
      const rowSizes = hasOnlyDefault(d) ? (d.varieties?.[0]?.sizes ?? {}) : (d.sizes ?? {});
      const row: VendorSummaryRow = { designName: d.name || '', designCode: d.code || '', varName: null, sizes: rowSizes, importedToVOId: d.importedToVOId ?? null };
      (vendor ? groups.get(vendor) ?? groups.set(vendor, []).get(vendor)! : unassigned).push(row);
    } else {
      (d.varieties ?? []).forEach((v, vi) => {
        const vendor = v.assignedVendor || '';
        const row: VendorSummaryRow = { designName: d.name || '', designCode: d.code || '', varName: v.name || `Variety ${vi + 1}`, sizes: v.sizes ?? {}, importedToVOId: v.importedToVOId ?? null };
        (vendor ? groups.get(vendor) ?? groups.set(vendor, []).get(vendor)! : unassigned).push(row);
      });
    }
  });

  const result = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([vendor, rows]) => ({ vendor, rows }));
  if (unassigned.length) result.push({ vendor: '', rows: unassigned }); // '' = unassigned bucket
  return result;
}
