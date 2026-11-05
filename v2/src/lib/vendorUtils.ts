import type { VendorOrder, VendorStatus, AlertLevel, VendorDesign } from '../types';

// ─── ID generation ────────────────────────────────────────────────────────────

export function genVendorOrderId(existing: VendorOrder[]): string {
  const nums = existing.map(o => {
    const m = o.orderId.match(/VORD-?(\d+)/i);
    return m ? parseInt(m[1]) : 0;
  });
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return 'VORD-' + String(next).padStart(2, '0');
}

// ─── Status alert (mirrors Phase 1 vendorOrderAlert) ─────────────────────────

// ─── "Is this vendor order finished?" — shared by every screen ────────────────
// Phase 1 treats a vendor order as done when it was marked Delivered, OR when
// every row has been ticked received (people forget to flip the status after
// the last row comes in), and hides it from the live lists once archived.

function isDefaultOnly(d: VendorDesign): boolean {
  const v = d.varieties ?? [];
  // Phase 1's exact test: one variety whose name is blank or "Default" is just the
  // row itself, not a real variety.
  const n = (v[0]?.name ?? '').trim().toLowerCase();
  return v.length === 1 && !(n && n !== 'default');
}

/** Every size on the row has come back in full (Phase 2's quantity-based receiving). */
function quantitiesCovered(sizes: Record<string, number> | undefined, recv: Record<string, number> | undefined): boolean {
  const entries = Object.entries(sizes ?? {}).filter(([, n]) => (Number(n) || 0) > 0);
  if (!entries.length) return false;
  return entries.every(([s, n]) => (Number(recv?.[s]) || 0) >= (Number(n) || 0));
}

/** Mirrors Phase 1's _voRowsProgress(): a plain row counts once, a row with real
 *  varieties counts each variety. A row is received if Phase 1's tick is set
 *  OR Phase 2's recorded quantities cover it fully. */
export function voRowsProgress(vo: VendorOrder): { received: number; total: number } {
  let received = 0, total = 0;
  (vo.designs ?? []).forEach(d => {
    const varieties = d.varieties ?? [];
    const flat = varieties.length === 0 || isDefaultOnly(d);
    if (flat) {
      total++;
      if (d.received || quantitiesCovered(d.sizes, d.recvQty)) received++;
    } else {
      varieties.forEach(v => { total++; if (v.received) received++; });
    }
  });
  return { received, total };
}

export function isVoFullyReceived(vo: VendorOrder): boolean {
  const p = voRowsProgress(vo);
  return p.total > 0 && p.received === p.total;
}

/** Finished = marked Delivered, or every row already received. */
export function isVoDone(vo: VendorOrder): boolean {
  return vo.status === 'delivered' || isVoFullyReceived(vo);
}

// ─── Status alert (mirrors Phase 1 vendorOrderAlert, plus Phase 2's due-date warnings) ─

export function vendorAlert(vo: VendorOrder): AlertLevel {
  if (isVoDone(vo)) return 'done';
  if (!vo.deliveryDate) return 'ok';
  const today = new Date().toISOString().slice(0, 10);
  if (vo.deliveryDate < today) return 'late';
  const diff = (new Date(vo.deliveryDate).getTime() - Date.now()) / 864e5;
  if (diff <= 7) return 'warn';
  return 'ok';
}

// ─── Status progress % ────────────────────────────────────────────────────────

export const STATUS_PCT: Record<VendorStatus, number> = {
  pending:    0,
  processing: 25,
  in_progress: 50,
  qa:         75,
  dispatched: 90,
  delivered:  100,
};

export const STATUS_LABELS: Record<VendorStatus, string> = {
  pending:    'Pending',
  processing: 'Processing',
  in_progress: 'In Progress',
  qa:         'QA / Review',
  dispatched: 'Dispatched',
  delivered:  'Delivered',
};

export const ALL_STATUSES: VendorStatus[] = [
  'pending', 'processing', 'in_progress', 'qa', 'dispatched', 'delivered',
];

// ─── Alert config ─────────────────────────────────────────────────────────────

export const ALERT_CONFIG: Record<AlertLevel, { label: string; color: string; bg: string; bar: string }> = {
  ok:   { label: 'On Track', color: 'text-green-700',  bg: 'bg-green-500/15',  bar: 'bg-green-500' },
  warn: { label: 'Due Soon', color: 'text-yellow-700', bg: 'bg-yellow-500/15', bar: 'bg-yellow-500' },
  late: { label: 'Overdue',  color: 'text-red-700',    bg: 'bg-red-500/15',    bar: 'bg-red-500' },
  done: { label: 'Delivered',color: 'text-indigo-700', bg: 'bg-indigo-500/15', bar: 'bg-indigo-500' },
};

// ─── Summary stats ────────────────────────────────────────────────────────────

export interface VendorStats {
  /** Active (not archived) vendor orders — what the Vendors screen counts as "Total". */
  total: number;
  pending: number;
  done: number;
  archived: number;
  // Phase 2's due-date buckets, counted over pending orders only.
  onTrack: number;
  soon: number;
  late: number;
}

export function computeVendorStats(orders: VendorOrder[]): VendorStats {
  const s: VendorStats = { total: 0, pending: 0, done: 0, archived: 0, onTrack: 0, soon: 0, late: 0 };
  orders.forEach(o => {
    if (o.archived) { s.archived++; return; }
    s.total++;
    const a = vendorAlert(o);
    if (a === 'done') { s.done++; return; }
    s.pending++;
    if (a === 'ok') s.onTrack++;
    else if (a === 'warn') s.soon++;
    else if (a === 'late') s.late++;
  });
  return s;
}
