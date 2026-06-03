import { useState } from 'react';
import type { Order, EmbeddedDesign, DesignStage } from '../../types';
import { orderAlert, orderPct, orderTotalQty, ALERT_CONFIG, PRIORITY_LABELS, BANGLE_TYPE_LABELS } from '../../lib/orderUtils';
import { uid } from '../../lib/orderUtils';
import { makeStageFresh, DEFAULT_SIZES } from '../../lib/designUtils';
import StagesTab from './StagesTab';
import DesignsTab from './DesignsTab';

type Tab = 'details' | 'designs' | 'stages';

interface Props {
  order: Order;
  canEdit: boolean;
  dnames: string[];
  dcodes: string[];
  onUpdate: (updated: Order) => void;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
}

const priorityColors: Record<string, string> = {
  normal: 'text-white/40', urgent: 'text-orange-400', critical: 'text-red-400',
};

export default function OrderCard({ order, canEdit, dnames, dcodes, onUpdate, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('designs');

  const alert = orderAlert(order);
  const pct   = orderPct(order);
  const qty   = orderTotalQty(order);
  const { label, color, bg } = ALERT_CONFIG[alert];

  // ── Inline field edits (details tab) ────────────────────────────────────────
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState('');

  function commitField(field: string, value: string) {
    onUpdate({ ...order, [field]: value });
    setEditingField(null);
  }

  // ── Stage change ────────────────────────────────────────────────────────────
  function handleStageChange(di: number, si: number, patch: Partial<DesignStage>) {
    const designs = order.designs.map((d, i) => {
      if (i !== di) return d;
      return { ...d, stages: d.stages.map((s, j) => j === si ? { ...s, ...patch } : s) };
    });
    onUpdate({ ...order, designs });
  }

  // ── Design changes ──────────────────────────────────────────────────────────
  function handleDesignChange(di: number, design: EmbeddedDesign) {
    const designs = order.designs.map((d, i) => i === di ? design : d);
    onUpdate({ ...order, designs });
  }

  function handleAddDesign() {
    const szKeys = [...DEFAULT_SIZES];
    const newDesign: EmbeddedDesign = {
      id: uid(),
      name: '',
      sizes: Object.fromEntries(szKeys.map(s => [s, 0])),
      sizesLocked: false,
      images: [],
      varieties: [{ id: uid(), name: 'Variety 1', sizes: Object.fromEntries(szKeys.map(s => [s, 0])), images: [], unit: 'pcs' }],
      stages: makeStageFresh(),
    };
    onUpdate({ ...order, designs: [...order.designs, newDesign] });
  }

  function handleRemoveDesign(di: number) {
    if (order.designs.length <= 1) return;
    onUpdate({ ...order, designs: order.designs.filter((_, i) => i !== di) });
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Order Details' },
    { id: 'designs', label: `Designs (${order.designs.length})` },
    { id: 'stages',  label: 'Production Stages' },
  ];

  function InlineField({ field, value, type = 'text', options }: { field: string; value: string; type?: string; options?: { value: string; label: string }[] }) {
    if (!canEdit) return <span className="text-white">{value || '—'}</span>;
    if (editingField === field) {
      if (options) {
        return (
          <select autoFocus value={fieldValue}
            onChange={e => setFieldValue(e.target.value)}
            onBlur={() => commitField(field, fieldValue)}
            className="bg-white/10 border border-[#534AB7] rounded px-2 py-1 text-white text-sm focus:outline-none">
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      }
      return (
        <input autoFocus type={type} value={fieldValue}
          onChange={e => setFieldValue(e.target.value)}
          onBlur={() => commitField(field, fieldValue)}
          onKeyDown={e => e.key === 'Enter' && commitField(field, fieldValue)}
          className={`bg-white/10 border border-[#534AB7] rounded px-2 py-1 text-white text-sm focus:outline-none ${type === 'date' ? '[color-scheme:dark]' : ''}`} />
      );
    }
    return (
      <span className="text-white cursor-pointer hover:text-[#a89fff] transition-colors"
        onClick={() => { setEditingField(field); setFieldValue(value); }}>
        {value || <span className="text-white/30 italic">click to edit</span>}
      </span>
    );
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${expanded ? 'border-[#534AB7]/50' : 'border-white/10'}`}>
      {/* ── Card header ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-white/3 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-white/40">{order.orderId}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color} ${bg}`}>{label}</span>
            {order.priority !== 'normal' && (
              <span className={`text-xs font-medium ${priorityColors[order.priority]}`}>
                ⚡ {PRIORITY_LABELS[order.priority]}
              </span>
            )}
          </div>
          <p className="text-white font-semibold mt-0.5 truncate">{order.client}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/40 mt-0.5">
            <span>📅 {order.startDate}</span>
            <span>{BANGLE_TYPE_LABELS[order.bangleType]}</span>
            <span>{order.designs.length} design{order.designs.length !== 1 ? 's' : ''}</span>
            {qty > 0 && <span>{qty} pcs</span>}
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          <div className="flex gap-1">
            {canEdit && (
              <>
                <button onClick={e => { e.stopPropagation(); onEdit(order); }}
                  className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm">✏️</button>
                <button onClick={e => { e.stopPropagation(); onDelete(order); }}
                  className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm">🗑️</button>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${alert === 'done' ? 'bg-indigo-500' : alert === 'late' ? 'bg-red-500' : alert === 'warn' ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-white/30">{pct}%</span>
            <span className={`text-white/30 text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
          </div>
        </div>
      </button>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-white/10">
          {/* Tabs */}
          <div className="flex border-b border-white/10 bg-white/2">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-[#534AB7] text-white'
                    : 'border-transparent text-white/40 hover:text-white'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* ── Details tab ── */}
            {activeTab === 'details' && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Client</p>
                    <InlineField field="client" value={order.client} />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Start date</p>
                    <InlineField field="startDate" value={order.startDate} type="date" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Priority</p>
                    <InlineField field="priority" value={order.priority}
                      options={[
                        { value: 'normal', label: 'Normal' },
                        { value: 'urgent', label: 'Urgent' },
                        { value: 'critical', label: 'Critical' },
                      ]} />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Bangle type</p>
                    <InlineField field="bangleType" value={order.bangleType}
                      options={[
                        { value: 'dye_gold', label: 'Dye Gold' },
                        { value: 'cnc', label: 'CNC' },
                        { value: 'both', label: 'Both' },
                      ]} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-0.5">Notes</p>
                  {canEdit && editingField === 'notes' ? (
                    <textarea value={fieldValue} onChange={e => setFieldValue(e.target.value)}
                      onBlur={() => commitField('notes', fieldValue)}
                      rows={2} autoFocus
                      className="w-full bg-white/10 border border-[#534AB7] rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none" />
                  ) : (
                    <span className={`text-white ${canEdit ? 'cursor-pointer hover:text-[#a89fff]' : ''}`}
                      onClick={() => canEdit && (setEditingField('notes'), setFieldValue(order.notes ?? ''))}>
                      {order.notes || <span className="text-white/30 italic">{canEdit ? 'click to add notes' : '—'}</span>}
                    </span>
                  )}
                </div>
                <div className="pt-1 border-t border-white/10">
                  <p className="text-xs text-white/30">Order ID: <span className="font-mono text-white/50">{order.orderId}</span></p>
                  <p className="text-xs text-white/30">Created: {order.createdAt?.slice(0, 10)}</p>
                </div>
              </div>
            )}

            {/* ── Designs & Varieties tab ── */}
            {activeTab === 'designs' && (
              <DesignsTab
                order={order}
                canEdit={canEdit}
                dnames={dnames}
                dcodes={dcodes}
                onDesignChange={handleDesignChange}
                onAddDesign={handleAddDesign}
                onRemoveDesign={handleRemoveDesign}
              />
            )}

            {/* ── Production Stages tab ── */}
            {activeTab === 'stages' && (
              <StagesTab
                order={order}
                canEdit={canEdit}
                onStageChange={handleStageChange}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
