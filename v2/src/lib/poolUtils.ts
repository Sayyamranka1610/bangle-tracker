import type { AppData, Order, VendorDesign, PoolSource, DesignImage } from '../types';
import { coStage } from './coStageUtils';
import { catalogRowsOfOrder, familyOf, type CatalogRow } from './familyUtils';
import { uid } from './orderUtils';

// ─── Pooling Board ───────────────────────────────────────────────────────────
// Collects the same design wanted by several customers into one batch big
// enough to be worth sending to a vendor.
//
// The grouping axis depends on WHO the batch is for, and that is the whole
// insight behind this feature:
//   • Karigar / Pipe — pool by design CODE. A karigar makes 1203.29 Gold and
//     1203.29 Rose identically; only the plating differs. Merging them makes
//     the batch bigger for free.
//   • Plating — pool by CODE + FINISH, because that is exactly what differs.

export type PoolMode = 'pipe' | 'karigar' | 'plating';

export interface PoolContributor {
  row: CatalogRow;
  qty: number;
}

export interface PoolGroup {
  key: string;
  code: string;
  family: string;
  names: string[];
  finishes: string[];
  image?: string;
  ordered: Record<string, number>;   // size -> qty across all customers
  orderedTotal: number;
  contributors: PoolContributor[];
  clients: string[];
  unit: string;
}

const addInto = (target: Record<string, number>, src: Record<string, number>) => {
  Object.entries(src ?? {}).forEach(([k, v]) => {
    const n = Number(v) || 0;
    if (n > 0) target[k] = (target[k] ?? 0) + n;
  });
};

export const sumSizes = (s?: Record<string, number>) =>
  Object.values(s ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);

/**
 * A row can be pooled only if it has not been committed anywhere yet:
 * no vendor assigned at any stage, and not already pulled into a vendor order.
 * This is what stops the same goods being sent to a vendor twice.
 */
export function isPoolable(order: Order, row: CatalogRow): boolean {
  const d = order.designs.find(x => x.id === row.designId);
  if (!d) return false;
  const holder = row.varietyId === null ? d : (d.varieties ?? []).find(v => v.id === row.varietyId);
  if (!holder) return false;
  if (holder.importedToVOId) return false;
  return coStage(holder) === 'notStarted';
}

export function buildPoolGroups(data: AppData, mode: PoolMode): PoolGroup[] {
  const groups = new Map<string, PoolGroup>();

  (data.orders ?? [])
    .filter(o => !o.archived)
    .forEach(order => {
      catalogRowsOfOrder(data, order).forEach(row => {
        if (!isPoolable(order, row)) return;
        if (row.qty <= 0) return;

        const key = mode === 'plating'
          ? `${row.code}||${row.finish}`
          : row.code || `(no code)::${row.name}`;

        if (!groups.has(key)) {
          groups.set(key, {
            key,
            code: row.code || '(no code)',
            family: row.family,
            names: [],
            finishes: [],
            image: row.images?.[0]?.data,
            ordered: {},
            orderedTotal: 0,
            contributors: [],
            clients: [],
            unit: row.unit,
          });
        }
        const g = groups.get(key)!;
        if (row.name && !g.names.includes(row.name)) g.names.push(row.name);
        if (row.finish && row.finish !== '—' && !g.finishes.includes(row.finish)) g.finishes.push(row.finish);
        if (!g.image && row.images?.[0]?.data) g.image = row.images[0].data;
        if (!g.clients.includes(row.client)) g.clients.push(row.client);
        addInto(g.ordered, row.sizes);
        g.contributors.push({ row, qty: row.qty });
      });
    });

  const out = [...groups.values()];
  out.forEach(g => { g.orderedTotal = sumSizes(g.ordered); });
  return out.sort((a, b) => b.orderedTotal - a.orderedTotal);
}

/** Groups pool batches under their family, for display. */
export function groupByFamily(groups: PoolGroup[]): { family: string; groups: PoolGroup[] }[] {
  const by = new Map<string, PoolGroup[]>();
  groups.forEach(g => {
    if (!by.has(g.family)) by.set(g.family, []);
    by.get(g.family)!.push(g);
  });
  return [...by.entries()]
    .map(([family, gs]) => ({ family, groups: gs }))
    .sort((a, b) =>
      b.groups.reduce((x, g) => x + g.orderedTotal, 0) -
      a.groups.reduce((x, g) => x + g.orderedTotal, 0));
}

// ─── Extras the owner chooses to make ────────────────────────────────────────
// Never pre-filled. Buffer covers rejections; stock is speculative. Both are
// tracked separately from customer demand all the way through, so it is always
// clear which pieces are owed to somebody.

export interface Extras {
  buffer: Record<string, number>;
  stock: Record<string, number>;
}

export const emptyExtras = (): Extras => ({ buffer: {}, stock: {} });

export function makeQty(group: PoolGroup, extras: Extras): Record<string, number> {
  const out: Record<string, number> = {};
  addInto(out, group.ordered);
  addInto(out, extras.buffer);
  addInto(out, extras.stock);
  return out;
}

// ─── Turning selected batches into a vendor order ────────────────────────────

export interface BuildResult {
  designs: VendorDesign[];
  /** (orderDbId, designId, varietyId) tuples that must be stamped as imported. */
  touched: { orderDbId: string; designId: string; varietyId: string | null }[];
}

export function buildVendorDesigns(
  groups: PoolGroup[],
  extrasByKey: Record<string, Extras>,
): BuildResult {
  const designs: VendorDesign[] = [];
  const touched: BuildResult['touched'] = [];

  groups.forEach(g => {
    const extras = extrasByKey[g.key] ?? emptyExtras();
    const sizes = makeQty(g, extras);

    const sources: PoolSource[] = g.contributors.map(c => ({
      orderDbId: c.row.orderDbId,
      orderLabel: c.row.orderLabel,
      client: c.row.client,
      designId: c.row.designId,
      varietyId: c.row.varietyId,
      sizes: { ...c.row.sizes },
    }));

    g.contributors.forEach(c => {
      touched.push({ orderDbId: c.row.orderDbId, designId: c.row.designId, varietyId: c.row.varietyId });
    });

    const images: DesignImage[] = g.image ? [{ data: g.image }] : [];

    designs.push({
      id: uid(),
      name: g.names[0] || g.code,
      code: g.code === '(no code)' ? undefined : g.code,
      sizes,
      sizesLocked: false,
      images,
      varieties: [],
      unit: g.unit || 'pcs',
      sources,
      bufferSizes: Object.keys(extras.buffer).length ? { ...extras.buffer } : undefined,
      stockSizes: Object.keys(extras.stock).length ? { ...extras.stock } : undefined,
    });
  });

  return { designs, touched };
}

/**
 * Stamps importedToVOId on every source row so it can never be pooled again.
 * Mirrors assignUtils.markImported, but keyed off pool contributors.
 */
export function markPooled(
  orders: Order[],
  touched: BuildResult['touched'],
  voId: string,
): Order[] {
  const byOrder = new Map<string, BuildResult['touched']>();
  touched.forEach(t => {
    if (!byOrder.has(t.orderDbId)) byOrder.set(t.orderDbId, []);
    byOrder.get(t.orderDbId)!.push(t);
  });

  return orders.map(o => {
    const list = byOrder.get(o.id);
    if (!list) return o;
    return {
      ...o,
      designs: o.designs.map(d => {
        const flat = list.find(t => t.designId === d.id && t.varietyId === null);
        const vars = list.filter(t => t.designId === d.id && t.varietyId !== null);
        if (!flat && !vars.length) return d;
        return {
          ...d,
          ...(flat ? { importedToVOId: voId } : {}),
          varieties: d.varieties?.map(v =>
            vars.some(t => t.varietyId === v.id) ? { ...v, importedToVOId: voId } : v),
        };
      }),
    };
  });
}

// ─── Family helper re-export (keeps page imports tidy) ───────────────────────
export { familyOf };
