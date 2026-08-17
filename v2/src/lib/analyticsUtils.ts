import type { Order, EmbeddedDesign } from '../types';
import { orderStatus, orderPct } from './coStageUtils';
import { designTotalQty } from './designUtils';

// ─── KPI summary (mirrors Phase 1's renderAnalytics "Key metrics" card) ──────
// Phase 1's own KPI card always shows "Overdue orders" = 0 — it calls the
// real 2-state orderAlert() (done/pending) expecting a 4-state answer, a
// dead-code leftover from before that function was simplified. Rather than
// bug-for-bug mirror that, this shows "Pending orders" instead — same
// underlying real data, just not a permanently-meaningless field.

export interface KpiSummary {
  totalOrders: number;
  totalDesigns: number;
  totalPieces: number;
  avgCompletionPct: number;
  completedOrders: number;
  pendingOrders: number;
}

export function computeKpis(orders: Order[]): KpiSummary {
  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => orderStatus(o) === 'done').length;
  const pendingOrders = totalOrders - completedOrders;
  const totalDesigns = orders.reduce((a, o) => a + (o.designs?.length ?? 0), 0);
  const totalPieces = orders.reduce((a, o) =>
    a + (o.designs ?? []).reduce((b, d) => b + designTotalQty(d), 0), 0);
  const avgCompletionPct = totalOrders ? Math.round(orders.reduce((a, o) => a + orderPct(o), 0) / totalOrders) : 0;

  return { totalOrders, totalDesigns, totalPieces, avgCompletionPct, completedOrders, pendingOrders };
}

// ─── Client leaderboard ───────────────────────────────────────────────────────
// Not a direct Phase 1 port (Phase 1's Analytics only has a simple "orders by
// client" bar chart) — kept as a Phase 2 addition, but grounded in the real
// done/pending status instead of the dead-quirk 4-state alert it used before.

export interface ClientRow {
  client: string;
  orderCount: number;
  totalPieces: number;
  pending: number;
  done: number;
  latestStart: string;
}

export function computeClientLeaderboard(orders: Order[]): ClientRow[] {
  const map = new Map<string, ClientRow>();

  orders.forEach(o => {
    const key = o.client || '(unknown)';
    if (!map.has(key)) {
      map.set(key, { client: key, orderCount: 0, totalPieces: 0, pending: 0, done: 0, latestStart: '' });
    }
    const row = map.get(key)!;
    row.orderCount++;
    row.totalPieces += (o.designs ?? []).reduce((a, d) => a + designTotalQty(d), 0);
    orderStatus(o) === 'done' ? row.done++ : row.pending++;
    if (o.startDate > row.latestStart) row.latestStart = o.startDate;
  });

  return [...map.values()].sort((a, b) => b.orderCount - a.orderCount);
}

// ─── Design popularity ────────────────────────────────────────────────────────

export interface DesignPopularityRow {
  code: string;
  name: string;
  timesOrdered: number;
  totalPieces: number;
  avgPieces: number;
  clients: string[];
  bangleTypes: string[];
}

export function computeDesignPopularity(orders: Order[]): DesignPopularityRow[] {
  const map = new Map<string, DesignPopularityRow>();

  orders.forEach(o => {
    (o.designs ?? []).forEach((d: EmbeddedDesign) => {
      const key = d.code?.trim() || d.name?.trim() || '(unnamed)';
      if (!map.has(key)) {
        map.set(key, { code: key, name: d.name || key, timesOrdered: 0, totalPieces: 0, avgPieces: 0, clients: [], bangleTypes: [] });
      }
      const row = map.get(key)!;
      row.timesOrdered++;
      row.totalPieces += designTotalQty(d);
      if (o.client && !row.clients.includes(o.client)) row.clients.push(o.client);
      if (o.bangleType && !row.bangleTypes.includes(o.bangleType)) row.bangleTypes.push(o.bangleType);
    });
  });

  return [...map.values()]
    .map(r => ({ ...r, avgPieces: r.timesOrdered ? Math.round(r.totalPieces / r.timesOrdered) : 0 }))
    .sort((a, b) => b.timesOrdered - a.timesOrdered);
}

// ─── Bangle type + priority breakdown ────────────────────────────────────────

export interface BreakdownItem {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export function computeBangleTypeBreakdown(orders: Order[]): BreakdownItem[] {
  const counts: Record<string, number> = { dye_gold: 0, cnc: 0, both: 0 };
  orders.forEach(o => { counts[o.bangleType] = (counts[o.bangleType] ?? 0) + 1; });
  const total = orders.length || 1;
  return [
    { label: 'Dye Gold', count: counts.dye_gold, pct: Math.round(counts.dye_gold / total * 100), color: 'bg-yellow-500' },
    { label: 'CNC',      count: counts.cnc,      pct: Math.round(counts.cnc / total * 100),      color: 'bg-blue-500' },
    { label: 'Both',     count: counts.both,     pct: Math.round(counts.both / total * 100),     color: 'bg-purple-500' },
  ].filter(x => x.count > 0);
}

export function computePriorityBreakdown(orders: Order[]): BreakdownItem[] {
  const counts: Record<string, number> = { normal: 0, urgent: 0, critical: 0 };
  orders.forEach(o => { counts[o.priority] = (counts[o.priority] ?? 0) + 1; });
  const total = orders.length || 1;
  return [
    { label: 'Normal',   count: counts.normal,   pct: Math.round(counts.normal / total * 100),   color: 'bg-green-500' },
    { label: 'Urgent',   count: counts.urgent,   pct: Math.round(counts.urgent / total * 100),   color: 'bg-orange-500' },
    { label: 'Critical', count: counts.critical, pct: Math.round(counts.critical / total * 100), color: 'bg-red-500' },
  ].filter(x => x.count > 0);
}
