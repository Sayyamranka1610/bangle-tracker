import type { LedgerEntry } from '../types';

// ─── Movement types (mirrors Phase 1 INV_TYPE_META) ──────────────────────────

export type InvType =
  | 'raw_in' | 'raw_out' | 'raw_rejection'
  | 'semi_in' | 'semi_out' | 'semi_rejection'
  | 'fin_in' | 'fin_out' | 'fin_rejection';

export type InvCol = 'raw' | 'semi' | 'fin';

export interface InvTypeMeta {
  label: string;
  col: InvCol;
  sign: 1 | -1;
  icon: string;
  isRejection?: boolean;
}

export const INV_TYPE_META: Record<InvType, InvTypeMeta> = {
  raw_in:         { label: 'Raw In',        col: 'raw',  sign: +1, icon: '⬇️' },
  raw_out:        { label: 'Raw Out',       col: 'raw',  sign: -1, icon: '⬆️' },
  raw_rejection:  { label: 'Raw Rejected',  col: 'raw',  sign: -1, icon: '🚫', isRejection: true },
  semi_in:        { label: 'Semi In',       col: 'semi', sign: +1, icon: '⬇️' },
  semi_out:       { label: 'Semi Out',      col: 'semi', sign: -1, icon: '⬆️' },
  semi_rejection: { label: 'Semi Rejected', col: 'semi', sign: -1, icon: '🚫', isRejection: true },
  fin_in:         { label: 'Finished In',   col: 'fin',  sign: +1, icon: '⬇️' },
  fin_out:        { label: 'Finished Out',  col: 'fin',  sign: -1, icon: '⬆️' },
  fin_rejection:  { label: 'Fin. Rejected', col: 'fin',  sign: -1, icon: '🚫', isRejection: true },
};

export const ALL_INV_TYPES = Object.keys(INV_TYPE_META) as InvType[];

export const COL_META: Record<InvCol, { label: string; sublabel: string; color: string; bg: string; border: string }> = {
  raw:  { label: 'Raw',            sublabel: 'Pipes / Metal',    color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  semi: { label: 'Semi-Finished',  sublabel: 'Designed pieces',  color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
  fin:  { label: 'Finished Goods', sublabel: 'Plated & packed',  color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
};

// ─── Balance computation ──────────────────────────────────────────────────────

export interface Balance { raw: number; semi: number; fin: number; }

export function computeBalance(entries: LedgerEntry[], designKey: string, field: 'designName' | 'designCode', upToDate: string): Balance {
  let raw = 0, semi = 0, fin = 0;
  entries
    .filter(e => e[field] === designKey && e.date <= upToDate)
    .forEach(e => {
      const meta = INV_TYPE_META[e.type as InvType];
      if (!meta) return;
      const qty = Number(e.qty) || 0;
      if (meta.col === 'raw')  raw  += meta.sign * qty;
      if (meta.col === 'semi') semi += meta.sign * qty;
      if (meta.col === 'fin')  fin  += meta.sign * qty;
    });
  return { raw: Math.max(0, raw), semi: Math.max(0, semi), fin: Math.max(0, fin) };
}

// ─── Summary totals ───────────────────────────────────────────────────────────

export interface InvTotals { totalRaw: number; totalSemi: number; totalFin: number; totalMoves: number; }

export function computeTotals(ledger: LedgerEntry[]): InvTotals {
  const today = new Date().toISOString().slice(0, 10);
  const keys = [...new Set(ledger.map(e => e.designName).filter(Boolean))] as string[];
  let totalRaw = 0, totalSemi = 0, totalFin = 0;
  keys.forEach(k => {
    const b = computeBalance(ledger, k, 'designName', today);
    totalRaw  += b.raw;
    totalSemi += b.semi;
    totalFin  += b.fin;
  });
  return { totalRaw, totalSemi, totalFin, totalMoves: ledger.length };
}

// ─── Per-design balance rows ──────────────────────────────────────────────────

export interface DesignBalanceRow {
  key: string;
  label: string;
  sublabel: string;
  raw: number;
  semi: number;
  fin: number;
  moves: number;
}

export function computeDesignRows(ledger: LedgerEntry[], groupBy: 'designName' | 'designCode'): DesignBalanceRow[] {
  const today = new Date().toISOString().slice(0, 10);
  const keys = [...new Set(ledger.map(e => e[groupBy]).filter(Boolean))] as string[];
  return keys.map(k => {
    const b = computeBalance(ledger, k, groupBy, today);
    const sample = ledger.find(e => e[groupBy] === k);
    const label = k;
    const sublabel = groupBy === 'designName'
      ? (sample?.designCode ?? '')
      : (sample?.designName ?? '');
    const moves = ledger.filter(e => e[groupBy] === k).length;
    return { key: k, label, sublabel, ...b, moves };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Type color for badge ─────────────────────────────────────────────────────

export function typeColor(type: string): { text: string; bg: string } {
  if (type.endsWith('_in'))        return { text: 'text-green-400',  bg: 'bg-green-500/15' };
  if (type.endsWith('_rejection')) return { text: 'text-red-400',    bg: 'bg-red-500/15' };
  return                                  { text: 'text-orange-400', bg: 'bg-orange-500/15' };
}

// ─── New entry ID ─────────────────────────────────────────────────────────────
export function newEntryId() { return 'inv_' + Date.now(); }
