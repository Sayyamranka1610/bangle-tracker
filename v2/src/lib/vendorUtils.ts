import type { VendorOrder, VendorStatus, AlertLevel } from '../types';

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

export function vendorAlert(vo: VendorOrder): AlertLevel {
  if (!vo.deliveryDate) return 'ok';
  const today = new Date().toISOString().slice(0, 10);
  if (vo.deliveryDate < today && vo.status !== 'delivered') return 'late';
  const diff = (new Date(vo.deliveryDate).getTime() - Date.now()) / 864e5;
  if (diff <= 7 && vo.status !== 'delivered') return 'warn';
  if (vo.status === 'delivered') return 'done';
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
  ok:   { label: 'On Track', color: 'text-green-400',  bg: 'bg-green-500/15',  bar: 'bg-green-500' },
  warn: { label: 'Due Soon', color: 'text-yellow-400', bg: 'bg-yellow-500/15', bar: 'bg-yellow-500' },
  late: { label: 'Overdue',  color: 'text-red-400',    bg: 'bg-red-500/15',    bar: 'bg-red-500' },
  done: { label: 'Delivered',color: 'text-indigo-400', bg: 'bg-indigo-500/15', bar: 'bg-indigo-500' },
};

// ─── Summary stats ────────────────────────────────────────────────────────────

export interface VendorStats {
  total: number;
  onTrack: number;
  soon: number;
  late: number;
  done: number;
}

export function computeVendorStats(orders: VendorOrder[]): VendorStats {
  const s: VendorStats = { total: orders.length, onTrack: 0, soon: 0, late: 0, done: 0 };
  orders.forEach(o => {
    const a = vendorAlert(o);
    if (a === 'ok') s.onTrack++;
    else if (a === 'warn') s.soon++;
    else if (a === 'late') s.late++;
    else if (a === 'done') s.done++;
  });
  return s;
}
