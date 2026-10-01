import * as XLSX from 'xlsx';
import type { AppData } from '../types';
import { orderPct, orderStatus } from './coStageUtils';
import { catalogRowsOfOrder, type CatalogRow } from './familyUtils';

// ─── Whole-dashboard Excel export ─────────────────────────────────────────────
// Ports Phase 1's exportExcelFull() (bangle_v19.html ~L13956) — the main
// "export everything" button CLAUDE.md's feature list refers to. Two sheets
// instead of Phase 1's three:
//   - Summary: one row per order.
//   - Design & Variety Breakdown: one row per flat design or per variety,
//     size columns exploded (built from catalogRowsOfOrder — the same
//     flat-vs-variety flattening already used everywhere else in Phase 2:
//     Dashboard, Pooling, order-value math).
// Phase 1's third sheet (Production Stages) is deliberately NOT ported — it
// reads `design.stages[]`, which this project already confirmed is dead
// code with no live trigger path in Phase 1 itself (see PHASE2_TRACKER.md
// items #19/#20/#22 — the same reasoning that removed the Inventory page
// and the stages[]-based Analytics sections). Phase 1's Summary sheet also
// used the dead 4-state `orderAlert()` (ok/warn/late/done, always 0 for
// warn/late — item #22); this uses the real 2-state `orderStatus()`/
// `orderPct()` Phase 2 already computes everywhere else instead.

const SIZE_ORDER = ['2/2', '2/4', '2/6', '2/8', '2/10', '2/12', '2/14', '2/16'];

function sortSizes(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

export function exportOrdersToExcel(data: AppData): void {
  const orders = (data.orders ?? []).filter(o => !o.archived);
  const wb = XLSX.utils.book_new();

  const rowsByOrder = new Map<string, CatalogRow[]>();
  const allSizeSet = new Set<string>();
  orders.forEach(o => {
    const rows = catalogRowsOfOrder(data, o);
    rowsByOrder.set(o.id, rows);
    rows.forEach(r => Object.entries(r.sizes ?? {}).forEach(([sz, n]) => { if ((Number(n) || 0) > 0) allSizeSet.add(sz); }));
  });
  const allSizes = sortSizes([...allSizeSet]);

  const summaryRows: (string | number)[][] = [
    ['Order ID', 'Client', 'Start Date', 'Priority', 'Status', '% Done', 'Total Qty', 'Designs', 'Notes'],
  ];
  const dvRows: (string | number)[][] = [];

  orders.forEach(o => {
    const rows = rowsByOrder.get(o.id) ?? [];
    const totalQty = rows.reduce((a, r) => a + r.qty, 0);
    const statusLabel = orderStatus(o) === 'done' ? 'Completed' : 'Pending';
    summaryRows.push([
      o.orderId, o.client, o.startDate, o.priority, statusLabel,
      `${orderPct(o)}%`, totalQty, o.designs.length, o.notes ?? '',
    ]);

    rows.forEach(r => {
      const sizeVals = allSizes.map(sz => Number(r.sizes[sz]) || 0);
      dvRows.push([
        o.orderId, o.client, o.priority, statusLabel,
        r.name, r.code, r.varName ?? '—',
        ...sizeVals, r.qty, r.unit,
      ]);
    });
  });

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  const dvHeader = ['Order ID', 'Client', 'Priority', 'Status', 'Design Name', 'Design Code', 'Variety', ...allSizes, 'Total Qty', 'Unit'];
  const ws2 = XLSX.utils.aoa_to_sheet([dvHeader, ...dvRows]);
  ws2['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 18 },
    ...allSizes.map(() => ({ wch: 7 })), { wch: 10 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Design & Variety Breakdown');

  XLSX.writeFile(wb, `bangle_dashboard_${new Date().toISOString().split('T')[0]}.xlsx`);
}
