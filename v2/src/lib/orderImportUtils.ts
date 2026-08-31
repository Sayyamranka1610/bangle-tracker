import * as XLSX from 'xlsx';
import type { BangleType } from '../types';

// ─── Bulk order import — CSV + Excel (mirrors Phase 1's processOrderFile) ────
// Photo-of-order-sheet import was never actually implemented in Phase 1 either
// (the drop zone accepts images, but processOrderFile only ever branches on
// .csv/.xlsx/.xls — no OCR/vision parsing exists) — so that's not a gap here,
// it's parity with what Phase 1 actually does.

export interface ParsedVariety {
  name: string;
  sizes: Record<string, number>;
  unit?: string;
  rate?: number;
  note?: string;
}

export interface ParsedDesign {
  name: string;
  code: string;
  bangleType?: 'cnc';
  varieties: ParsedVariety[];
}

export interface ParsedOrder {
  orderId?: string;
  client: string;
  startDate: string;
  notes?: string;
  bangleType?: BangleType;
  designs: ParsedDesign[];
  // Rows with quantity but no Unit — ports Phase 1's "Unit is now required on
  // import" rule (rate is per-unit, so a blank unit would produce a
  // meaningless order value). Non-empty means the import should be refused
  // and these named to the user rather than silently loaded.
  unitIssues: string[];
}

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

function parseDateCell(raw: unknown): string {
  if (!raw) return '';
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!isNaN(num) && num > 10000) {
    return new Date(Math.round((num - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// Groups rows into designs by (name+code) — mirrors groupIntoDesigns() exactly.
// vIdx=-1 (CNC sections): every qty-bearing row becomes its own 'Default' variety.
// vIdx>=0 (Dye Gold sections): rows sharing name+code become multiple varieties.
// rIdx/nIdx (both optional, -1 if the sheet has no such column): Rate and Note
// are read when present, blank is ignored. Unit is NOT defaulted to 'pcs'
// here — a blank unit is collected into unitIssues instead, so the caller can
// refuse the import (rate is per-unit, so a guessed unit would silently
// produce a wrong order value — Phase 1's "Option B" rule).
function groupIntoDesigns(
  dataRows: unknown[][],
  dnIdx: number, dcIdx: number, vIdx: number,
  szIdxMap: Record<string, number>, allSizes: string[], uIdx: number,
  rIdx = -1, nIdx = -1,
): { designs: ParsedDesign[]; unitIssues: string[] } {
  const designMap: ParsedDesign[] = [];
  const byKey = new Map<string, ParsedDesign>();
  const unitIssues: string[] = [];
  let lastDN = '', lastDC = '';

  dataRows.forEach(row => {
    const dn = String(row[dnIdx] ?? '').trim();
    const dc = String(row[dcIdx] ?? '').trim();
    if (dn) lastDN = dn;
    if (dc) lastDC = dc;
    if (!lastDN) return; // no design context yet

    const rawVName = vIdx >= 0 ? String(row[vIdx] ?? '').trim() : '';
    const hasQty = allSizes.some(sz => (parseInt(String(row[szIdxMap[sz]])) || 0) > 0);
    if (!rawVName && !hasQty) return;
    const vName = rawVName || (hasQty ? 'Default' : '');
    if (!vName) return;

    const key = `${lastDN} ${lastDC}`;
    let design = byKey.get(key);
    if (!design) {
      design = { name: lastDN, code: lastDC, varieties: [] };
      byKey.set(key, design);
      designMap.push(design);
    }

    const existingNames = design.varieties.map(v => v.name);
    let finalVName = vName;
    if (existingNames.includes(finalVName)) {
      let n = 2;
      while (existingNames.includes(`${finalVName} ${n}`)) n++;
      finalVName = `${finalVName} ${n}`;
    }
    const sizes: Record<string, number> = {};
    allSizes.forEach(sz => { sizes[sz] = parseInt(String(row[szIdxMap[sz]])) || 0; });

    const unit = uIdx >= 0 ? String(row[uIdx] ?? '').trim() : '';
    if (!unit) unitIssues.push(`${lastDN || '?'}${lastDC ? ` (${lastDC})` : ''} — ${finalVName}`);

    const variety: ParsedVariety = { name: finalVName, sizes, unit: unit || 'pcs' };
    const rawRate = rIdx >= 0 ? parseFloat(String(row[rIdx])) : NaN;
    if (isFinite(rawRate) && rawRate > 0) variety.rate = rawRate;
    const rawNote = nIdx >= 0 ? String(row[nIdx] ?? '').trim() : '';
    if (rawNote) variety.note = rawNote;

    design.varieties.push(variety);
  });

  return { designs: designMap.filter(d => d.name && d.varieties.length > 0), unitIssues };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseCSV(text: string): ParsedOrder | null {
  const rawRows = text.split('\n').map(parseCSVRow).filter(r => r.some(c => c));
  if (rawRows.length < 2) return null;

  const headers = rawRows[0].map(h => h.toLowerCase().trim());
  const dataRows = rawRows.slice(1);
  const getFromRow = (row: string[], ...keys: string[]) => {
    for (const k of keys) {
      const i = headers.findIndex(h => h.includes(k));
      if (i >= 0 && row[i]) return String(row[i]).trim();
    }
    return '';
  };

  const designNameIdx = headers.findIndex(h => h === 'design name' || h === 'design');
  const designCodeIdx = headers.findIndex(h => h === 'design code' || h === 'code');
  const varietyIdx = headers.findIndex(h => h === 'variety name' || h === 'variety');
  const szIdxMap: Record<string, number> = {};
  headers.forEach((h, i) => { if (/^\d+\/\d+$/.test(h)) szIdxMap[h] = i; });
  const allSizes = Object.keys(szIdxMap);
  const uIdx = headers.findIndex(h => h === 'unit');
  const rIdx = headers.findIndex(h => /^rate/.test(h));
  const nIdx = headers.findIndex(h => h === 'note');

  const orderRow = dataRows[0];
  const client = getFromRow(orderRow, 'client', 'customer', 'party', 'buyer');
  const startDate = parseDateCell(getFromRow(orderRow, 'start date', 'date', 'start')) || todayStr();
  const notes = getFromRow(orderRow, 'notes', 'remarks', 'comment');
  const orderId = getFromRow(orderRow, 'order id', 'orderid', 'order no', 'order number');

  const { designs, unitIssues } = groupIntoDesigns(dataRows as unknown[][], designNameIdx, designCodeIdx, varietyIdx, szIdxMap, allSizes, uIdx, rIdx, nIdx);
  return { orderId: orderId || undefined, client, startDate, notes: notes || undefined, designs, unitIssues };
}

// ─── Excel (.xlsx / .xls) ──────────────────────────────────────────────────────

export function parseWorkbook(workbook: XLSX.WorkBook): ParsedOrder | null {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (!rows || rows.length < 1) return null;

  const colA = rows.map(r => String(r[0] ?? '').toLowerCase().trim());
  const isLabelFormat = colA.some(l => l.includes('order id') || l.includes('client name'));

  let orderId = '', client = '', startDate = '', notes = '';

  if (isLabelFormat) {
    const labelVal = (label: string) => {
      const idx = rows.findIndex(r => String(r[0] ?? '').toLowerCase().includes(label));
      return idx >= 0 ? String(rows[idx][1] ?? '').trim() : '';
    };
    orderId = labelVal('order id');
    client = labelVal('client');
    startDate = parseDateCell(labelVal('start date') || labelVal('date'));
    notes = labelVal('notes');

    const parseSection = (startRowIdx: number, endRowIdx: number, forceNoVariety: boolean): { designs: ParsedDesign[]; unitIssues: string[] } => {
      const hdrIdx = rows.findIndex((r, i) => i > startRowIdx && i < endRowIdx && String(r[0] ?? '').toLowerCase().trim() === 'design name');
      if (hdrIdx < 0) return { designs: [], unitIssues: [] };
      const hdr = rows[hdrIdx].map(h => String(h).trim());
      const szIdxMap: Record<string, number> = {};
      const allSizes: string[] = [];
      hdr.forEach((h, i) => { if (/^\d+\/\d+$/.test(h)) { szIdxMap[h] = i; allSizes.push(h); } });
      const szColSet = new Set(Object.values(szIdxMap));
      const vIdx = forceNoVariety ? -1 : hdr.findIndex((h, i) => i > 1 && !szColSet.has(i) && /variety/i.test(h));
      const uIdx = hdr.findIndex((h, i) => !szColSet.has(i) && /^unit$/i.test(h));
      const rIdx = hdr.findIndex((h, i) => !szColSet.has(i) && /^rate/i.test(h));
      const nIdx = hdr.findIndex((h, i) => !szColSet.has(i) && /^note$/i.test(h));
      return groupIntoDesigns(rows.slice(hdrIdx + 1, endRowIdx), 0, 1, vIdx, szIdxMap, allSizes, uIdx, rIdx, nIdx);
    };

    const cncSecIdx = colA.findIndex(l => l.includes('cnc design'));
    const dyeSecIdx = colA.findIndex(l => l.includes('dye gold design') || l.includes('dye_gold design'));

    if (cncSecIdx >= 0 || dyeSecIdx >= 0) {
      const allDesigns: ParsedDesign[] = [];
      const allUnitIssues: string[] = [];
      let detectedBT: '' | 'cnc' | 'dye_gold' | 'both' = '';
      if (cncSecIdx >= 0) {
        const cncEnd = dyeSecIdx > cncSecIdx ? dyeSecIdx : rows.length;
        const cncResult = parseSection(cncSecIdx, cncEnd, true);
        const cncDesigns = cncResult.designs.map(d => ({ ...d, bangleType: 'cnc' as const }));
        if (cncDesigns.length) { allDesigns.push(...cncDesigns); detectedBT = 'cnc'; }
        allUnitIssues.push(...cncResult.unitIssues);
      }
      if (dyeSecIdx >= 0) {
        const dyeResult = parseSection(dyeSecIdx, rows.length, false);
        if (dyeResult.designs.length) { allDesigns.push(...dyeResult.designs); detectedBT = detectedBT === 'cnc' ? 'both' : 'dye_gold'; }
        allUnitIssues.push(...dyeResult.unitIssues);
      }
      return {
        orderId: orderId || undefined, client, startDate: startDate || todayStr(), notes: notes || undefined,
        bangleType: (detectedBT || 'dye_gold') as BangleType, designs: allDesigns, unitIssues: allUnitIssues,
      };
    }

    // Single-section format
    const tblHdrIdx = rows.findIndex(r => String(r[0] ?? '').toLowerCase().trim() === 'design name');
    if (tblHdrIdx >= 0) {
      const hdr = rows[tblHdrIdx].map(h => String(h).trim());
      const szIdxMap: Record<string, number> = {};
      const allSizes: string[] = [];
      hdr.forEach((h, i) => { if (/^\d+\/\d+$/.test(h)) { szIdxMap[h] = i; allSizes.push(h); } });
      const szColSet = new Set(Object.values(szIdxMap));
      const vIdx = hdr.findIndex((h, i) => i > 1 && !szColSet.has(i) && /variety/i.test(h));
      const uIdx = hdr.findIndex((h, i) => !szColSet.has(i) && /^unit$/i.test(h));
      const rIdx = hdr.findIndex((h, i) => !szColSet.has(i) && /^rate/i.test(h));
      const nIdx = hdr.findIndex((h, i) => !szColSet.has(i) && /^note$/i.test(h));
      const { designs, unitIssues } = groupIntoDesigns(rows.slice(tblHdrIdx + 1), 0, 1, vIdx, szIdxMap, allSizes, uIdx, rIdx, nIdx);
      return { orderId: orderId || undefined, client, startDate: startDate || todayStr(), notes: notes || undefined, designs, unitIssues };
    }
    return null;
  }

  // Generic header-row fallback
  const headers = rows[0].map(h => String(h).toLowerCase().trim());
  const dataRow = rows[1] ?? [];
  const getH = (...keys: string[]) => {
    for (const k of keys) {
      const i = headers.findIndex(h => h.includes(k));
      if (i >= 0 && dataRow[i] !== undefined && dataRow[i] !== '') return String(dataRow[i]).trim();
    }
    return '';
  };
  orderId = getH('order id', 'orderid', 'order no', 'order number');
  client = getH('client', 'customer', 'party', 'buyer');
  startDate = parseDateCell(getH('start date', 'date', 'start'));
  notes = getH('notes', 'remarks', 'comment');

  const dnIdx = headers.findIndex(h => h === 'design name' || h === 'design');
  const dcIdx = headers.findIndex(h => h === 'design code' || h === 'code');
  const vIdx = headers.findIndex(h => h === 'variety name' || h === 'variety');
  const szIdxMap: Record<string, number> = {};
  headers.forEach((h, i) => { if (/^\d+\/\d+$/.test(h)) szIdxMap[h] = i; });
  const allSizes = Object.keys(szIdxMap);
  const uIdx = headers.findIndex(h => h === 'unit');
  const rIdx = headers.findIndex(h => /^rate/.test(h));
  const nIdx = headers.findIndex(h => h === 'note');
  const { designs, unitIssues } = dnIdx >= 0 && dcIdx >= 0
    ? groupIntoDesigns(rows.slice(1), dnIdx, dcIdx, vIdx, szIdxMap, allSizes, uIdx, rIdx, nIdx)
    : { designs: [] as ParsedDesign[], unitIssues: [] as string[] };

  return { orderId: orderId || undefined, client, startDate: startDate || todayStr(), notes: notes || undefined, designs, unitIssues };
}

// Reads a File (csv/xlsx/xls) and returns the parsed order, or null if the
// format wasn't recognized / file was empty.
export async function parseOrderFile(file: File): Promise<ParsedOrder | null> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    return parseCSV(text);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    return parseWorkbook(wb);
  }
  return null;
}

// Reads a file as a base64 data URL — for storing as Order.attachedFile.
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Downloadable template (plain — Phase 1's dropdown-XLSX builder is a
// large custom binary-XML feature, deliberately not ported; this generates
// the same column/label structure without in-cell dropdown validation) ──────

export function buildOrderTemplateWorkbook(): XLSX.WorkBook {
  const sizeCols = ['2/2', '2/4', '2/6', '2/8', '2/10'];
  // Unit is required (rate is per-unit — a blank unit refuses the whole
  // import, see groupIntoDesigns above); Rate and Note stay optional.
  const aoa: (string | number)[][] = [
    ['Order ID', ''],
    ['Client Name', ''],
    ['Start Date', ''],
    ['Bangle Type (cnc / dye_gold / both)', ''],
    ['Notes (Optional)', ''],
    [],
    ['CNC DESIGNS & QUANTITIES'],
    ['Design Name', 'Design Code', ...sizeCols, 'Unit', 'Rate (₹)', 'Note'],
    ...Array.from({ length: 10 }, () => ['', '', ...sizeCols.map(() => ''), 'pcs', '', '']),
    [],
    ['DYE GOLD DESIGNS & VARIETIES'],
    ['Design Name', 'Design Code', 'Variety', ...sizeCols, '2/12', 'Unit', 'Rate (₹)', 'Note'],
    ...Array.from({ length: 20 }, () => ['', '', '', ...sizeCols.map(() => ''), '', 'pcs', '', '']),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Order');
  return wb;
}

export function downloadOrderTemplate(): void {
  const wb = buildOrderTemplateWorkbook();
  XLSX.writeFile(wb, 'Customer_Order_Template.xlsx');
}
