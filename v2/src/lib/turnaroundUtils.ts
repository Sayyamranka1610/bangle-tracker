import type { Order, VendorPipelineFields } from '../types';
import { isFlatDesign } from './coStageUtils';

// ─── Turnaround-Time analytics (mirrors Phase 1's _turnaroundRows exactly) ───
// How long each customer-order ROW (a design, or one variety of it) actually
// took to reach the customer, and where along the way the time went.
// Anchored on the same Pipe/Karigar/Plating cells the pipeline tracker uses —
// deliberately NOT the separate stages[] checklist, which can't tell
// varieties apart.
//
// A row only counts once it has a real dispatchedAt AND its order has a real
// createdAt. No historical guessing — every number here is a real, measured
// duration.

export const TURNAROUND_TRACKING_SINCE = 'Tracking since 1 Aug 2026';

export interface TurnaroundRow {
  orderDbId: string;
  orderLabel: string;
  client: string;
  code: string;
  pipeVendor: string | null;
  karigar: string | null;
  platingVendor: string | null;
  totalDays: number;
  pipeDays: number | null;
  karigarDays: number | null;
  platingDays: number | null;
  packingDays: number | null;
  dispatchedAt: number;
}

function segDays(startTs: number | undefined, endTs: number | undefined): number | null {
  const s = startTs ? new Date(startTs).getTime() : 0;
  const e = endTs ? new Date(endTs).getTime() : 0;
  return (s > 0 && e > 0 && e >= s) ? (e - s) / 864e5 : null;
}

export function computeTurnaroundRows(orders: Order[]): TurnaroundRow[] {
  const rows: TurnaroundRow[] = [];

  orders.forEach(order => {
    const createdAt = order.createdAt ? new Date(order.createdAt).getTime() : 0;
    if (!(createdAt > 0)) return; // missing / epoch-sentinel — can't measure accurately

    (order.designs ?? []).forEach(d => {
      const items: VendorPipelineFields[] = isFlatDesign(order, d) ? [d] : (d.varieties ?? []);
      items.forEach(holder => {
        const dispatchedAt = holder.dispatchedAt ? new Date(holder.dispatchedAt).getTime() : 0;
        if (!(dispatchedAt > createdAt)) return; // not dispatched yet, or bad data
        const packingStart = holder.platingReceivedAt ?? holder.karigarReceivedAt; // skip-plating fallback

        rows.push({
          orderDbId: order.id, orderLabel: order.orderId || '', client: order.client || '(no client)', code: d.code || '(no code)',
          pipeVendor: (holder.pipeVendor && holder.pipeVendor !== '__own__') ? holder.pipeVendor : null,
          karigar: holder.assignedVendor || null,
          platingVendor: (holder.platingVendor && holder.platingVendor !== '__own__') ? holder.platingVendor : null,
          totalDays: (dispatchedAt - createdAt) / 864e5,
          pipeDays: segDays(holder.pipeVendorAt, holder.pipeReceivedAt),
          karigarDays: segDays(holder.assignedVendorAt, holder.karigarReceivedAt),
          platingDays: segDays(holder.platingVendorAt, holder.platingReceivedAt),
          packingDays: segDays(packingStart, holder.dispatchedAt),
          dispatchedAt,
        });
      });
    });
  });

  return rows;
}

export function taAvg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

export function taMedian(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function taFmt(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 10) / 10}d`;
}

export interface TaGroup { key: string; avg: number; median: number | null; n: number }

// Groups rows by keyFn, averaging valFn over each group. minSample filters
// out groups too small to be a fair judgment (e.g. don't rank a vendor on 1 order).
export function taGroup(rows: TurnaroundRow[], keyFn: (r: TurnaroundRow) => string | null, valFn: (r: TurnaroundRow) => number | null, minSample = 1): TaGroup[] {
  const groups = new Map<string, number[]>();
  rows.forEach(r => {
    const k = keyFn(r); if (!k) return;
    const v = valFn(r); if (v == null) return;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(v);
  });
  return [...groups.entries()]
    .map(([key, vals]) => ({ key, avg: taAvg(vals)!, median: taMedian(vals), n: vals.length }))
    .filter(g => g.n >= minSample)
    .sort((a, b) => b.avg - a.avg);
}
