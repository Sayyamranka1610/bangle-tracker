import type { Order, EmbeddedDesign, Priority } from '../types';
import { orderStatus } from './coStageUtils';

export { orderStatus, orderPct, coOrderStageCounts, CO_STAGE_DEFS } from './coStageUtils';

// ─── Quantities ───────────────────────────────────────────────────────────────

function designQty(design: EmbeddedDesign): number {
  if (design.varieties?.length) {
    return design.varieties.reduce((acc: number, v) =>
      acc + Object.values(v.sizes ?? {}).reduce((x: number, q) => x + (parseInt(String(q)) || 0), 0), 0);
  }
  return 0;
}

export function orderTotalQty(order: Order): number {
  return order.designs.reduce((acc, d) => acc + designQty(d), 0);
}

// ─── ORD-NNN renumbering ──────────────────────────────────────────────────────

export function renumberOrders(orders: Order[]): Order[] {
  const sorted = [...orders].sort((a, b) => {
    const da = a.startDate ?? a.createdAt;
    const db = b.startDate ?? b.createdAt;
    return da < db ? -1 : da > db ? 1 : 0;
  });
  sorted.forEach((o, i) => {
    o.orderId = `ORD-${String(i + 1).padStart(3, '0')}`;
  });
  // Return in original (insertion) order
  return orders.map(o => sorted.find(s => s.id === o.id)!);
}

// ─── Stats summary (mirrors Phase 1's renderStats — Total/Pending/Completed/Archived) ─

export interface OrderStats {
  total: number;     // active (non-archived) orders
  pending: number;
  done: number;
  archived: number;
}

export function computeStats(allOrders: Order[]): OrderStats {
  const active = allOrders.filter(o => !o.archived);
  const done = active.filter(o => orderStatus(o) === 'done').length;
  return {
    total: active.length,
    pending: active.length - done,
    done,
    archived: allOrders.length - active.length,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const PRIORITY_LABELS: Record<Priority, string> = {
  normal: 'Normal',
  urgent: 'Urgent',
  critical: 'Critical',
};

export const BANGLE_TYPE_LABELS: Record<string, string> = {
  dye_gold: 'Dye Gold',
  cnc: 'CNC',
  both: 'Both',
};

export function uid(): string {
  return crypto.randomUUID();
}

// ─── Promised-date helpers (retail additions, Aug 2026) ──────────────────────
// An order is overdue when the date you promised the customer has passed and
// at least one row has still not been dispatched. Orders with no promised date
// are never overdue — the field is optional and most older orders lack it.

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOrderOverdue(order: Order, today: string = todayISO()): boolean {
  if (!order.promisedDate) return false;
  if (order.archived) return false;
  if (order.promisedDate >= today) return false;
  return orderStatus(order) !== 'done';
}

/** Negative = days late, positive = days remaining, null = no promised date. */
export function daysUntilPromised(order: Order, today: string = todayISO()): number | null {
  if (!order.promisedDate) return null;
  const ms = new Date(order.promisedDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime();
  return Math.round(ms / 86400000);
}
