import type { Order, VendorOrder, VendorDesign, DesignVariety, DesignImage } from '../types';
import { isFlatDesign, hasOnlyDefault, coStage, type CoStageKey } from './coStageUtils';
import { uid } from './orderUtils';

// ─── Assign — queue customer-order design/variety rows, then create or add to
// a Vendor Order. Mirrors Phase 1's Assign tab exactly (_assignQueueAdd /
// _assignBuildVODesigns / _assignSubmitNew / _assignAddToExisting).
// The queue itself is local UI state (never persisted) — same as Phase 1's
// window._assignQueue, which lives only in memory until submitted.

export interface QueueItem {
  orderDbId: string;
  designId: string;
  varietyId: string | null; // null = flat/CNC row
  isFlat: boolean;
  orderId: string;   // ORD-NNN label
  client: string;
  code: string;
  name: string;
  varName: string | null;
  qty: number;
  sizes: Record<string, number>;
  images: DesignImage[];
  unit: string;
}

export interface AssignRow {
  orderDbId: string;
  designId: string;
  varietyId: string | null;
  isFlat: boolean;
  code: string;
  name: string;
  varName: string | null;
  qty: number;
  stage: CoStageKey;
  importedToVOId: string | null;
  thumb: string | null;
}

function rowQty(sizes: Record<string, number> | undefined): number {
  return Object.values(sizes ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
}

// Every queueable row across every order, grouped by order — mirrors the left
// panel of Phase 1's Assign tab.
export function buildAssignRows(order: Order): AssignRow[] {
  const rows: AssignRow[] = [];
  (order.designs ?? []).forEach(d => {
    if (isFlatDesign(order, d)) {
      const sizes = hasOnlyDefault(d) ? (d.varieties?.[0]?.sizes ?? {}) : (d.sizes ?? {});
      rows.push({
        orderDbId: order.id, designId: d.id, varietyId: null, isFlat: true,
        code: d.code || '', name: d.name || '', varName: null,
        qty: rowQty(sizes), stage: coStage(d), importedToVOId: d.importedToVOId ?? null,
        thumb: d.images?.[0]?.data ?? null,
      });
    } else {
      (d.varieties ?? []).forEach(v => {
        rows.push({
          orderDbId: order.id, designId: d.id, varietyId: v.id, isFlat: false,
          code: d.code || '', name: d.name || '', varName: v.name || null,
          qty: rowQty(v.sizes), stage: coStage(v), importedToVOId: v.importedToVOId ?? null,
          thumb: v.images?.[0]?.data ?? null,
        });
      });
    }
  });
  return rows;
}

export function makeQueueItem(order: Order, row: AssignRow): QueueItem | null {
  const design = order.designs.find(d => d.id === row.designId);
  if (!design) return null;
  const holder = row.isFlat ? design : design.varieties?.find(v => v.id === row.varietyId);
  if (!holder) return null;
  const sizes = row.isFlat ? (hasOnlyDefault(design) ? (design.varieties?.[0]?.sizes ?? {}) : (design.sizes ?? {})) : ((holder as DesignVariety).sizes ?? {});
  const images = row.isFlat ? (design.images ?? []) : ((holder as DesignVariety).images ?? []);
  const unit = row.isFlat ? (design.unit ?? 'pcs') : ((holder as DesignVariety).unit ?? 'pcs');
  return {
    orderDbId: order.id, designId: design.id, varietyId: row.varietyId, isFlat: row.isFlat,
    orderId: order.orderId, client: order.client,
    code: design.code || '', name: design.name || '', varName: row.varName,
    qty: row.qty, sizes: { ...sizes }, images: images.map(i => ({ ...i })), unit,
  };
}

// Groups queued items by name+code into VendorDesign objects — mirrors
// _assignBuildVODesigns() exactly (flat items become sizes/images directly,
// variety items get collected into a varieties[] array).
export function buildVendorDesignsFromQueue(queue: QueueItem[]): VendorDesign[] {
  const groups = new Map<string, { name: string; code: string; isFlat: boolean; sizes: Record<string, number>; images: DesignImage[]; unit: string; varieties: DesignVariety[] }>();
  const order: string[] = [];

  queue.forEach(item => {
    const key = `${item.name || '?'}||${item.code || ''}`;
    if (!groups.has(key)) {
      groups.set(key, { name: item.name, code: item.code, isFlat: item.isFlat, sizes: {}, images: [], unit: item.unit, varieties: [] });
      order.push(key);
    }
    const g = groups.get(key)!;
    if (item.isFlat) {
      g.sizes = { ...item.sizes };
      g.images = item.images.map(i => ({ ...i }));
      g.unit = item.unit;
    } else {
      g.varieties.push({ id: uid(), name: item.varName ?? '', sizes: { ...item.sizes }, images: item.images.map(i => ({ ...i })), unit: item.unit });
    }
  });

  return order.map(key => {
    const g = groups.get(key)!;
    const sizes = g.isFlat ? g.sizes : g.varieties.reduce<Record<string, number>>((acc, v) => {
      Object.entries(v.sizes ?? {}).forEach(([sz, q]) => { acc[sz] = (acc[sz] ?? 0) + (Number(q) || 0); });
      return acc;
    }, {});
    return { id: uid(), name: g.name, code: g.code, sizesLocked: false, sizes, images: g.images, varieties: g.varieties, unit: g.unit || 'pcs' };
  });
}

// Stamps importedToVOId on every source row the queue came from — mirrors
// _assignMarkImported() exactly.
export function markImported(orders: Order[], queue: QueueItem[], voId: string): Order[] {
  const byOrder = new Map<string, QueueItem[]>();
  queue.forEach(item => {
    if (!byOrder.has(item.orderDbId)) byOrder.set(item.orderDbId, []);
    byOrder.get(item.orderDbId)!.push(item);
  });

  return orders.map(o => {
    const items = byOrder.get(o.id);
    if (!items) return o;
    return {
      ...o,
      designs: o.designs.map(d => {
        const flatItem = items.find(i => i.designId === d.id && i.isFlat);
        const varietyItems = items.filter(i => i.designId === d.id && !i.isFlat);
        if (!flatItem && !varietyItems.length) return d;
        return {
          ...d,
          importedToVOId: flatItem ? voId : d.importedToVOId,
          varieties: d.varieties?.map(v => {
            const match = varietyItems.find(i => i.varietyId === v.id);
            return match ? { ...v, importedToVOId: voId } : v;
          }),
        };
      }),
    };
  });
}

export function openVendorOrders(vendorOrders: VendorOrder[]): VendorOrder[] {
  return vendorOrders.filter(vo => vo.status !== 'delivered' && vo.status !== 'dispatched');
}
