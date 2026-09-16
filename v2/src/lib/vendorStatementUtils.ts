import type { AppData, VendorOrder } from '../types';

// ─── Vendor pending-order statement ("what do I still owe you") ──────────────
// Ports Phase 1's openFollowUpVendorStatement() (bangle_v19.html ~L18323,
// part of the Sept 2026 Follow-up ledger redesign, `327819d`, later fixed
// for units/totals/photo size/print scale in `55b9282` and `ebc922c`) — a
// printable statement of every OPEN (not dispatched/delivered) vendor order
// for one vendor, grouped by order, each design showing its own photo and
// still-PENDING sizes only (already-received pieces are left off). Usable
// independently of the Follow-up ledger — a vendor asks "what do I still
// owe you" and this answers it on paper.
//
// **Deliberate simplification vs Phase 1:** Phase 1 tracks a per-row
// `received` boolean (and per-variety `received`) and skips a row once it's
// ticked. Phase 2 has no such boolean — VendorDesign instead accumulates
// `recvQty` (per size, across part-deliveries, see receiveUtils.ts) which is
// the real, finer-grained signal already used for actual receiving. Pending
// per size here is `sizes[sz] - (recvQty[sz] ?? 0)`, clamped at 0 — a design
// with nothing left pending is dropped from the statement entirely, same
// end result as Phase 1's `received` skip. Phase 2's VendorDesign also has
// no meaningful per-variety receiving (Pooling — the source of nearly every
// real vendor design — always builds flat, variety-less rows), so unlike
// Phase 1 this reads only the design-level `sizes`/`recvQty`, not varieties.

function sizeOrder(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const na = Number((a || '').split('/')[1]) || 0, nb = Number((b || '').split('/')[1]) || 0;
    return na !== nb ? na - nb : a.localeCompare(b);
  });
}

export interface StatementRow {
  code: string;
  name: string;
  image?: string;
  /** Still-pending sizes only — already-received pieces are left off. */
  sizes: Record<string, number>;
  unit: string;
  qty: number;
}

export interface StatementBlock {
  vo: VendorOrder;
  rows: StatementRow[];
  szKeys: string[];
  daysPending: number;
}

export interface VendorStatement {
  vendor: string;
  blocks: StatementBlock[];
  /** unit -> total pending qty across every block on this statement. */
  totals: Record<string, number>;
}

/** Pure — returns null when the vendor has nothing open, or everything open
 *  is already fully received. */
export function buildVendorStatement(data: AppData, vendorName: string, now: number = Date.now()): VendorStatement | null {
  const vos = (data.vendorOrders ?? []).filter(
    vo => vo.vendor === vendorName && vo.status !== 'delivered' && vo.status !== 'dispatched',
  );
  if (!vos.length) return null;

  const totals: Record<string, number> = {};
  const blocks: StatementBlock[] = [];

  vos.forEach(vo => {
    const rows: StatementRow[] = [];
    (vo.designs ?? []).forEach(d => {
      const sizes = d.sizes ?? {};
      const recv = d.recvQty ?? {};
      const pending: Record<string, number> = {};
      let qty = 0;
      Object.entries(sizes).forEach(([sz, n]) => {
        const ordered = Number(n) || 0;
        const already = Number(recv[sz]) || 0;
        const left = Math.max(0, ordered - already);
        if (left > 0) { pending[sz] = left; qty += left; }
      });
      if (qty <= 0) return; // fully received — nothing pending on this row
      rows.push({
        code: (d.code || '—').trim() || '—',
        name: d.name || '',
        image: d.images?.[0]?.data,
        sizes: pending,
        unit: d.unit || 'pcs',
        qty,
      });
    });
    if (!rows.length) return; // this vendor order is fully received

    rows.forEach(r => { totals[r.unit] = (totals[r.unit] ?? 0) + r.qty; });

    const anchorMs = vo.startDate ? new Date(`${vo.startDate}T00:00:00`).getTime() : now;
    const daysPending = Math.max(0, Math.floor((now - (Number.isFinite(anchorMs) ? anchorMs : now)) / 864e5));

    const szSet = new Set<string>();
    rows.forEach(r => Object.keys(r.sizes).forEach(sz => szSet.add(sz)));

    blocks.push({ vo, rows, szKeys: sizeOrder([...szSet]), daysPending });
  });

  if (!blocks.length) return null;
  return { vendor: vendorName, blocks, totals };
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(`${iso}T00:00:00`);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Side-effecting — opens a print-ready window, same @page/zoom/print-toolbar
 *  pattern as vendorPrintUtils.ts. Same 48mm photo size as Phase 1's fix
 *  (`ebc922c`) — the largest square that still leaves room for every size
 *  column + Total + Unit on one A4-width row. */
export function printVendorStatement(statement: VendorStatement): void {
  const w = window.open('', '_blank', 'width=980,height=780');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this page.'); return; }

  const totalsStr = Object.entries(statement.totals)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([u, n]) => `${n} ${u}`)
    .join(' + ') || '0 pcs';

  const orderBlocksHtml = statement.blocks.map(({ vo, rows, szKeys, daysPending }) => {
    const rowsHtml = rows.map(r => {
      const imgHtml = r.image
        ? `<img src="${esc(r.image)}" style="width:48mm;height:48mm;object-fit:cover;border-radius:8px;border:1px solid #D9D2BC">`
        : `<div style="width:48mm;height:48mm;border-radius:8px;background:#F1ECDC;border:1px solid #D9D2BC;display:flex;align-items:center;justify-content:center;font-size:40px">💍</div>`;
      const szCells = szKeys.map(sz =>
        `<td style="text-align:center;vertical-align:middle;padding:8px 8px;border-bottom:1px solid #E8E3D2;border-right:1px solid #E8E3D2;font-weight:700;font-size:17px">${r.sizes[sz] ? r.sizes[sz] : '—'}</td>`,
      ).join('');
      return `<tr style="break-inside:avoid;page-break-inside:avoid">`
        + `<td style="padding:6px 8px;vertical-align:middle;border-bottom:1px solid #E8E3D2;border-right:1px solid #E8E3D2">${imgHtml}</td>`
        + `<td style="padding:6px 10px;vertical-align:middle;border-bottom:1px solid #E8E3D2;border-right:1px solid #E8E3D2;text-align:left"><div style="font-weight:800;font-size:17px;color:#2A2618">${esc(r.code)}</div><div style="font-size:14px;color:#8A8368">${esc(r.name)}</div></td>`
        + szCells
        + `<td style="padding:8px 8px;vertical-align:middle;border-bottom:1px solid #E8E3D2;border-right:1px solid #E8E3D2;text-align:center;font-weight:800;color:#534AB7;background:#F1ECDC;font-size:18px">${r.qty}</td>`
        + `<td style="padding:8px 8px;vertical-align:middle;border-bottom:1px solid #E8E3D2;text-align:center;color:#5A5442;font-size:15px;font-weight:600">${esc(r.unit)}</td>`
        + `</tr>`;
    }).join('');

    return `<div style="margin-top:22px;break-inside:auto">`
      + `<div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:6px;margin-bottom:6px;border-bottom:1.5px solid #2A2618">`
      + `<span style="font-weight:800;font-size:17px;color:#2A2618">${esc(vo.orderId || 'VORD')} <span style="font-weight:500;font-size:14px;color:#8A8368">· ordered ${esc(fmtDate(vo.startDate))}</span></span>`
      + `<span style="font-weight:800;font-size:17px;color:#8A2E2E;white-space:nowrap">${daysPending} days pending</span>`
      + `</div>`
      + `<table style="width:100%;border-collapse:collapse;font-size:14px">`
      + `<thead><tr style="background:#534AB7;color:#fff">`
      + `<th style="padding:7px 8px;font-weight:700;font-size:14px">Photo</th>`
      + `<th style="padding:7px 10px;font-weight:700;font-size:14px;text-align:left">Design</th>`
      + szKeys.map(sz => `<th style="padding:7px 8px;font-weight:700;font-size:14px">${esc(sz)}</th>`).join('')
      + `<th style="padding:7px 8px;font-weight:700;font-size:14px">Total</th>`
      + `<th style="padding:7px 8px;font-weight:700;font-size:14px">Unit</th>`
      + `</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  }).join('');

  const today = new Date().toISOString().split('T')[0];

  w.document.write(`<!DOCTYPE html><html><head><title>Pending Order Statement — ${esc(statement.vendor)}</title>
    <style>
      @page{margin:5mm;size:A4 portrait}
      html{zoom:0.85}
      body{font-family:system-ui;padding:4mm 6mm;margin:0;color:#2A2618;font-size:13px;line-height:1.4}
      table{border-collapse:collapse}img{max-width:100%}
      @media print{button{display:none!important}.print-toolbar{display:none!important}}
    </style></head><body>
    <div class="print-toolbar" style="margin-bottom:10px;text-align:right"><button onclick="window.print()" style="padding:7px 14px;background:#534AB7;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨️ Print / Save as PDF</button></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2A2618;padding-bottom:10px">
      <div style="font-weight:800;font-size:19px;color:#2A2618">SIDDHI BANGLES</div>
      <div style="text-align:right;font-size:11.5px;color:#5A5442">${esc(fmtDate(today))}</div>
    </div>
    <div style="margin-top:14px;font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#5A5442">Pending Order Statement</div>
    <div style="margin-top:4px;font-weight:600;font-size:15px;color:#2A2618">To: ${esc(statement.vendor)}</div>
    ${orderBlocksHtml}
    <div style="margin-top:18px;font-size:12px;color:#5A5442;padding-top:10px;border-top:1px solid #E8E3D2">${statement.blocks.length} order${statement.blocks.length !== 1 ? 's' : ''} totalling ${esc(totalsStr)} ${statement.blocks.length !== 1 ? 'are' : 'is'} still outstanding. Kindly confirm delivery status at the earliest.</div>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
  </body></html>`);
  w.document.close();
}
