import type { AppData, Order, VendorOrder } from '../types';
import { hasOnlyDefault } from './coStageUtils';
import { familyOf } from './familyUtils';

// ─── Karigar History engine ────────────────────────────────────────────────
// "Which design has been given to which karigar before?" — built entirely
// from records the app already has, not a separate thing to maintain. Ports
// Phase 1's _khBuildEvents()/_khHistory()/_khSuggestionFor()/_khRows()
// exactly (bangle_v19.html ~L18030).
//
// Two sources, deduped so a customer-order assignment and its later vendor
// order (usually the same real shipment) aren't double-counted:
//   1. Every karigar-type vendor order that contains the code — the real
//      "this was actually sent out" record (vo.vendor, vo.startDate).
//   2. Every customer order row that ever had a Karigar picked for the code
//      — a fallback for codes assigned by hand but never sent via a formal
//      vendor order.
//
// A design code alone is NOT a unique identity — a Dye Gold code like "12MM"
// can have several real varieties that are genuinely different physical
// designs, not size labels. Keying history by code alone would credit one
// variety's karigar to every other variety sharing that code — a real bug
// Phase 1 shipped and then fixed in production (owner caught a wrong
// suggestion). So every event carries both code AND varietyName ('' for a
// flat/CNC row), and the two together are the real key.

export interface KarigarEvent {
  code: string;
  varietyName: string; // '' for a flat/CNC row
  vendor: string;
  at: number; // ms epoch, 0 = unknown
  coLabel: string;
}

export function khKey(code: string, varietyName: string): string {
  return `${(code || '').trim()}|${(varietyName || '').trim()}`;
}

export function buildKarigarEvents(data: AppData): KarigarEvent[] {
  const events: KarigarEvent[] = [];
  const seen = new Set<string>();

  function push(code: string | undefined, varietyName: string, vendor: string | undefined, at: number, coLabel: string) {
    const c = (code || '').trim();
    const v = (vendor || '').trim();
    if (!c || !v || v === '__own__') return;
    const vName = (varietyName || '').trim();
    const day = at ? new Date(at).toISOString().slice(0, 10) : 'unknown';
    const dedupeKey = `${c}|${vName}|${v}|${day}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    events.push({ code: c, varietyName: vName, vendor: v, at: at || 0, coLabel: coLabel || '' });
  }

  (data.vendorOrders ?? []).forEach((vo: VendorOrder) => {
    if ((vo.type ?? 'karigar') !== 'karigar' || !vo.vendor) return;
    const at = vo.startDate ? (Date.parse(vo.startDate) || 0) : 0;
    (vo.designs ?? []).forEach(d => {
      const varieties = d.varieties ?? [];
      // Same "lone Default variety counts as flat" rule as the customer-order
      // side below — a pooled vendor-order design (Pooling always creates a
      // single "Default"-ish flat row) must match up with how a flat
      // customer-order row is keyed (varietyName ''), or the two would be
      // treated as two different designs and double up in the history.
      const isFlat = varieties.length === 0 || (varieties.length === 1 && (varieties[0].name || '').trim().toLowerCase() === 'default');
      if (isFlat) push(d.code, '', vo.vendor, at, vo.orderId);
      else varieties.forEach(v => push(d.code, v.name, vo.vendor, at, vo.orderId));
    });
  });

  (data.orders ?? []).forEach((o: Order) => {
    (o.designs ?? []).forEach(d => {
      const varieties = d.varieties ?? [];
      const isFlat = varieties.length === 0 || hasOnlyDefault(d);
      // Karigar always lives on d.assignedVendor for a flat row — including
      // the hasOnlyDefault case — matching Phase 1's rule that the UI never
      // writes a flat row's karigar onto its lone "Default" variety.
      if (isFlat) {
        if (d.assignedVendor) push(d.code, '', d.assignedVendor, d.assignedVendorAt ?? 0, o.orderId);
      } else {
        varieties.forEach(v => {
          if (v.assignedVendor) push(d.code, v.name, v.assignedVendor, v.assignedVendorAt ?? 0, o.orderId);
        });
      }
    });
  });

  return events;
}

export function karigarHistory(data: AppData): Record<string, KarigarEvent[]> {
  const byKey: Record<string, KarigarEvent[]> = {};
  buildKarigarEvents(data).forEach(e => {
    const k = khKey(e.code, e.varietyName);
    (byKey[k] ??= []).push(e);
  });
  Object.values(byKey).forEach(list => list.sort((a, b) => b.at - a.at));
  return byKey;
}

export interface KarigarSuggestion {
  vendor: string;
  at: number;
  count: number;
}

// Top pick for one (code, variety) — most RECENT vendor wins (not most
// frequent), since who currently makes a design can change over time.
export function suggestionFor(history: Record<string, KarigarEvent[]>, code: string, varietyName: string): KarigarSuggestion | null {
  const list = history[khKey(code, varietyName)];
  if (!list?.length) return null;
  const top = list[0];
  return { vendor: top.vendor, at: top.at, count: list.filter(e => e.vendor === top.vendor).length };
}

// First available photo for a (code, variety) — checks that exact variety's
// own photos first, then the design-level/flat photo, then vendor orders.
export function imageForCode(data: AppData, code: string, varietyName: string): string {
  const c = (code || '').trim();
  if (!c) return '';
  const vName = (varietyName || '').trim();

  for (const o of data.orders ?? []) {
    for (const d of o.designs ?? []) {
      if ((d.code || '').trim() !== c) continue;
      if (vName) {
        const v = (d.varieties ?? []).find(vv => (vv.name || '').trim() === vName);
        if (v?.images?.length) return v.images[0].data;
      }
      const imgs = d.images?.length ? d.images : (d.varieties?.[0]?.images ?? []);
      if (imgs.length) return imgs[0].data;
    }
  }
  for (const vo of data.vendorOrders ?? []) {
    for (const d of vo.designs ?? []) {
      if ((d.code || '').trim() !== c) continue;
      if (vName) {
        const v = (d.varieties ?? []).find(vv => (vv.name || '').trim() === vName);
        if (v?.images?.length) return v.images[0].data;
      }
      if (d.images?.length) return d.images[0].data;
    }
  }
  return '';
}

export interface KarigarHistoryRow {
  key: string;
  code: string;
  varietyName: string;
  vendor: string;
  at: number;
  count: number;
  totalEvents: number;
  events: KarigarEvent[];
}

export function karigarHistoryRows(data: AppData): KarigarHistoryRow[] {
  const hist = karigarHistory(data);
  return Object.keys(hist).map(key => {
    const list = hist[key], top = list[0];
    return {
      key, code: top.code, varietyName: top.varietyName, vendor: top.vendor, at: top.at,
      count: list.filter(e => e.vendor === top.vendor).length, totalEvents: list.length, events: list,
    };
  }).sort((a, b) => b.at - a.at);
}

// ─── Excel export (mirrors Phase 1's _khExportExcel()) ────────────────────

export interface KarigarHistoryExportRows {
  current: Record<string, string | number>[];
  fullHistory: Record<string, string | number>[];
}

export function buildKarigarHistoryExport(data: AppData): KarigarHistoryExportRows {
  const rows = karigarHistoryRows(data);
  const current = rows.map(r => ({
    'Design Code': r.code,
    'Variety': r.varietyName || '',
    'Family': familyOf(data, r.code, ''),
    'Karigar (most recent)': r.vendor,
    'Last Sent': r.at ? new Date(r.at).toISOString().slice(0, 10) : '',
    'Times Made': r.count,
  }));
  const fullHistory = buildKarigarEvents(data).slice().sort((a, b) => a.at - b.at).map(e => ({
    'Date': e.at ? new Date(e.at).toISOString().slice(0, 10) : '',
    'Design Code': e.code,
    'Variety': e.varietyName || '',
    'Karigar': e.vendor,
    'Order': e.coLabel,
  }));
  return { current, fullHistory };
}
