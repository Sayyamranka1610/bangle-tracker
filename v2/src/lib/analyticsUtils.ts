import type { Order, EmbeddedDesign, DesignStage } from '../types';
import { orderAlert, orderPct } from './orderUtils';
import { designTotalQty, DEFAULT_STAGES, stageGroup, stageName } from './designUtils';

// ─── KPI summary ─────────────────────────────────────────────────────────────

export interface KpiSummary {
  totalOrders: number;
  activeOrders: number;       // not 'done'
  totalDesigns: number;
  totalPieces: number;
  onTimeRate: number;         // % of non-done orders that are 'ok'
  completedOrders: number;
}

export function computeKpis(orders: Order[]): KpiSummary {
  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => orderAlert(o) === 'done').length;
  const activeOrders = totalOrders - completedOrders;
  const totalDesigns = orders.reduce((a, o) => a + (o.designs?.length ?? 0), 0);
  const totalPieces = orders.reduce((a, o) =>
    a + (o.designs ?? []).reduce((b, d) => b + designTotalQty(d), 0), 0);
  const nonDone = orders.filter(o => orderAlert(o) !== 'done');
  const onTrack = nonDone.filter(o => orderAlert(o) === 'ok').length;
  const onTimeRate = nonDone.length ? Math.round((onTrack / nonDone.length) * 100) : 100;

  return { totalOrders, activeOrders, completedOrders, totalDesigns, totalPieces, onTimeRate };
}

// ─── Client leaderboard ───────────────────────────────────────────────────────

export interface ClientRow {
  client: string;
  orderCount: number;
  totalPieces: number;
  onTrack: number;
  soon: number;
  late: number;
  done: number;
  latestStart: string;
}

export function computeClientLeaderboard(orders: Order[]): ClientRow[] {
  const map = new Map<string, ClientRow>();

  orders.forEach(o => {
    const key = o.client || '(unknown)';
    if (!map.has(key)) {
      map.set(key, { client: key, orderCount: 0, totalPieces: 0, onTrack: 0, soon: 0, late: 0, done: 0, latestStart: '' });
    }
    const row = map.get(key)!;
    row.orderCount++;
    row.totalPieces += (o.designs ?? []).reduce((a, d) => a + designTotalQty(d), 0);
    const alert = orderAlert(o);
    if (alert === 'ok')   row.onTrack++;
    if (alert === 'warn') row.soon++;
    if (alert === 'late') row.late++;
    if (alert === 'done') row.done++;
    if (o.startDate > row.latestStart) row.latestStart = o.startDate;
  });

  return [...map.values()].sort((a, b) => b.orderCount - a.orderCount);
}

// ─── Active stage per design (where is each order right now) ─────────────────

export interface ActiveStageRow {
  orderId: string;
  client: string;
  startDate: string;
  alert: string;
  pct: number;
  designName: string;
  designCode: string;
  currentStageName: string;
  currentStageGroup: string;
  stagesTotal: number;
  stagesDone: number;
}

function currentStageOf(stages: DesignStage[]): DesignStage | null {
  // First pending or delayed stage after all done ones
  return stages.find(s => s.status !== 'done') ?? null;
}

export function computeActiveStages(orders: Order[]): ActiveStageRow[] {
  const rows: ActiveStageRow[] = [];

  orders.forEach(o => {
    const alert = orderAlert(o);
    if (alert === 'done') return; // skip completed
    const pct = orderPct(o);

    (o.designs ?? []).forEach(d => {
      const current = currentStageOf(d.stages ?? []);
      const done = (d.stages ?? []).filter(s => s.status === 'done').length;
      rows.push({
        orderId: o.orderId,
        client: o.client,
        startDate: o.startDate,
        alert,
        pct,
        designName: d.name || '—',
        designCode: d.code || '—',
        currentStageName: current ? stageName(current.stageId) : 'Complete',
        currentStageGroup: current ? stageGroup(current.stageId) : 'finished',
        stagesTotal: d.stages?.length ?? 0,
        stagesDone: done,
      });
    });
  });

  // Sort: late first, then warn, then ok
  const order = { late: 0, warn: 1, ok: 2, done: 3 };
  return rows.sort((a, b) => (order[a.alert as keyof typeof order] ?? 9) - (order[b.alert as keyof typeof order] ?? 9));
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

// ─── Stage bottlenecks ────────────────────────────────────────────────────────

export interface StageBottleneckRow {
  stageId: string;
  stageName: string;
  group: string;
  pendingCount: number;   // designs currently waiting at this exact stage
  doneCount: number;      // designs that have passed this stage
  totalCount: number;     // total designs that have this stage
}

export function computeBottlenecks(orders: Order[]): StageBottleneckRow[] {
  const map = new Map<string, StageBottleneckRow>();

  DEFAULT_STAGES.forEach(t => {
    map.set(t.id, {
      stageId: t.id,
      stageName: t.name,
      group: t.group,
      pendingCount: 0,
      doneCount: 0,
      totalCount: 0,
    });
  });

  orders.forEach(o => {
    (o.designs ?? []).forEach(d => {
      (d.stages ?? []).forEach(s => {
        const row = map.get(s.stageId);
        if (!row) return;
        row.totalCount++;
        if (s.status === 'done') row.doneCount++;
        else {
          // It's "pending at this stage" only if all previous stages are done
          const idx = (d.stages ?? []).indexOf(s);
          const allPrevDone = (d.stages ?? []).slice(0, idx).every(prev => prev.status === 'done');
          if (allPrevDone) row.pendingCount++;
        }
      });
    });
  });

  return [...map.values()];
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
