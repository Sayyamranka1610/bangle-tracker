import type { StageTemplate, StageGroup, EmbeddedDesign, DesignStage, Order, DesignVariety } from '../types';
import { orderStatus } from './coStageUtils';
import { csvEncode, downloadCSV } from './csvUtils';

// ─── Stage templates (mirrors Phase 1 DEFAULT_STAGES) ────────────────────────

export const DEFAULT_STAGES: StageTemplate[] = [
  { id: 's1', name: 'Metal ordering',           loc: 'Supplier',               days: 2, urgDays: 1, group: 'raw' },
  { id: 's2', name: 'Pipe cutting',              loc: 'External cutter',        days: 3, urgDays: 2, group: 'raw' },
  { id: 's3', name: 'Receive cut pipes',         loc: 'Your factory',           days: 1, urgDays: 1, group: 'raw' },
  { id: 's4', name: 'Bangle designing (CNC)',    loc: 'Karigar / job worker',   days: 5, urgDays: 3, group: 'semi' },
  { id: 's5', name: 'Receive designed pieces',   loc: 'Your factory',           days: 1, urgDays: 1, group: 'semi' },
  { id: 's6', name: 'Plating',                   loc: 'External plater',        days: 4, urgDays: 2, group: 'semi' },
  { id: 's7', name: 'Receive plated bangles',    loc: 'Your factory',           days: 1, urgDays: 1, group: 'semi' },
  { id: 's8', name: 'Packaging',                 loc: 'Factory (payroll)',      days: 2, urgDays: 1, group: 'finished' },
  { id: 's9', name: 'Dispatch to client',        loc: 'Transport',              days: 1, urgDays: 1, group: 'finished' },
];

export const DEFAULT_SIZES = ['2/2', '2/4', '2/6', '2/8', '2/10', '2/12'];

export const GROUP_ORDER: StageGroup[] = ['raw', 'semi', 'finished'];

export const GROUP_LABELS: Record<StageGroup, string> = {
  raw:      'Raw Material',
  semi:     'Semi-Finished',
  finished: 'Finished Goods',
};

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getTemplate(stageId: string): StageTemplate | undefined {
  return DEFAULT_STAGES.find(s => s.id === stageId);
}

// Accept a stage object directly so we can use its inline name/group first
export function stageName(stageIdOrStage: string | { stageId: string; name?: string }): string {
  if (typeof stageIdOrStage === 'string') return getTemplate(stageIdOrStage)?.name ?? stageIdOrStage;
  return stageIdOrStage.name ?? getTemplate(stageIdOrStage.stageId)?.name ?? stageIdOrStage.stageId;
}

export function stageGroup(stageIdOrStage: string | { stageId: string; group?: string }): StageGroup {
  if (typeof stageIdOrStage === 'string') return getTemplate(stageIdOrStage)?.group ?? 'raw';
  return (stageIdOrStage.group as StageGroup | undefined) ?? getTemplate(stageIdOrStage.stageId)?.group ?? 'raw';
}

// Build fresh stage list for a new design — stores template data inline
export function makeStageFresh(): import('../types').DesignStage[] {
  return DEFAULT_STAGES.map(s => ({
    stageId: s.id,
    name: s.name,
    loc: s.loc,
    group: s.group,
    status: 'pending' as const,
    completionDate: undefined,
    vendor: '',
    stageNote: '',
    qty: undefined,
  }));
}

// ─── Quantity helpers ─────────────────────────────────────────────────────────

export function varietyTotalQty(variety: DesignVariety): number {
  return Object.values(variety.sizes ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
}

export function designTotalQty(design: EmbeddedDesign): number {
  if (design.varieties?.length) {
    return design.varieties.reduce((acc, v) => acc + varietyTotalQty(v), 0);
  }
  return Object.values(design.sizes ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
}

export function aggreagatedSizes(design: EmbeddedDesign): Record<string, number> {
  if (design.sizes && Object.keys(design.sizes).length) return design.sizes;
  if (design.varieties?.length) {
    const agg: Record<string, number> = {};
    design.varieties.forEach(v => {
      Object.entries(v.sizes ?? {}).forEach(([sz, q]) => {
        agg[sz] = (agg[sz] ?? 0) + (Number(q) || 0);
      });
    });
    return agg;
  }
  return {};
}

// ─── Stage progress ───────────────────────────────────────────────────────────

export function stagesDone(stages: DesignStage[]): number {
  return stages.filter(s => s.status === 'done').length;
}

export function designPct(design: EmbeddedDesign): number {
  if (!design.stages.length) return 0;
  return Math.round(stagesDone(design.stages) / design.stages.length * 100);
}

// ─── Build a design group map: code → { design, order }[] ────────────────────

export interface DesignEntry {
  design: EmbeddedDesign;
  order: Order;
  orderIndex: number;
  designIndex: number;
}

export function buildCodeMap(orders: Order[]): Map<string, DesignEntry[]> {
  const map = new Map<string, DesignEntry[]>();
  orders.forEach((order, oi) => {
    (order.designs ?? []).forEach((design, di) => {
      const key = design.code?.trim() || '(no code)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ design, order, orderIndex: oi, designIndex: di });
    });
  });
  return map;
}

// ─── Status display helpers ───────────────────────────────────────────────────

export const STATUS_CONFIG = {
  done:    { label: 'Done',    dot: 'bg-green-500',  text: 'text-green-400',  bg: 'bg-green-500/15' },
  delayed: { label: 'Delayed', dot: 'bg-red-500',    text: 'text-red-400',    bg: 'bg-red-500/15' },
  pending: { label: 'Pending', dot: 'bg-white/20',   text: 'text-white/40',   bg: 'bg-white/5' },
} satisfies Record<string, { label: string; dot: string; text: string; bg: string }>;

// ─── Design CSV export (ports Phase 1's exportDesignCSV()) ───────────────────
// Adapted to Phase 2's simplified 2-state order status (done/pending — see
// PHASE2_TRACKER.md item #22) and omits the legacy per-stage "Days Budget" /
// "Target Date" columns, which relied on Phase 1 deadline math that Phase 2
// doesn't compute for this checklist (the live coStage engine drives real
// deadlines instead — see coStageUtils.ts header comment).
export function buildDesignCSVRows(code: string, entries: DesignEntry[]): (string | number)[][] {
  const allSizes = DEFAULT_SIZES;
  const rows: (string | number)[][] = [
    ['=== DESIGN EXPORT ===', 'Code:', code, 'Name:', entries[0]?.design.name ?? ''],
    ['Appears in', entries.length, 'order(s)'],
    [],
    ['Order ID', 'Client', 'Start Date', 'Priority', 'Status', 'Variety Name', ...allSizes, 'Total Qty'],
  ];

  entries.forEach(({ order, design }) => {
    const statusLabel = orderStatus(order) === 'done' ? 'Done' : 'Pending';
    const varieties = design.varieties?.length ? design.varieties : [{ name: '—', sizes: design.sizes ?? {} } as DesignVariety];
    varieties.forEach(v => {
      const sizeVals = allSizes.map(sz => Number(v.sizes?.[sz]) || 0);
      rows.push([order.orderId, order.client, order.startDate, order.priority, statusLabel, v.name, ...sizeVals, sizeVals.reduce((a, x) => a + x, 0)]);
    });
  });

  rows.push([]);
  rows.push(['=== PRODUCTION STAGES ===']);
  rows.push(['Order ID', 'Client', 'Stage #', 'Stage Name', 'Location', 'Vendor', 'Status', 'Stage Notes']);
  entries.forEach(({ order, design }) => {
    design.stages.forEach((st, si) => {
      rows.push([order.orderId, order.client, si + 1, stageName(st), st.loc ?? '', st.vendor ?? '', STATUS_CONFIG[st.status]?.label ?? st.status, st.stageNote ?? '']);
    });
  });

  return rows;
}

export function exportDesignCSV(code: string, entries: DesignEntry[]) {
  const rows = buildDesignCSVRows(code, entries);
  downloadCSV(csvEncode(rows), `design_${code.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
}

// ─── Design print (scoped-down port of Phase 1's printByDesign()) ────────────
// Phase 1's print goes through openPrintWindow()/buildPrintableOrder(), a large
// shared subsystem that renders full order detail (all tabs, images, rate
// sheets). Reproducing that in full for a single design-group print button is
// out of scope here — this instead opens a focused printable summary (one row
// per order/variety, sizes + stage progress), which covers the documented gap
// (no per-item print at all) without importing that whole subsystem.
function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function printDesignGroup(code: string, entries: DesignEntry[]) {
  const w = window.open('', '_blank', 'width=980,height=780');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this page.'); return; }
  const allSizes = DEFAULT_SIZES;
  const name = entries[0]?.design.name ?? '';

  const rowsHtml = entries.map(({ order, design }) => {
    const statusLabel = orderStatus(order) === 'done' ? 'Done' : 'Pending';
    const varieties = design.varieties?.length ? design.varieties : [{ name: '—', sizes: design.sizes ?? {} } as DesignVariety];
    const pct = designPct(design);
    return varieties.map(v => {
      const sizeVals = allSizes.map(sz => Number(v.sizes?.[sz]) || 0);
      const total = sizeVals.reduce((a, x) => a + x, 0);
      return `<tr>
        <td>${esc(order.orderId)}</td><td>${esc(order.client)}</td><td>${esc(order.startDate)}</td>
        <td>${esc(order.priority)}</td><td>${esc(statusLabel)}</td><td>${esc(v.name)}</td>
        ${sizeVals.map(v => `<td style="text-align:center">${v || ''}</td>`).join('')}
        <td style="text-align:center;font-weight:600">${total}</td>
        <td style="text-align:center">${pct}%</td>
      </tr>`;
    }).join('');
  }).join('');

  w.document.write(`<!DOCTYPE html><html><head><title>Design: ${esc(code)}</title>
    <style>
      @page{margin:5mm;size:A4 landscape}
      body{font-family:system-ui;padding:4mm 6mm;color:#1a1916;font-size:12px;margin:0;line-height:1.4}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ddd;padding:4px 6px;font-size:11px}
      th{background:#f0efff;color:#3C3489;text-align:left}
      @media print{ .print-toolbar{display:none!important} }
    </style>
    </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #534AB7">
      <h1 style="font-size:19px;color:#3C3489;margin:0;font-weight:700">Siddhi Bangles — Design: ${esc(code)}${name && name !== code ? ' (' + esc(name) + ')' : ''}</h1>
      <div style="text-align:right;font-size:12px"><strong>${entries.length} order${entries.length !== 1 ? 's' : ''}</strong><br><span style="color:#888;font-size:11px">Printed: ${new Date().toLocaleDateString()}</span></div>
    </div>
    <div class="print-toolbar" style="margin-bottom:10px"><button onclick="window.print()" style="padding:7px 14px;background:#534AB7;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨️ Print</button></div>
    <table>
      <thead><tr><th>Order ID</th><th>Client</th><th>Start Date</th><th>Priority</th><th>Status</th><th>Variety</th>${allSizes.map(sz => `<th>${esc(sz)}</th>`).join('')}<th>Total</th><th>Progress</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
    </body></html>`);
  w.document.close();
}
