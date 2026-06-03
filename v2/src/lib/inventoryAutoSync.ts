import type { Order, LedgerEntry, DesignStage } from '../types';
import { stageGroup } from './designUtils';
import type { InvType } from './inventoryUtils';

// Mirrors Phase 1 autoSyncInventoryFromStages()
// Called whenever a stage status or qty changes.
// Derives raw/semi/finished IN/OUT/rejection entries from stage data.

function stageGroupOf(stage: DesignStage): string {
  return stage.group ?? stageGroup(stage.stageId);
}

function makeEntry(
  type: InvType,
  qty: number,
  date: string,
  vendor: string,
  note: string,
  stageRef: { oi: number; di: number; si: number; groupId: string },
  designName: string,
  designCode: string,
  orderId: string,
  rejections: number,
): LedgerEntry {
  return {
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    date,
    designName,
    designCode,
    type,
    qty,
    qtyKg: 0,
    qtySets: qty,
    orderId,
    vendor,
    note,
    source: 'auto',
    autoType: type,
    stageRef,
    rejections,
  };
}

// Returns the updated ledger — replaces any existing auto-entries for this stage ref
export function syncInventoryForOrder(
  orders: Order[],
  orderIndex: number,
  existingLedger: LedgerEntry[],
): LedgerEntry[] {
  const order = orders[orderIndex];
  if (!order) return existingLedger;

  // Remove existing auto-entries for this order
  const filtered = existingLedger.filter(
    e => !(e.source === 'auto' && e.orderId === order.id),
  );

  const newEntries: LedgerEntry[] = [];

  order.designs.forEach((design, di) => {
    const stages = design.stages ?? [];
    const groups: Record<string, DesignStage[]> = {};

    stages.forEach(s => {
      const g = stageGroupOf(s);
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });

    Object.entries(groups).forEach(([groupId, groupStages]) => {
      const doneStages = groupStages.filter(s => s.status === 'done' && s.qty);
      if (!doneStages.length) return;

      const firstStage = doneStages[0];
      const firstQty = firstStage.qty ?? 0;
      const todayStr = new Date().toISOString().slice(0, 10);
      const vendor = firstStage.vendor ?? '';
      const note = firstStage.stageNote ?? '';
      const si = stages.indexOf(firstStage);

      const ref = { oi: orderIndex, di, si, groupId };
      const dname = design.name;
      const dcode = design.code ?? '';
      const oid = order.id;
      const date = firstStage.completionDate ?? todayStr;

      if (groupId === 'raw') {
        // First raw done → RAW IN
        newEntries.push(makeEntry('raw_in', firstQty, date, vendor, note, ref, dname, dcode, oid, 0));
      } else if (groupId === 'semi') {
        // First semi done → RAW OUT + SEMI IN
        const rejection = firstQty < (doneStages[0]?.qty ?? firstQty) ? (firstQty - (doneStages[0]?.qty ?? firstQty)) : 0;
        newEntries.push(makeEntry('raw_out',  firstQty, date, vendor, note, ref, dname, dcode, oid, 0));
        newEntries.push(makeEntry('semi_in',  firstQty, date, vendor, note, ref, dname, dcode, oid, 0));
        if (rejection > 0) {
          newEntries.push(makeEntry('raw_rejection', rejection, date, vendor, 'Auto-rejection', ref, dname, dcode, oid, rejection));
        }
      } else if (groupId === 'finished') {
        // First finished done → SEMI OUT + FIN IN
        newEntries.push(makeEntry('semi_out', firstQty, date, vendor, note, ref, dname, dcode, oid, 0));
        newEntries.push(makeEntry('fin_in',   firstQty, date, vendor, note, ref, dname, dcode, oid, 0));
      }

      // Handle rejections within group (qty diff between consecutive done stages)
      for (let i = 1; i < doneStages.length; i++) {
        const prevQty = doneStages[i - 1].qty ?? 0;
        const currQty = doneStages[i].qty ?? 0;
        const diff = prevQty - currQty;
        if (diff > 0) {
          const rejType: InvType = groupId === 'raw' ? 'raw_rejection' : groupId === 'semi' ? 'semi_rejection' : 'fin_rejection';
          const si2 = stages.indexOf(doneStages[i]);
          newEntries.push(makeEntry(rejType, diff, date, vendor, doneStages[i].stageNote ?? 'Qty diff rejection',
            { oi: orderIndex, di, si: si2, groupId }, dname, dcode, oid, diff));
        }
      }
    });
  });

  return [...filtered, ...newEntries];
}
