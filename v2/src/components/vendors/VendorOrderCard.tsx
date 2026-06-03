import type { VendorOrder, VendorStatus } from '../../types';
import { vendorAlert, STATUS_PCT, STATUS_LABELS, ALL_STATUSES, ALERT_CONFIG } from '../../lib/vendorUtils';

interface Props {
  order: VendorOrder;
  canEdit: boolean;
  onEdit: (o: VendorOrder) => void;
  onDelete: (o: VendorOrder) => void;
  onStatusChange: (o: VendorOrder, status: VendorStatus) => void;
}

const priorityColors: Record<string, string> = {
  normal:   '',
  urgent:   'text-orange-400',
  critical: 'text-red-400',
};

const priorityLabels: Record<string, string> = {
  normal: '', urgent: '⚡ Urgent', critical: '🔴 Critical',
};

export default function VendorOrderCard({ order, canEdit, onEdit, onDelete, onStatusChange }: Props) {
  const alert = vendorAlert(order);
  const pct   = STATUS_PCT[order.status];
  const { label: alertLabel, color, bg, bar } = ALERT_CONFIG[alert];

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-white/40">{order.orderId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color} ${bg}`}>
              {alertLabel}
            </span>
            {order.priority !== 'normal' && (
              <span className={`text-xs font-medium ${priorityColors[order.priority]}`}>
                {priorityLabels[order.priority]}
              </span>
            )}
          </div>
          <h3 className="text-white font-semibold mt-0.5 truncate">🏭 {order.vendor}</h3>
        </div>

        {canEdit && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(order)}
              className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm"
              title="Edit"
            >✏️</button>
            <button
              onClick={() => onDelete(order)}
              className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
              title="Delete"
            >🗑️</button>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50 mb-3">
        <span>📅 Start {order.startDate}</span>
        {order.deliveryDate && <span>🚚 Due {order.deliveryDate}</span>}
        {(order.designs?.length ?? 0) > 0 && (
          <span>🎨 {order.designs!.length} design{order.designs!.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Status selector + progress */}
      <div className="space-y-2">
        {canEdit ? (
          <select
            value={order.status}
            onChange={e => onStatusChange(order, e.target.value as VendorStatus)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#534AB7]"
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-white/60">{STATUS_LABELS[order.status]}</span>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-white/40 w-7 text-right">{pct}%</span>
        </div>
      </div>

      {order.notes && (
        <p className="text-xs text-white/30 mt-2 truncate">{order.notes}</p>
      )}
    </div>
  );
}
