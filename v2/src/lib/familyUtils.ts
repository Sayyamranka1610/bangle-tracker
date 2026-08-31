import type { AppData, Order, EmbeddedDesign, DesignVariety } from '../types';
import { isFlatDesign, hasOnlyDefault } from './coStageUtils';

// ─── Design families ─────────────────────────────────────────────────────────
// A "family" groups design codes that are the same product to a vendor, e.g.
// "12MM Sardar Kada" covers 1203.29, 1203.30, 1203.31…  The owner already
// encodes this by hand in the code prefix (1203.x, 1456.x); this makes it
// explicit so batches can be pooled by family instead of by exact code.
//
// Two sources, in priority order:
//   1. data.designFamilies[CODE]  — what the owner set on the Masters page
//   2. suggestFamily(name)        — automatic guess from the design name
// The owner's choice always wins; the guess is only a starting point.

export const familyKey = (code: string) => (code || '').trim().toUpperCase();

// Size prefix: "12MM SARDAR KADA" -> "12MM"
function sizePrefix(name: string): string {
  const m = (name || '').toUpperCase().match(/(\d+)\s*MM/);
  return m ? `${m[1]}MM` : '';
}

// Product type, first match wins. Deliberately ordered most-specific first so
// "SARDAR KADA" doesn't get swallowed by the generic "KADA" rule.
const TYPE_RULES: [RegExp, string][] = [
  [/SARDAR\s*KADA/,                  'Sardar Kada'],
  [/JAGUAR\s*KADA/,                  'Jaguar Kada'],
  [/BALL\s*KADA/,                    'Ball Kada'],
  [/\bKADA\b/,                       'Kada'],
  [/DOUBLE\s*DECKER|\bD\s*\/\s*D\b/, 'Double Decker'],
  [/EXCLUSIVE\s*PAIR|EXLUSIVE\s*PAIR/, 'Exclusive Pair'],
  [/GOLD\s*MIX/,                     'Gold Mix'],
  [/JOTTA/,                          'Jotta'],
  [/KATAR/,                          'Katar'],
  [/CARTIER/,                        'Cartier'],
  [/CHANNAL/,                        'Channal'],
  [/JALI/,                           'Jali'],
  [/MINDI|MINDA/,                    'Mindi'],
  [/PRINT/,                          'Print'],
  [/LASER/,                          'Laser'],
  [/SQUARE/,                         'Square'],
  [/\bHOLE\b/,                       'Hole'],
  [/\bMATE\b/,                       'Mate'],
  [/LINING/,                         'Lining'],
  [/\bCNC\b/,                        'CNC'],
];

/** Best-guess family from a design name. Colour/finish words are ignored. */
export function suggestFamily(name: string): string {
  const upper = (name || '').toUpperCase();
  const type = TYPE_RULES.find(([re]) => re.test(upper))?.[1] ?? 'Other';
  const mm = sizePrefix(name);
  return mm ? `${mm} ${type}` : type;
}

/** The family for a design, honouring the owner's explicit mapping first. */
export function familyOf(data: AppData, code: string, name: string): string {
  const explicit = data.designFamilies?.[familyKey(code)];
  if (explicit && explicit.trim()) return explicit.trim();
  return suggestFamily(name);
}

/** True when the family shown came from the automatic guess, not the owner. */
export function isGuessedFamily(data: AppData, code: string): boolean {
  const explicit = data.designFamilies?.[familyKey(code)];
  return !(explicit && explicit.trim());
}

// ─── Finish (plating colour) ─────────────────────────────────────────────────
// The design CODE identifies the physical piece; the NAME carries the finish.
// A karigar makes 1203.29 Gold and 1203.29 Rose identically — only plating
// differs. That is why karigar batches pool by code and plating batches pool
// by code + finish.

export function finishOf(name: string): string {
  const u = (name || '').toUpperCase();
  const parts: string[] = [];
  if (/3\s*TONE/.test(u)) parts.push('3 Tone');
  else if (/2\s*TONE/.test(u)) parts.push('2 Tone');
  if (/\bROSE\b/.test(u) || /\bR\s*:/.test(u) || /\bR\s+/.test(u)) parts.push('Rose');
  if ((/\bG\s*:/.test(u) || /\bG\s+/.test(u) || /\bGOLD\b/.test(u)) && !/GOLD\s*MIX/.test(u)) parts.push('Gold');
  if (/SILVER/.test(u)) parts.push('Silver');
  return parts.join(' ') || '—';
}

// ─── Catalogue of every design row across all orders ─────────────────────────

export interface CatalogRow {
  orderDbId: string;
  orderLabel: string;
  client: string;
  designId: string;
  varietyId: string | null;
  isFlat: boolean;
  code: string;
  name: string;
  varName: string | null;
  family: string;
  finish: string;
  sizes: Record<string, number>;
  qty: number;
  images: { data: string; name?: string }[];
  unit: string;
  /** Unit as actually entered on the row, with NO 'pcs' fallback — used to
   *  detect "unit missing" for order-value math (rate is per-unit, so a
   *  defaulted unit would silently produce a wrong total). `unit` above keeps
   *  its existing defaulted behavior for Dashboard/Pooling display. */
  rawUnit: string;
  rate?: number;
  note?: string;
}

const sumSizes = (s?: Record<string, number>) =>
  Object.values(s ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);

/** Flattens every design/variety row of one order into catalogue rows. */
export function catalogRowsOfOrder(data: AppData, order: Order): CatalogRow[] {
  const out: CatalogRow[] = [];
  (order.designs ?? []).forEach((d: EmbeddedDesign) => {
    const base = {
      orderDbId: order.id,
      orderLabel: order.orderId,
      client: order.client,
      designId: d.id,
      code: d.code || '',
      name: d.name || '',
      family: familyOf(data, d.code || '', d.name || ''),
      finish: finishOf(d.name || ''),
      unit: d.unit || 'pcs',
    };
    if (isFlatDesign(order, d)) {
      const sizes = hasOnlyDefault(d) ? (d.varieties?.[0]?.sizes ?? {}) : (d.sizes ?? {});
      out.push({
        ...base, varietyId: null, isFlat: true, varName: null,
        sizes: { ...sizes }, qty: sumSizes(sizes),
        images: d.images ?? [], note: d.note,
        rawUnit: d.unit || '',
        rate: (d.rate != null && Number(d.rate) > 0) ? Number(d.rate) : undefined,
      });
    } else {
      (d.varieties ?? []).forEach((v: DesignVariety, vi) => {
        out.push({
          ...base, varietyId: v.id, isFlat: false,
          varName: v.name || `Variety ${vi + 1}`,
          sizes: { ...(v.sizes ?? {}) }, qty: sumSizes(v.sizes),
          images: v.images?.length ? v.images : (d.images ?? []),
          unit: v.unit || base.unit,
          note: v.note,
          rawUnit: v.unit || d.unit || '',
          rate: (v.rate != null && Number(v.rate) > 0) ? Number(v.rate)
              : (d.rate != null && Number(d.rate) > 0) ? Number(d.rate) : undefined,
        });
      });
    }
  });
  return out;
}

export function catalogRows(data: AppData, opts?: { includeArchived?: boolean }): CatalogRow[] {
  return (data.orders ?? [])
    .filter(o => opts?.includeArchived ? true : !o.archived)
    .flatMap(o => catalogRowsOfOrder(data, o));
}

// ─── Family summary (for the Masters → Families tab) ─────────────────────────

export interface FamilyCodeRow {
  code: string;
  names: string[];
  finishes: string[];
  family: string;
  guessed: boolean;
  rows: number;
  qty: number;
  clients: string[];
}

export function familyCodeRows(data: AppData): FamilyCodeRow[] {
  const by = new Map<string, {
    code: string; names: Set<string>; finishes: Set<string>;
    rows: number; qty: number; clients: Set<string>;
  }>();

  catalogRows(data, { includeArchived: true }).forEach(r => {
    const key = familyKey(r.code) || '(no code)';
    if (!by.has(key)) {
      by.set(key, { code: r.code || '(no code)', names: new Set(), finishes: new Set(), rows: 0, qty: 0, clients: new Set() });
    }
    const e = by.get(key)!;
    if (r.name) e.names.add(r.name);
    if (r.finish && r.finish !== '—') e.finishes.add(r.finish);
    e.rows++; e.qty += r.qty; e.clients.add(r.client);
  });

  return [...by.entries()].map(([key, e]) => ({
    code: e.code,
    names: [...e.names],
    finishes: [...e.finishes],
    family: familyOf(data, key, [...e.names][0] ?? ''),
    guessed: isGuessedFamily(data, key),
    rows: e.rows,
    qty: e.qty,
    clients: [...e.clients],
  })).sort((a, b) => a.family.localeCompare(b.family) || b.qty - a.qty);
}

/** Every family name currently in use, plus any the owner named explicitly. */
export function allFamilies(data: AppData): string[] {
  const s = new Set<string>();
  familyCodeRows(data).forEach(r => s.add(r.family));
  Object.values(data.designFamilies ?? {}).forEach(f => { if (f?.trim()) s.add(f.trim()); });
  Object.keys(data.familyNotes ?? {}).forEach(f => { if (f?.trim()) s.add(f.trim()); });
  return [...s].sort();
}

// ─── Mutations (return patches — never mutate state directly) ────────────────

export function setDesignFamily(data: AppData, code: string, family: string): Partial<AppData> {
  const next = { ...(data.designFamilies ?? {}) };
  const key = familyKey(code);
  if (!key) return {};
  if (family.trim()) next[key] = family.trim();
  else delete next[key];
  return { designFamilies: next };
}

/** Reassigns several codes at once — used by "merge this family into that one". */
export function setDesignFamilyMany(data: AppData, codes: string[], family: string): Partial<AppData> {
  const next = { ...(data.designFamilies ?? {}) };
  codes.forEach(c => {
    const key = familyKey(c);
    if (!key) return;
    if (family.trim()) next[key] = family.trim();
    else delete next[key];
  });
  return { designFamilies: next };
}

export function setFamilyNote(data: AppData, family: string, note: string): Partial<AppData> {
  const next = { ...(data.familyNotes ?? {}) };
  if (note.trim()) next[family] = note;
  else delete next[family];
  return { familyNotes: next };
}

/**
 * Renames a family everywhere: the code→family map AND the notes attached to
 * it. Codes still on the automatic guess are pinned explicitly first, so a
 * rename can't silently drop them back to the guessed name.
 */
export function renameFamily(data: AppData, oldName: string, newName: string): Partial<AppData> {
  const target = newName.trim();
  if (!target || target === oldName) return {};

  const nextFamilies = { ...(data.designFamilies ?? {}) };
  familyCodeRows(data).forEach(r => {
    if (r.family === oldName) nextFamilies[familyKey(r.code)] = target;
  });

  const nextNotes = { ...(data.familyNotes ?? {}) };
  if (nextNotes[oldName] !== undefined) {
    const merged = nextNotes[target]
      ? `${nextNotes[target]}\n${nextNotes[oldName]}`
      : nextNotes[oldName];
    nextNotes[target] = merged;
    delete nextNotes[oldName];
  }

  return { designFamilies: nextFamilies, familyNotes: nextNotes };
}

// ─── Order value from rates (retail addition, Aug 2026) ──────────────────────
// Ports Phase 1's btOrderValue()/btMoney() exactly. Rate is per the row's own
// unit, so a unit is required before anything can be totalled — "Option B",
// the rule Phase 1 settled on: a wrong order value (from a mismatched/assumed
// unit) is worse than a missing one, so this refuses to guess.

export type OrderValueState =
  | { state: 'empty' }
  | { state: 'nounit'; noUnit: number; rows: number }
  | { state: 'pending'; priced: number; rows: number }
  | { state: 'ok'; total: number; rows: number };

export function computeOrderValue(data: AppData, order: Order): OrderValueState {
  const rows = catalogRowsOfOrder(data, order).filter(r => r.qty > 0);
  if (!rows.length) return { state: 'empty' };
  const noUnit = rows.filter(r => !String(r.rawUnit || '').trim()).length;
  if (noUnit) return { state: 'nounit', noUnit, rows: rows.length };
  const priced = rows.filter(r => r.rate != null && r.rate > 0).length;
  if (priced < rows.length) return { state: 'pending', priced, rows: rows.length };
  return { state: 'ok', total: rows.reduce((a, r) => a + (r.rate ?? 0) * r.qty, 0), rows: rows.length };
}

export function formatMoney(n: number): string {
  return '₹ ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
