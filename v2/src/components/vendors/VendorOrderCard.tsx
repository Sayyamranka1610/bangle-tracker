import { useState } from 'react';
import type { AppData, Order, VendorOrder, VendorStatus } from '../../types';
import ReceiveModal from './ReceiveModal';
import VendorWhoModal from './VendorWhoModal';
import { receivableDesigns } from '../../lib/receiveUtils';
import { voQty } from '../../lib/vendorWhoUtils';
import { printVendorOrder } from '../../lib/vendorPrintUtils';
import { vendorAlert, voRowsProgress, STATUS_PCT, STATUS_LABELS, ALL_STATUSES, ALERT_CONFIG } from '../../lib/vendorUtils';
import FollowUpTrail from '../followups/FollowUpTrail';
import { useLightbox } from '../lightboxContext';

interface Props {
  order: VendorOrder;
  data: AppData;
  canEdit: boolean;
  onEdit: (o: VendorOrder) => void;
  onDelete: (o: VendorOrder) => void;
  onArchive: (o: VendorOrder) => void;
  onRestore: (o: VendorOrder) => void;
  onStatusChange: (o: VendorOrder, status: VendorStatus) => void;
  onWhoChange: (patch: { vendorOrders: VendorOrder[]; orders?: Order[] }, auditDetail: string) => void;
  onHoldToggle: (order: VendorOrder, designId: string) => void;
}

const priorityColors: Record<string, string> = {
  normal:   '',
  urgent:   'text-orange-700',
  critical: 'text-red-700',
};

const priorityLabels: Record<string, string> = {
  normal: '', urgent: '⚡ Urgent', critical: '🔴 Critical',
};

export default function VendorOrderCard({ order, data, canEdit, onEdit, onDelete, onArchive, onRestore, onStatusChange, onWhoChange, onHoldToggle }: Props) {
  const lightbox = useLightbox();
  const [receiving, setReceiving] = useState(false);
  const [showDesigns, setShowDesigns] = useState(false);
  const [whoDesignId, setWhoDesignId] = useState<string | null>(null);
  const pooledCount = receivableDesigns(order).length;
  const alert = vendorAlert(order);
  const pct   = STATUS_PCT[order.status];
  const rows  = voRowsProgress(order);
  const { label: alertLabel, color, bg, bar } = ALERT_CONFIG[alert];

  return (
    <div className="bg-white border border-black/10 rounded-xl p-4 hover:bg-[#FAFAF8] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-[#1a1916]/55">{order.orderId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color} ${bg}`}>
              {alertLabel}
            </span>
            {order.priority !== 'normal' && (
              <span className={`text-xs font-medium ${priorityColors[order.priority]}`}>
                {priorityLabels[order.priority]}
              </span>
            )}
          </div>
          <h3 className="text-[#1a1916] font-semibold mt-0.5 truncate">🏭 {order.vendor}</h3>
        </div>

        {canEdit && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(order)}
              className="p-1.5 text-[#1a1916]/55 hover:text-[#1a1916] hover:bg-black/[0.06] rounded-lg transition-colors text-sm"
              title="Edit"
            >✏️</button>
            {order.archived ? (
              <button onClick={() => onRestore(order)} title="Restore this order to Active"
                className="px-2 py-1 text-xs font-bold text-[#3C3489] bg-[#EEEDFE] border border-[#AFA9EC] rounded-lg">↩ Restore</button>
            ) : (
              <button onClick={() => onArchive(order)} title="Archive this order (hides it from the active list, keeps it for analytics)"
                className="p-1.5 text-[#1a1916]/55 hover:text-[#1a1916] hover:bg-black/[0.06] rounded-lg transition-colors text-sm">📦</button>
            )}
            <button
              onClick={() => onDelete(order)}
              className="p-1.5 text-[#1a1916]/55 hover:text-red-700 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
              title="Delete"
            >🗑️</button>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#1a1916]/60 mb-3">
        <span>📅 Start {order.startDate}</span>
        {order.deliveryDate && <span>🚚 Due {order.deliveryDate}</span>}
        {(order.designs?.length ?? 0) > 0 && (
          <button onClick={() => setShowDesigns(s => !s)} className="hover:text-[#1a1916] transition-colors">
            🎨 {order.designs!.length} design{order.designs!.length !== 1 ? 's' : ''} {showDesigns ? '▾' : '▸'}
          </button>
        )}
        {rows.total > 0 && (
          <span className={rows.received === rows.total ? 'text-green-700 font-semibold' : ''}
            title="Rows (designs / varieties) already received from the vendor">
            📥 {rows.received}/{rows.total} received
          </span>
        )}
        {pooledCount > 0 && (
          <span className="text-[#534AB7]" title="Lines pooled from several customer orders">
            🧲 {pooledCount} pooled
          </span>
        )}
      </div>

      {/* Design rows — code, quantity, and who it's for if pooled from customers */}
      {showDesigns && (order.designs?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1 mb-3">
          {order.designs!.map(d => {
            const sourceCount = d.sources?.length ?? 0;
            // Every photo on this row (its own + each variety's) — click one to page through them all,
            // same as Phase 1's design-row thumbnails.
            const rowPhotos = [...(d.images ?? []), ...(d.varieties ?? []).flatMap(v => v.images ?? [])];
            return (
              <div key={d.id} className={`flex items-center gap-2 bg-white border rounded-lg px-2.5 py-1.5 text-xs ${d.onHold ? 'border-amber-400/40 border-l-2' : 'border-black/10'}`}>
                {rowPhotos.length > 0 && (
                  <div className="flex gap-1 flex-shrink-0">
                    {rowPhotos.slice(0, 3).map((img, i) => (
                      <img key={i} src={img.data} alt="" loading="lazy" title="Click to enlarge"
                        onClick={() => lightbox.open(rowPhotos.map(p => p.hqData || p.data), i)}
                        className="w-9 h-9 rounded-[5px] object-cover border border-[#AFA9EC] cursor-zoom-in hover:brightness-95" />
                    ))}
                    {rowPhotos.length > 3 && (
                      <button onClick={() => lightbox.open(rowPhotos.map(p => p.hqData || p.data), 3)}
                        className="w-9 h-9 rounded-[5px] bg-black/[0.06] text-[10px] font-semibold text-[#1a1916]/60 hover:bg-black/10">+{rowPhotos.length - 3}</button>
                    )}
                  </div>
                )}
                <span className="text-[#1a1916]/80 font-medium truncate flex-1 min-w-0">{d.code || d.name || '—'}</span>
                <span className="text-[#1a1916]/55 flex-shrink-0">{voQty(d.sizes)} {d.unit || 'pcs'}</span>
                {d.onHold && (
                  <button onClick={() => onHoldToggle(order, d.id)}
                    title={`⏸ On hold — ${d.holdReason || '(no reason given)'}. Click to edit or take off hold.`}
                    className="text-[10px] font-bold bg-amber-400/15 text-amber-700 border border-amber-400/40 rounded-full px-2 py-0.5 flex-shrink-0 max-w-[140px] truncate">
                    ⏸ {d.holdReason || '(no reason given)'}
                  </button>
                )}
                {canEdit && !d.onHold && (
                  <button onClick={() => onHoldToggle(order, d.id)}
                    title="Put this row on hold"
                    className="text-[10px] w-5 h-5 flex-shrink-0 rounded-full bg-white border border-black/10 text-[#1a1916]/40 hover:text-amber-700 hover:border-amber-400/40 flex items-center justify-center">
                    ⏸
                  </button>
                )}
                {sourceCount > 0 && (
                  <button onClick={() => setWhoDesignId(d.id)}
                    title="View which customers this row is for"
                    className="text-[10px] font-semibold bg-[#534AB7]/20 hover:bg-[#534AB7]/35 text-[#3C3489] rounded-full px-2 py-0.5 flex-shrink-0">
                    👥 {sourceCount} customer{sourceCount !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {whoDesignId && (
        <VendorWhoModal
          data={data}
          vo={order}
          vendorDesignId={whoDesignId}
          canEdit={canEdit}
          onChange={onWhoChange}
          onClose={() => setWhoDesignId(null)}
        />
      )}

      {/* Print — vendor-facing copy (sizes/totals only) or internal copy
          (adds which customer(s) each pooled row is for) */}
      {(order.designs?.length ?? 0) > 0 && (
        <div className="flex gap-1.5 mb-3">
          <button
            onClick={() => printVendorOrder(order, { internal: false })}
            className="flex-1 py-1.5 rounded-lg bg-white hover:bg-black/[0.06] border border-black/15 text-[#1a1916]/80 text-xs font-medium transition-colors">
            🖨️ Print for vendor
          </button>
          {pooledCount > 0 && (
            <button
              onClick={() => printVendorOrder(order, { internal: true })}
              className="flex-1 py-1.5 rounded-lg bg-white hover:bg-black/[0.06] border border-black/15 text-[#1a1916]/80 text-xs font-medium transition-colors">
              🏠 Print internal copy
            </button>
          )}
        </div>
      )}

      {/* Receiving — only for batches that were pooled from customer orders */}
      {pooledCount > 0 && (
        <button
          onClick={() => setReceiving(true)}
          className="w-full mb-3 py-1.5 rounded-lg bg-[#534AB7]/20 hover:bg-[#534AB7]/35 border border-[#534AB7]/50 text-[#3C3489] text-xs font-medium transition-colors">
          📥 Receive &amp; split back to customers
        </button>
      )}
      {receiving && <ReceiveModal vo={order} onClose={() => setReceiving(false)} />}

      {/* Status selector + progress */}
      <div className="space-y-2">
        {canEdit ? (
          <select
            value={order.status}
            onChange={e => onStatusChange(order, e.target.value as VendorStatus)}
            className="w-full bg-white border border-black/10 rounded-lg px-3 py-1.5 text-[#1a1916] text-xs focus:outline-none focus:border-[#534AB7]"
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-[#1a1916]/70">{STATUS_LABELS[order.status]}</span>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-[#1a1916]/55 w-7 text-right">{pct}%</span>
        </div>
      </div>

      {order.notes && (
        <p className="text-xs text-[#1a1916]/40 mt-2 truncate">{order.notes}</p>
      )}

      <FollowUpTrail data={data} kind="vo" id={order.id} />
    </div>
  );
}
