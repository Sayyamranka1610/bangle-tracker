import type { Order, VendorOrder } from '../../types';
import { buildVendorSummary } from '../../lib/coStageUtils';

// Mirrors Phase 1's buildVendorSummaryPanel: groups every design/variety row
// in the order by its assigned karigar vendor, showing sizes per row, plus
// the "→ VORD-xx" badge once a row has been pulled into an actual Vendor
// Order via the Assign page (importedToVOId).

export default function VendorSummaryTab({ order, vendorOrders }: { order: Order; vendorOrders: VendorOrder[] }) {
  const groups = buildVendorSummary(order);

  if (!order.designs?.length) {
    return <div className="text-center py-8 text-white/30 text-sm">No designs in this order yet.</div>;
  }

  const assigned = groups.filter(g => g.vendor);
  const unassigned = groups.find(g => !g.vendor);

  return (
    <div className="space-y-3">
      {!assigned.length && (
        <div className="text-xs text-yellow-300 bg-yellow-500/10 rounded-lg px-3 py-2">
          ℹ️ No vendor assigned yet. Use the Karigar dropdown on each row in the Designs &amp; Varieties tab to assign one.
        </div>
      )}

      {assigned.map(({ vendor, rows }) => {
        const linkedVOIds = [...new Set(rows.map(r => r.importedToVOId).filter((id): id is string => !!id))];
        return (
          <div key={vendor} className="border border-white/10 rounded-xl overflow-hidden">
            <div className="bg-white/5 px-3 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">🏭 {vendor}</span>
              <span className="text-xs bg-white/10 text-white/60 rounded-full px-2 py-0.5">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
              {linkedVOIds.map(voId => {
                const vo = vendorOrders.find(v => v.id === voId);
                return vo ? (
                  <span key={voId} className="text-[10px] font-semibold bg-[#534AB7] text-white rounded px-2 py-0.5">📋 {vo.orderId}</span>
                ) : null;
              })}
              {rows.some(r => !r.importedToVOId) && (
                <span className="text-[10px] bg-yellow-500/15 text-yellow-300 rounded px-2 py-0.5">⏳ Some rows not yet in vendor order</span>
              )}
            </div>
            <div className="divide-y divide-white/5">
              {rows.map((r, i) => (
                <VendorSummaryRow key={i} row={r} vendorOrders={vendorOrders} />
              ))}
            </div>
          </div>
        );
      })}

      {unassigned && (
        <div className="border border-red-500/30 rounded-xl overflow-hidden">
          <div className="bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            ⚠️ Not assigned to any vendor ({unassigned.rows.length} row{unassigned.rows.length !== 1 ? 's' : ''})
          </div>
          <div className="divide-y divide-white/5">
            {unassigned.rows.map((r, i) => (
              <VendorSummaryRow key={i} row={r} vendorOrders={vendorOrders} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VendorSummaryRow({ row, vendorOrders }: { row: import('../../lib/coStageUtils').VendorSummaryRow; vendorOrders: VendorOrder[] }) {
  const nonZero = Object.entries(row.sizes ?? {}).filter(([, v]) => (Number(v) || 0) > 0);
  const linkedVO = row.importedToVOId ? vendorOrders.find(v => v.id === row.importedToVOId) : null;
  return (
    <div className="px-3 py-2 flex flex-wrap items-baseline gap-2 text-xs">
      <span className="font-medium text-white min-w-[120px]">
        {row.designName || '—'}
        {row.varName && <span className="text-white/40"> · <em>{row.varName}</em></span>}
        {!row.varName && row.designCode && <span className="ml-1 text-[10px] bg-white/10 text-white/50 rounded px-1.5 py-0.5">{row.designCode}</span>}
      </span>
      <span className="flex flex-wrap gap-1 flex-1">
        {nonZero.length
          ? nonZero.map(([sz, qty]) => (
              <span key={sz} className="bg-white/10 text-white/70 rounded px-1.5 py-0.5">{sz}: {qty}</span>
            ))
          : <span className="text-white/20">—</span>}
      </span>
      {linkedVO ? (
        <span className="text-[10px] text-[#a89fff]">→ {linkedVO.orderId}</span>
      ) : (
        <span className="text-[10px] text-white/20">not yet added to vendor order</span>
      )}
    </div>
  );
}
