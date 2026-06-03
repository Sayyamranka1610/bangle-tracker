import type { StageTemplate, StageGroup, EmbeddedDesign, DesignStage, Order, DesignVariety } from '../types';

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
