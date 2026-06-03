import type { Order } from '../../types';
import { orderAlert, orderPct, orderTotalQty, ALERT_CONFIG, PRIORITY_LABELS, BANGLE_TYPE_LABELS } from '../../lib/orderUtils';

interface Props {
  order: Order;
  canEdit: boolean;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
}

const priorityColors: Record<string, string> = {
  normal:   'text-white/40',
  urgent:   'text-orange-400',
  critical: 'text-red-400',
};

export default function OrderCard({ order, canEdit, onEdit, onDelete }: Props) {
  const alert = orderAlert(order);
  const pct = orderPct(order);
  const qty = orderTotalQty(order);
  const { label, color, bg } = ALERT_CONFIG[alert];

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/8 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-white/40">{order.orderId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color} ${bg}`}>{label}</span>
            {order.priority !== 'normal' && (
              <span className={`text-xs font-medium ${priorityColors[order.priority]}`}>
                ⚡ {PRIORITY_LABELS[order.priority]}
              </span>
            )}
          </div>
          <h3 className="text-white font-semibold mt-0.5 truncate">{order.client}</h3>
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

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50 mb-3">
        <span>📅 {order.startDate}</span>
        <span>🧲 {BANGLE_TYPE_LABELS[order.bangleType] ?? order.bangleType}</span>
        <span>🎨 {order.designs.length} design{order.designs.length !== 1 ? 's' : ''}</span>
        {qty > 0 && <span>📦 {qty} pcs</span>}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              alert === 'done' ? 'bg-indigo-500' :
              alert === 'late' ? 'bg-red-500' :
              alert === 'warn' ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-white/40 w-8 text-right">{pct}%</span>
      </div>

      {/* Notes */}
      {order.notes && (
        <p className="text-xs text-white/30 mt-2 truncate">{order.notes}</p>
      )}
    </div>
  );
}
