import type { AppData, Order } from '../types';
import { coStage, type CoStageKey } from './coStageUtils';
import { catalogRowsOfOrder, type CatalogRow } from './familyUtils';
import { isOrderOverdue, daysUntilPromised, todayISO } from './orderUtils';

// ─── Client Dashboard aggregation ────────────────────────────────────────────
// Read-only derivations over the existing order data. Nothing here writes.

export interface DashItem extends CatalogRow {
  stage: CoStageKey;
  daysInStage: number | null;
  recvQty: Record<string, number>;
  received: number;   // total pieces actually back
  rejected: number;
}

export interface DashOrder {
  order: Order;
  items: DashItem[];
  counts: Record<CoStageKey, number>;
  dispatched: number;
  overdue: boolean;
  daysLeft: number | null;
}

export interface DashClient {
  client: string;
  phones: string[];
  orders: DashOrder[];
  itemCount: number;
  pieces: number;
  counts: Record<CoStageKey, number>;
  overdueOrders: number;
  soonestPromised: string | null;
  dispatchedPct: number;
}

const emptyCounts = (): Record<CoStageKey, number> =>
  ({ notStarted: 0, pipe: 0, karigar: 0, plating: 0, packing: 0, dispatched: 0 });

const sumOf = (s?: Record<string, number>) =>
  Object.values(s ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);

/** Timestamp the row entered its current stage, if we have one. */
function stageEnteredAt(holder: Record<string, unknown>, stage: CoStageKey): number | null {
  const pick = (k: string) => (typeof holder[k] === 'number' ? holder[k] as number : null);
  switch (stage) {
    case 'pipe':       return pick('pipeVendorAt');
    case 'karigar':    return pick('assignedVendorAt');
    case 'plating':    return pick('platingVendorAt');
    case 'packing':    return pick('platingReceivedAt');
    case 'dispatched': return pick('dispatchedAt');
    default:           return null;
  }
}

function holderOf(order: Order, row: CatalogRow): Record<string, unknown> {
  const d = order.designs.find(x => x.id === row.designId);
  if (!d) return {};
  if (row.varietyId === null) return d as unknown as Record<string, unknown>;
  const v = (d.varieties ?? []).find(x => x.id === row.varietyId);
  return (v ?? d) as unknown as Record<string, unknown>;
}

export function dashItemsOfOrder(data: AppData, order: Order): DashItem[] {
  const now = Date.now();
  return catalogRowsOfOrder(data, order).map(row => {
    const holder = holderOf(order, row);
    const stage = coStage(holder as Parameters<typeof coStage>[0]);
    const at = stageEnteredAt(holder, stage);
    const recvQty = (holder.recvQty as Record<string, number>) ?? {};
    const rejQty  = (holder.rejQty  as Record<string, number>) ?? {};
    return {
      ...row,
      stage,
      daysInStage: at ? Math.max(0, Math.floor((now - at) / 86400000)) : null,
      recvQty,
      received: sumOf(recvQty),
      rejected: sumOf(rejQty),
    };
  });
}

export function buildDashOrder(data: AppData, order: Order): DashOrder {
  const items = dashItemsOfOrder(data, order);
  const counts = emptyCounts();
  items.forEach(i => { counts[i.stage]++; });
  return {
    order,
    items,
    counts,
    dispatched: counts.dispatched,
    overdue: isOrderOverdue(order),
    daysLeft: daysUntilPromised(order),
  };
}

export interface DashFilters {
  tag?: string | null;
  stage?: CoStageKey | null;
  search?: string;
  includeArchived?: boolean;
}

export function buildDashboard(data: AppData, filters: DashFilters = {}): DashClient[] {
  const q = (filters.search ?? '').trim().toLowerCase();

  const orders = (data.orders ?? []).filter(o => {
    if (!filters.includeArchived && o.archived) return false;
    if (filters.tag && !(o.tags ?? []).includes(filters.tag)) return false;
    return true;
  });

  const byClient = new Map<string, DashClient>();

  orders.forEach(o => {
    const dash = buildDashOrder(data, o);

    // Search matches the client, order id, or any design code/name inside it.
    if (q) {
      const hit =
        o.client.toLowerCase().includes(q) ||
        (o.orderId || '').toLowerCase().includes(q) ||
        dash.items.some(i =>
          i.code.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q) ||
          i.family.toLowerCase().includes(q));
      if (!hit) return;
    }

    if (!byClient.has(o.client)) {
      byClient.set(o.client, {
        client: o.client, phones: [], orders: [], itemCount: 0, pieces: 0,
        counts: emptyCounts(), overdueOrders: 0, soonestPromised: null, dispatchedPct: 0,
      });
    }
    const c = byClient.get(o.client)!;
    c.orders.push(dash);
    c.itemCount += dash.items.length;
    c.pieces += dash.items.reduce((a, i) => a + i.qty, 0);
    dash.items.forEach(i => { c.counts[i.stage]++; });
    if (dash.overdue) c.overdueOrders++;
    if (o.phone && !c.phones.includes(o.phone)) c.phones.push(o.phone);
    if (o.promisedDate && (!c.soonestPromised || o.promisedDate < c.soonestPromised)) {
      c.soonestPromised = o.promisedDate;
    }
  });

  const out = [...byClient.values()];
  out.forEach(c => {
    c.dispatchedPct = c.itemCount ? Math.round((c.counts.dispatched / c.itemCount) * 100) : 0;
    c.orders.sort((a, b) => (a.order.promisedDate || '9999').localeCompare(b.order.promisedDate || '9999'));
  });

  // Most urgent first: overdue clients, then the ones with most outstanding work.
  return out.sort((a, b) =>
    (b.overdueOrders - a.overdueOrders) ||
    ((a.soonestPromised || '9999').localeCompare(b.soonestPromised || '9999')) ||
    (b.itemCount - a.itemCount));
}

export interface DashTotals {
  clients: number; orders: number; items: number; pieces: number;
  dispatched: number; overdueOrders: number; counts: Record<CoStageKey, number>;
}

export function dashboardTotals(clients: DashClient[]): DashTotals {
  const counts = emptyCounts();
  let orders = 0, items = 0, pieces = 0, overdueOrders = 0;
  clients.forEach(c => {
    orders += c.orders.length;
    items += c.itemCount;
    pieces += c.pieces;
    overdueOrders += c.overdueOrders;
    (Object.keys(counts) as CoStageKey[]).forEach(k => { counts[k] += c.counts[k]; });
  });
  return { clients: clients.length, orders, items, pieces, dispatched: counts.dispatched, overdueOrders, counts };
}

export function allTags(data: AppData): string[] {
  return [...new Set((data.orders ?? []).flatMap(o => o.tags ?? []))].sort();
}

export { todayISO };
