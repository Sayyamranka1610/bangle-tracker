import type { VendorOrder, VendorDesign, DesignVariety } from '../types';
import { voQty } from './vendorWhoUtils';

// ─── Vendor order print (scoped-down port of Phase 1's openVendorPrintWindow()) ─
// Phase 1's print goes through a large shared subsystem (photo galleries in
// two layout modes, grouping by design name, rate columns) — reproducing all
// of that here is out of scope, matching the same call made for the Designs
// page print earlier in this project. This instead focuses on the one real
// gap flagged for Phase 2: an "Internal use" copy that shows which
// customer(s) each pooled row is for, reusing the SAME table columns as the
// row above it (not a separate nested table) — a design 2 pointer straight
// from Phase 1's own reasoning (bangle_v19.html ~L12260), because a nested
// table's own columns shift the size numbers out from under the real
// 2/2, 2/4… headers.

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function sizeOrder(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const na = Number((a || '').split('/')[1]) || 0, nb = Number((b || '').split('/')[1]) || 0;
    return na !== nb ? na - nb : a.localeCompare(b);
  });
}

function isFlatDesign(d: VendorDesign): boolean {
  const varieties = d.varieties ?? [];
  return varieties.length === 0 || (varieties.length === 1 && (varieties[0].name || '').trim().toLowerCase() === 'default');
}

function extraSizesOf(d: VendorDesign): Record<string, number> {
  const out: Record<string, number> = {};
  Object.entries(d.bufferSizes ?? {}).forEach(([sz, n]) => { out[sz] = (out[sz] ?? 0) + (Number(n) || 0); });
  Object.entries(d.stockSizes ?? {}).forEach(([sz, n]) => { out[sz] = (out[sz] ?? 0) + (Number(n) || 0); });
  return out;
}

// Builds the sub-row(s) shown under a design/variety row on the internal
// copy — reusing the same <td> columns as the row above (colCount matches
// that row's column count exactly).
function forRowsHtml(d: VendorDesign, szKeys: string[], rowTotal: number, colCount: number): string {
  const sources = d.sources ?? [];
  const extraSizes = extraSizesOf(d);
  const extraQty = voQty(extraSizes);

  if (!sources.length && !extraQty) {
    return `<tr><td colspan="${colCount}" style="background:#FFF9EE;border-bottom:1px solid #F0E4C8;padding:6px 10px;font-size:12px;color:#C0392B;font-weight:700">└ ⚠ Not linked to any customer order — check before sending</td></tr>`;
  }

  const szTotals: Record<string, number> = {};
  szKeys.forEach(sz => { szTotals[sz] = 0; });
  const addRow = (label: string, sizes: Record<string, number> | undefined, italic: boolean) => {
    szKeys.forEach(sz => { szTotals[sz] += Number(sizes?.[sz]) || 0; });
    const clr = italic ? '#7A7768' : '#6B5215';
    return `<tr style="background:${italic ? '#F5F3EC' : '#FFF9EE'}">`
      + `<td style="padding:5px 10px;padding-left:20px;font-size:12px;color:${clr};${italic ? 'font-style:italic' : 'font-weight:700'}">└ ${esc(label)}</td>`
      + szKeys.map(sz => `<td style="padding:5px 8px;text-align:center;font-size:12px;color:${clr}${italic ? ';font-style:italic' : ''}">${Number(sizes?.[sz]) || 0}</td>`).join('')
      + `<td style="padding:5px 8px;text-align:center;font-size:12px;font-weight:700;color:${clr}">${voQty(sizes)}</td>`
      + `<td></td></tr>`;
  };

  let rows = sources.map(s => addRow(`${s.orderLabel || 'CO'} · ${s.client || ''}`, s.sizes, false)).join('');
  if (extraQty > 0) rows += addRow('Extra (buffer/stock)', extraSizes, true);

  const accounted = Object.values(szTotals).reduce((a, v) => a + v, 0);
  if (accounted !== rowTotal) {
    rows += `<tr><td colspan="${colCount}" style="background:#FFF8E1;border-top:1px solid #FFD54F;padding:6px 10px;font-size:11px;color:#8A5A00">⚠ Adds up to ${accounted}, but this row shows ${rowTotal} — it was changed by hand after pooling; check before sending.</td></tr>`;
  }
  return rows;
}

export interface PrintVendorOrderOpts {
  /** Internal-use copy: adds the "who is this row for" breakdown under each row. */
  internal: boolean;
}

export function printVendorOrder(vo: VendorOrder, opts: PrintVendorOrderOpts): void {
  const w = window.open('', '_blank', 'width=980,height=780');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this page.'); return; }

  const designs = vo.designs ?? [];
  const szSet = new Set<string>();
  designs.forEach(d => {
    Object.keys(d.sizes ?? {}).forEach(s => szSet.add(s));
    (d.varieties ?? []).forEach(v => Object.keys(v.sizes ?? {}).forEach(s => szSet.add(s)));
  });
  const szKeys = sizeOrder([...szSet]);
  const colCount = 1 + szKeys.length + 2; // code + sizes + total + unit

  const rowsHtml = designs.map(d => {
    if (isFlatDesign(d)) {
      const sizes = d.sizes ?? (d.varieties?.[0]?.sizes ?? {});
      const total = szKeys.reduce((a, s) => a + (Number(sizes[s]) || 0), 0);
      const unit = d.unit || d.varieties?.[0]?.unit || 'pcs';
      let row = `<tr style="border-bottom:1px solid #E8E7E0;background:#fff">`
        + `<td style="padding:6px 10px;font-weight:700;color:#3C3489">${esc(d.code || d.name || '—')}</td>`
        + szKeys.map(s => `<td style="padding:6px 8px;text-align:center">${Number(sizes[s]) || 0}</td>`).join('')
        + `<td style="padding:6px 8px;text-align:center;font-weight:700;color:#534AB7">${total}</td>`
        + `<td style="padding:6px 8px;text-align:center;font-size:12px;color:#777">${esc(unit)}</td>`
        + `</tr>`;
      if (opts.internal) row += forRowsHtml(d, szKeys, total, colCount);
      return row;
    }

    const varieties: DesignVariety[] = d.varieties ?? [];
    let row = `<tr style="background:#EEEDFE;border-bottom:1px solid #D0CCF5">`
      + `<td style="padding:6px 10px;font-weight:700;color:#3C3489">${esc(d.code || d.name || '—')}</td>`
      + `<td colspan="${szKeys.length}" style="padding:6px 10px;font-size:12px;color:#6C64CC;font-style:italic">${varieties.length} variet${varieties.length === 1 ? 'y' : 'ies'} below</td>`
      + `<td></td><td></td></tr>`;
    varieties.forEach(v => {
      const total = szKeys.reduce((a, s) => a + (Number(v.sizes?.[s]) || 0), 0);
      row += `<tr style="border-bottom:1px solid #F1EFE8;background:#fff">`
        + `<td style="padding:5px 10px;padding-left:20px;color:#555">└ ${esc(v.name || 'Variety')}</td>`
        + szKeys.map(s => `<td style="padding:5px 8px;text-align:center">${Number(v.sizes?.[s]) || 0}</td>`).join('')
        + `<td style="padding:5px 8px;text-align:center;font-weight:700;color:#534AB7">${total}</td>`
        + `<td style="padding:5px 8px;text-align:center;font-size:12px;color:#777">${esc(v.unit || d.unit || 'pcs')}</td>`
        + `</tr>`;
    });
    return row;
  }).join('');

  const notesLine = vo.notes ? `<div style="font-size:12px;color:#444;margin-bottom:8px"><strong>Notes:</strong> ${esc(vo.notes)}</div>` : '';

  w.document.write(`<!DOCTYPE html><html><head><title>${esc(vo.orderId)} — ${esc(vo.vendor)}</title>
    <style>
      @page{margin:5mm;size:A4 portrait}
      body{font-family:system-ui;padding:4mm 6mm;margin:0;color:#1a1916;font-size:13px;line-height:1.4}
      table{border-collapse:collapse;width:100%}
      @media print{ .print-toolbar{display:none!important} }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #534AB7">
      <h1 style="font-size:18px;color:#3C3489;margin:0;font-weight:700">${esc(vo.orderId)} · <span style="color:#534AB7">${esc(vo.vendor)}</span>${opts.internal ? ' <span style="font-size:12px;font-weight:600;color:#8A5A00;background:#FFF3CD;border-radius:6px;padding:2px 8px">Internal copy</span>' : ''}</h1>
      <div style="text-align:right;font-size:12px"><span style="color:#888">Printed: ${new Date().toLocaleDateString()}</span></div>
    </div>
    <p style="font-size:12px;color:#333;margin-bottom:8px">
      <strong>Order Date:</strong> ${esc(vo.startDate)} &nbsp;·&nbsp;
      <strong>Delivery:</strong> ${esc(vo.deliveryDate || '—')} &nbsp;·&nbsp;
      <strong>Priority:</strong> ${esc(vo.priority)}
    </p>
    ${notesLine}
    <div class="print-toolbar" style="margin-bottom:10px"><button onclick="window.print()" style="padding:7px 14px;background:#534AB7;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨️ Print</button></div>
    <table style="border:1px solid #D0CCF5">
      <thead><tr style="background:#534AB7;color:#fff">
        <th style="padding:7px 10px;text-align:left">Code</th>
        ${szKeys.map(s => `<th style="padding:7px 8px;text-align:center;white-space:nowrap">${esc(s)}</th>`).join('')}
        <th style="padding:7px 8px;text-align:center">Total</th>
        <th style="padding:7px 8px;text-align:center">Unit</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${colCount}" style="padding:14px;text-align:center;color:#999">No designs on this vendor order.</td></tr>`}</tbody>
    </table>
    <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
    </body></html>`);
  w.document.close();
}
