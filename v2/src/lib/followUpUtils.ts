import type { AppData, Order, VendorOrder, VendorPipelineFields, FollowUpEntry, FollowUpLogEntry } from '../types';
import { coStage, isFlatDesign, orderStatus } from './coStageUtils';
import { vendorAlert } from './vendorUtils';

// ─── Follow-up ledger — "Kya Bola?" ───────────────────────────────────────────
// Ports Phase 1's FOLLOWUP_RULES/computeFollowUps()/_submitFollowUpResponse()
// exactly (bangle_v19.html ~L17202). A rules engine that watches every order
// and vendor order for specific stuck conditions, surfaces them as a daily
// checklist, and forces a real answer — never a blank "done" click — before
// one drops off. Entirely separate from Order/VendorOrder: reads them,
// writes nowhere on them. Lives at AppData.followUps (per-entity scheduling
// state) and AppData.followUpLog (an append-only, 90-day-bounded record of
// every response ever submitted).

export type FollowUpScope = 'vo' | 'co_row' | 'co';

export interface FollowUpRule {
  ruleKey: string;
  scope: FollowUpScope;
  icon: string;
  label: string;
  /** Days after first becoming due before it's first flagged. */
  days: number;
  /** Days between repeats after the first response. */
  recurDays: number;
  /** The question shown in the "Kya Bola?" modal. */
  ask: string;
}

export const FOLLOWUP_RULES: Record<string, FollowUpRule> = {
  vo_pipe:              { ruleKey: 'vo_pipe',              scope: 'vo',     icon: '🔩', label: 'Pipe — follow up',             days: 5,  recurDays: 5, ask: 'Pipe material kahan hai? Kab tak ready hoga?' },
  vo_karigar:            { ruleKey: 'vo_karigar',           scope: 'vo',     icon: '🛠️', label: 'Karigar — follow up',          days: 5,  recurDays: 5, ask: 'Mera order kahan hai? Kab tak doge?' },
  co_plating:            { ruleKey: 'co_plating',           scope: 'co_row', icon: '🪙', label: 'Plating mein atka hai',        days: 2,  recurDays: 2, ask: 'Plating abhi tak kyun nahi hui? Jaldi karwao.' },
  co_packing:            { ruleKey: 'co_packing',           scope: 'co_row', icon: '📦', label: 'Packing mein atka hai',        days: 3,  recurDays: 3, ask: 'Yeh abhi tak packing mein kyun hai? Jaldi move karo.' },
  co_karigar_unimported: { ruleKey: 'co_karigar_unimported', scope: 'co_row', icon: '📥', label: 'Vendor order mein add nahi hua', days: 2,  recurDays: 2, ask: 'Karigar assign ho gaya, lekin abhi tak vendor order mein import kyun nahi kiya?' },
  co_unassigned:         { ruleKey: 'co_unassigned',        scope: 'co',     icon: '⚠️', label: 'Karigar assign nahi hua',      days: 1,  recurDays: 1, ask: 'Is order ko abhi tak kisi vendor/karigar ko assign kyun nahi kiya?' },
  co_notdispatched:      { ruleKey: 'co_notdispatched',     scope: 'co',     icon: '🚚', label: 'Dispatch nahi hua',            days: 20, recurDays: 5, ask: 'Yeh order abhi tak dispatch kyun nahi hua? Kya hua?' },
};

export const FOLLOWUP_RULE_ORDER = ['vo_pipe', 'vo_karigar', 'co_plating', 'co_packing', 'co_karigar_unimported', 'co_unassigned', 'co_notdispatched'];

// ─── "Kya Bola?" — the mandatory response options ─────────────────────────────
// Forces a real answer instead of a blank "done" click. `kind` controls what
// extra field (if any) is required, and feeds submitFollowUpResponse()'s
// scheduling override.

export type FuReasonKind = 'date' | 'text' | 'instruction';

export interface FuReason {
  key: string;
  label: string;
  kind: FuReasonKind;
  question?: string;
  message?: string;
}

export const FU_REASONS: FuReason[] = [
  { key: 'in_process',   label: 'Process mein hai, de dega',  kind: 'date',        question: 'Kab tak?' },
  { key: 'unknown_delay', label: 'Pata nahi kitna time lagega', kind: 'text',       question: 'Kya karan itna delay ka?' },
  { key: 'no_pipe',      label: 'Pipe nahi aya ab tak',        kind: 'instruction', message: '📌 Likh ke rakh lo aur bhai se bolke pipe mangva lo' },
  { key: 'no_pickup',    label: 'Nahi uthaya call',            kind: 'instruction', message: '📞 Kal fir se try karo' },
  { key: 'other',        label: 'Others',                      kind: 'text',        question: '' },
];

// ─── Per-entity scheduling state ──────────────────────────────────────────────
// FollowUpEntry/FollowUpLogEntry live on AppData itself (types/index.ts),
// alongside PoolSource/StockItem and the rest of the persisted shape.

export interface FollowUpItem {
  key: string;
  rule: FollowUpRule;
  dueAt: number;
  overdueDays: number;
  timesFollowedUp: number;
  isBrokenPromise: boolean;
  promisedDate: string | null;
  kind: 'vo' | 'co';
  voId?: string;
  orderId?: string;
  vendor: string | null;
  title: string;
  subtitle: string;
}

export interface ComputeFollowUpsResult {
  items: FollowUpItem[];
  /** The updated followUps map — new entries seeded, stale ones (entities
   *  that are gone/resolved/archived) garbage-collected. Save this back via
   *  saveAppData() only when it actually differs from data.followUps. */
  nextFollowUps: Record<string, FollowUpEntry>;
}

function anchorOrNow(ts: string | number | undefined): number {
  const parsed = ts ? new Date(ts).getTime() : 0;
  return parsed > 0 ? parsed : Date.now();
}

/**
 * Computes every currently-due follow-up across all orders and vendor
 * orders. Pure — never mutates `data`. `now` is injectable for testing.
 */
export function computeFollowUps(data: AppData, now: number = Date.now()): ComputeFollowUpsResult {
  const existing = data.followUps ?? {};
  const nextFollowUps: Record<string, FollowUpEntry> = {};
  const items: FollowUpItem[] = [];
  const touched = new Set<string>();

  function entryFor(key: string, anchor: number): FollowUpEntry {
    const prev = existing[key];
    const firstSeenAt = prev?.firstSeenAt && prev.firstSeenAt <= anchor ? prev.firstSeenAt : anchor;
    return prev ? { ...prev, firstSeenAt } : { firstSeenAt, lastFollowUpAt: null, timesFollowedUp: 0 };
  }

  function dueItem(key: string, rule: FollowUpRule, anchor: number, ctx: Omit<FollowUpItem, 'key' | 'rule' | 'dueAt' | 'overdueDays' | 'timesFollowedUp' | 'isBrokenPromise' | 'promisedDate'>) {
    touched.add(key);
    const entry = entryFor(key, anchor);
    nextFollowUps[key] = entry;

    let dueAt: number;
    if (entry.nextDueOverride) {
      dueAt = entry.nextDueOverride;
    } else {
      const base = entry.lastFollowUpAt ?? entry.firstSeenAt;
      const intervalDays = entry.lastFollowUpAt ? rule.recurDays : rule.days;
      dueAt = base + intervalDays * 864e5;
    }

    if (now >= dueAt) {
      items.push({
        key, rule, dueAt, overdueDays: Math.floor((now - dueAt) / 864e5),
        timesFollowedUp: entry.timesFollowedUp,
        isBrokenPromise: entry.overrideKind === 'promised_date',
        promisedDate: entry.promisedDate ?? null,
        ...ctx,
      });
    }
  }

  // ── Vendor-order rules (pipe / karigar) ───────────────────────────────────
  (data.vendorOrders ?? []).forEach(vo => {
    const ruleKey = `vo_${vo.type ?? 'karigar'}`;
    const rule = FOLLOWUP_RULES[ruleKey];
    if (!rule) return; // plating vendor orders have no follow-up rule (matches Phase 1 — only pipe/karigar)
    const key = `vo:${vo.id}:${ruleKey}`;
    // Resolved once delivered. Phase 1 also treats "every row individually
    // ticked received" as resolved — Phase 2 doesn't track that per-row
    // boolean on vendor-order rows (it tracks partial quantities via
    // recvQty instead, see receiveUtils.ts), so `status==='delivered'` is
    // this rule's sole resolution signal here — a deliberate simplification.
    if (vendorAlert(vo) === 'done') return;
    const anchor = anchorOrNow(vo.startDate);
    dueItem(key, rule, anchor, {
      kind: 'vo', voId: vo.id, vendor: vo.vendor || '(no vendor)',
      title: `${vo.orderId || 'VORD'} · ${vo.vendor || '(no vendor)'}`,
      subtitle: `${rule.label} — banaya: ${vo.startDate}`,
    });
  });

  // ── Customer-order row rules: plating / packing / karigar-not-imported ────
  const rulePlating = FOLLOWUP_RULES.co_plating, rulePacking = FOLLOWUP_RULES.co_packing, ruleUnimported = FOLLOWUP_RULES.co_karigar_unimported;

  // A row is "genuinely imported" into a live karigar vendor order when some
  // karigar-type vendor design's sources[] actually references it — checked
  // this way (not just holder.importedToVOId) because that single field can
  // only remember the most recent of pipe/karigar/plating even though a row
  // can genuinely have all three relationships running at once.
  const karigarLinked = new Set<string>();
  (data.vendorOrders ?? []).forEach(vo => {
    if ((vo.type ?? 'karigar') !== 'karigar') return;
    (vo.designs ?? []).forEach(vd => {
      (vd.sources ?? []).forEach(s => karigarLinked.add(`${s.orderDbId}|${s.designId}|${s.varietyId ?? ''}`));
    });
  });

  (data.orders ?? []).forEach(order => {
    order.designs.forEach(d => {
      const flat = isFlatDesign(order, d);
      const rows: { holder: VendorPipelineFields; vri: number }[] = flat
        ? [{ holder: d, vri: -1 }]
        : (d.varieties ?? []).map((v, vri) => ({ holder: v, vri }));

      rows.forEach(({ holder, vri }) => {
        const rowLabel = `${order.orderId || 'ORD'} · ${order.client || '(no client)'}`;
        const varietyName = vri >= 0 ? (d.varieties?.[vri]?.name ?? '') : '';
        const designLabel = `"${d.name || 'design'}"${vri >= 0 && varietyName ? ` / ${varietyName}` : ''}`;
        const keyPlating = `co_row:${order.id}:${d.id}:${vri >= 0 ? vri : 'flat'}:co_plating`;
        const keyPacking = `co_row:${order.id}:${d.id}:${vri >= 0 ? vri : 'flat'}:co_packing`;
        const keyUnimported = `co_row:${order.id}:${d.id}:${vri >= 0 ? vri : 'flat'}:co_karigar_unimported`;

        if (order.archived) return; // never due — no need to touch/GC either, absence handles it

        const phase = coStage(holder);
        if (phase === 'plating') {
          dueItem(keyPlating, rulePlating, anchorOrNow(holder.platingVendorAt), {
            kind: 'co', orderId: order.id, vendor: holder.platingVendor || '(no vendor)', title: rowLabel, subtitle: `${rulePlating.label} — ${designLabel}`,
          });
        }
        if (phase === 'packing') {
          dueItem(keyPacking, rulePacking, anchorOrNow(holder.platingReceivedAt), {
            kind: 'co', orderId: order.id, vendor: null, title: rowLabel, subtitle: `${rulePacking.label} — ${designLabel}`,
          });
        }

        const genuinelyImported = karigarLinked.has(`${order.id}|${d.id}|${vri >= 0 ? (d.varieties?.[vri]?.id ?? '') : ''}`);
        const alreadyReceived = !!(holder.karigarReceived || holder.pipeReceived || holder.platingReceived);
        if (holder.assignedVendor && !genuinelyImported && !alreadyReceived) {
          dueItem(keyUnimported, ruleUnimported, anchorOrNow(holder.assignedVendorAt), {
            kind: 'co', orderId: order.id, vendor: holder.assignedVendor, title: rowLabel, subtitle: `${ruleUnimported.label} — ${designLabel}`,
          });
        }
      });
    });
  });

  // ── Customer-order-level rules: unassigned / not dispatched ───────────────
  const ruleUnassigned = FOLLOWUP_RULES.co_unassigned, ruleNotDispatched = FOLLOWUP_RULES.co_notdispatched;
  (data.orders ?? []).forEach(order => {
    if (order.archived) return;
    // A pre-existing order with no real createdAt would otherwise anchor to
    // the Unix epoch and look "instantly 20 days overdue" the moment this
    // ships — treat that (and anything missing) as "start the clock now".
    const anchor = anchorOrNow(order.createdAt);
    const ctx = { kind: 'co' as const, orderId: order.id, vendor: null, title: `${order.orderId || 'ORD'} · ${order.client || '(no client)'}` };

    const zeroAssignment = order.designs.every(d => {
      const flat = isFlatDesign(order, d);
      const rows = flat ? [d] : (d.varieties ?? []);
      return rows.every(r => !r.assignedVendor && !r.pipeVendor);
    });
    if (zeroAssignment) {
      dueItem(`co:${order.id}:co_unassigned`, ruleUnassigned, anchor, { ...ctx, subtitle: `${ruleUnassigned.label} — banaya: ${order.startDate}` });
    }

    if (orderStatus(order) !== 'done') {
      dueItem(`co:${order.id}:co_notdispatched`, ruleNotDispatched, anchor, { ...ctx, subtitle: `${ruleNotDispatched.label} — banaya: ${order.startDate}` });
    }
  });

  // Anything in `existing` never touched this pass belongs to an entity
  // that's gone (deleted/archived/resolved) — dropped by simply not being
  // copied into nextFollowUps, keeping it bounded.
  void touched;

  items.sort((a, b) => b.overdueDays - a.overdueDays);
  return { items, nextFollowUps };
}

// ─── Submitting a "Kya Bola?" response ────────────────────────────────────────

export interface SubmitResult {
  followUps: Record<string, FollowUpEntry>;
  followUpLog: FollowUpLogEntry[];
}

/**
 * Records a response for one due item: bumps its schedule (or applies a
 * date/retry override), and appends to the 90-day-bounded log. `detail` is
 * required for 'date'/'text' reasons, ignored (the reason's own message is
 * used) for 'instruction' ones — the caller validates this before calling.
 */
export function submitFollowUpResponse(
  data: AppData,
  item: FollowUpItem,
  reason: FuReason,
  detail: string,
  loggedBy: string,
  now: number = Date.now(),
): SubmitResult {
  const prevEntry = data.followUps?.[item.key] ?? { firstSeenAt: now, lastFollowUpAt: null, timesFollowedUp: 0 };
  const entry: FollowUpEntry = {
    ...prevEntry,
    lastFollowUpAt: now,
    timesFollowedUp: (prevEntry.timesFollowedUp ?? 0) + 1,
  };
  delete entry.nextDueOverride; delete entry.overrideKind; delete entry.promisedDate;

  const finalDetail = reason.kind === 'instruction' ? (reason.message ?? '') : detail;

  if (reason.kind === 'date') {
    const promisedTs = new Date(`${detail}T00:00:00`).getTime();
    if (promisedTs && !isNaN(promisedTs)) {
      entry.nextDueOverride = promisedTs;
      entry.overrideKind = 'promised_date';
      entry.promisedDate = detail;
    }
  } else if (reason.key === 'no_pickup') {
    entry.nextDueOverride = now + 1 * 864e5; // try again tomorrow, not the normal multi-day interval
    entry.overrideKind = 'retry_tomorrow';
  }

  const followUps = { ...(data.followUps ?? {}), [item.key]: entry };

  const logEntry: FollowUpLogEntry = {
    key: item.key, ruleKey: item.rule.ruleKey, kind: item.kind, vendor: item.vendor,
    title: item.title, subtitle: item.subtitle,
    reasonKey: reason.key, reasonLabel: reason.label, detail: finalDetail,
    loggedBy, loggedAt: now,
  };
  const cutoff = now - 90 * 864e5;
  const followUpLog = [...(data.followUpLog ?? []), logEntry].filter(e => e.loggedAt >= cutoff);

  return { followUps, followUpLog };
}

/** Most recent log entry for this exact follow-up key — "what was said last
 *  time", so nobody has to remember or dig through logs before calling again. */
export function lastLogFor(data: AppData, key: string): FollowUpLogEntry | null {
  const entries = (data.followUpLog ?? []).filter(e => e.key === key);
  if (!entries.length) return null;
  return entries.reduce((a, b) => (a.loggedAt > b.loggedAt ? a : b));
}

/** Full chronological history (oldest→newest) for one exact entity — powers
 *  a per-order/vendor-order "Follow-up Trail". */
export function trailFor(data: AppData, kind: 'vo' | 'co', id: string): FollowUpLogEntry[] {
  return (data.followUpLog ?? [])
    .filter(e => e.kind === kind && e.key.split(':')[1] === id)
    .sort((a, b) => a.loggedAt - b.loggedAt);
}

export type { Order, VendorOrder };

// ─── Grouping + severity (drives the redesigned collapsed-per-vendor UI) ─────
// Ports Phase 1's _fuSeverityOf()/_FU_SEV_COLORS and openFollowUpsModal()'s
// grouping logic (Sept 2026 redesign, 327819d) exactly.

export type FuSeverity = 'crit' | 'warn' | 'ok';

export function severityOf(overdueDays: number): FuSeverity {
  return overdueDays >= 60 ? 'crit' : overdueDays >= 30 ? 'warn' : 'ok';
}

export const SEV_COLORS: Record<FuSeverity, { bg: string; tx: string; bd: string }> = {
  crit: { bg: '#FCEBEB', tx: '#A32D2D', bd: '#F09595' },
  warn: { bg: '#FFF3E0', tx: '#BF360C', bd: '#FFB74D' },
  ok:   { bg: '#E9F7EF', tx: '#1B7A43', bd: '#A9DFBF' },
};

export interface FollowUpGroup {
  key: string;
  label: string;
  icon: string;
  rows: FollowUpItem[];
  oldest: number;
  isVendor: boolean;
}

/** Splits items into one group per vendor (something to call someone about)
 *  plus a single "order-level" catch-all group (nobody external to call —
 *  assignment/dispatch/packing) — most-overdue group first. */
export function groupByVendor(items: FollowUpItem[]): FollowUpGroup[] {
  const vendorItems = items.filter(it => it.vendor);
  const orderItems = items.filter(it => !it.vendor);

  const byVendor = new Map<string, FollowUpItem[]>();
  vendorItems.forEach(it => {
    const v = it.vendor!;
    if (!byVendor.has(v)) byVendor.set(v, []);
    byVendor.get(v)!.push(it);
  });

  const groups: FollowUpGroup[] = [...byVendor.entries()].map(([vendor, rows]) => {
    const sorted = [...rows].sort((a, b) => b.overdueDays - a.overdueDays);
    return { key: `v:${vendor}`, label: vendor, icon: '🏭', rows: sorted, oldest: sorted[0].overdueDays, isVendor: true };
  });

  if (orderItems.length) {
    const sorted = [...orderItems].sort((a, b) => b.overdueDays - a.overdueDays);
    groups.push({ key: 'v:__order_level__', label: 'Order-level (koi vendor nahi)', icon: '📋', rows: sorted, oldest: sorted[0].overdueDays, isVendor: false });
  }

  return groups.sort((a, b) => b.oldest - a.oldest);
}
