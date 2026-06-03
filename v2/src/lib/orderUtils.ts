import type { Order, EmbeddedDesign, DesignStage, AlertLevel, Priority } from '../types';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

// ─── Stage deadline ───────────────────────────────────────────────────────────

function getEffDays(order: Order, design: EmbeddedDesign, stageIndex: number): number {
  const stage = design.stages[stageIndex];
  if (stage.effDays != null) return stage.effDays;
  return order.priority === 'urgent' || order.priority === 'critical'
    ? (stage.urgDays ?? stage.days ?? 1)
    : (stage.days ?? 1);
}

function stageDeadline(order: Order, design: EmbeddedDesign, stageIndex: number): Date {
  const base = parseDate(order.startDate);
  let days = 0;
  for (let i = 0; i <= stageIndex; i++) days += getEffDays(order, design, i);
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Alert computation (mirrors Phase 1 exactly) ──────────────────────────────

function stageAlert(order: Order, design: EmbeddedDesign, i: number): AlertLevel {
  const stage: DesignStage = design.stages[i];
  if (stage.status === 'done') return 'done';
  if (stage.completionDate) {
    const cd = parseDate(stage.completionDate);
    if (cd < today()) return 'late';
  }
  const diff = Math.ceil((stageDeadline(order, design, i).getTime() - today().getTime()) / 864e5);
  if (diff < 0) return 'late';
  if (diff <= 1) return 'warn';
  return 'ok';
}

export function designAlert(order: Order, design: EmbeddedDesign): AlertLevel {
  if (!design.stages?.length) return 'ok';
  const alerts = design.stages.map((_, i) => stageAlert(order, design, i));
  if (alerts.includes('late')) return 'late';
  if (alerts.includes('warn')) return 'warn';
  if (alerts.every(x => x === 'done')) return 'done';
  return 'ok';
}

export function orderAlert(order: Order): AlertLevel {
  if (!order.designs?.length) return 'ok';
  const alerts = order.designs.map(d => designAlert(order, d));
  if (alerts.includes('late')) return 'late';
  if (alerts.includes('warn')) return 'warn';
  if (alerts.every(x => x === 'done')) return 'done';
  return 'ok';
}

export function orderPct(order: Order): number {
  let total = 0, done = 0;
  order.designs.forEach(d => {
    total += d.stages.length;
    done += d.stages.filter(s => s.status === 'done').length;
  });
  return total ? Math.round(done / total * 100) : 0;
}

export function designQty(design: EmbeddedDesign): number {
  if (design.varieties?.length) {
    return design.varieties.reduce((acc: number, v) =>
      acc + Object.values(v.sizes ?? {}).reduce((x: number, q) => x + (parseInt(String(q)) || 0), 0), 0);
  }
  return design.cncQty ?? 0;
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

// ─── Stats summary ────────────────────────────────────────────────────────────

export interface OrderStats {
  total: number;
  onTrack: number;
  soon: number;
  late: number;
  done: number;
}

export function computeStats(orders: Order[]): OrderStats {
  const stats: OrderStats = { total: orders.length, onTrack: 0, soon: 0, late: 0, done: 0 };
  orders.forEach(o => {
    const a = orderAlert(o);
    if (a === 'ok') stats.onTrack++;
    else if (a === 'warn') stats.soon++;
    else if (a === 'late') stats.late++;
    else if (a === 'done') stats.done++;
  });
  return stats;
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

export const ALERT_CONFIG: Record<AlertLevel, { label: string; color: string; bg: string }> = {
  ok:   { label: 'On Track',  color: 'text-green-400',  bg: 'bg-green-500/15' },
  warn: { label: 'Due Soon',  color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  late: { label: 'Late',      color: 'text-red-400',    bg: 'bg-red-500/15' },
  done: { label: 'Done',      color: 'text-indigo-400', bg: 'bg-indigo-500/15' },
};

export function uid(): string {
  return crypto.randomUUID();
}
