import { useState, useEffect, type FormEvent } from 'react';
import type { VendorOrder, Priority, VendorStatus, VendorOrderType } from '../../types';
import { ALL_STATUSES, STATUS_LABELS, genVendorOrderId } from '../../lib/vendorUtils';

interface Props {
  order: VendorOrder | null;   // null = create mode
  allOrders: VendorOrder[];
  vendors: string[];
  onSave: (order: VendorOrder) => void;
  onClose: () => void;
}

const priorities: { value: Priority; label: string }[] = [
  { value: 'normal',   label: 'Normal' },
  { value: 'urgent',   label: 'Urgent' },
  { value: 'critical', label: 'Critical' },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function VendorModal({ order, allOrders, vendors, onSave, onClose }: Props) {
  const isEdit = order !== null;

  const [vendor, setVendor]           = useState(order?.vendor ?? '');
  const [type, setType]               = useState<VendorOrderType>(order?.type ?? 'karigar');
  const [startDate, setStartDate]     = useState(order?.startDate ?? todayStr());
  const [deliveryDate, setDeliveryDate] = useState(order?.deliveryDate ?? '');
  const [priority, setPriority]       = useState<Priority>(order?.priority ?? 'normal');
  const [status, setStatus]           = useState<VendorStatus>(order?.status ?? 'pending');
  const [notes, setNotes]             = useState(order?.notes ?? '');
  const [acOpen, setAcOpen]           = useState(false);

  const filteredVendors = vendors.filter(
    v => v.toLowerCase().includes(vendor.toLowerCase()) && v !== vendor,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vendor.trim()) return;

    const saved: VendorOrder = {
      ...(order ?? {
        id: 'vo_' + Date.now(),
        orderId: genVendorOrderId(allOrders),
        designs: [],
      }),
      vendor: vendor.trim(),
      type,
      startDate,
      deliveryDate: deliveryDate || undefined,
      priority,
      status,
      notes: notes.trim() || undefined,
    };
    onSave(saved);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Vendor Order' : 'New Vendor Order'}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Vendor name */}
          <div className="relative">
            <label className="block text-xs text-white/60 mb-1">Vendor name *</label>
            <input
              value={vendor}
              onChange={e => { setVendor(e.target.value); setAcOpen(true); }}
              onFocus={() => setAcOpen(true)}
              onBlur={() => setTimeout(() => setAcOpen(false), 150)}
              placeholder="e.g. Ram Cutting Works"
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
            />
            {acOpen && filteredVendors.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-[#1a1750] border border-white/10 rounded-lg shadow-lg max-h-36 overflow-auto">
                {filteredVendors.slice(0, 6).map(v => (
                  <li
                    key={v}
                    onMouseDown={() => { setVendor(v); setAcOpen(false); }}
                    className="px-3 py-2 text-sm text-white hover:bg-white/10 cursor-pointer"
                  >{v}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Order type */}
          <div>
            <label className="block text-xs text-white/60 mb-1">Order type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as VendorOrderType)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#534AB7] text-sm"
            >
              <option value="karigar">🛠️ Karigar</option>
              <option value="pipe">🔩 Pipe</option>
              <option value="plating">🪙 Plating</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Start date *</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#534AB7] text-sm [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Delivery date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#534AB7] text-sm [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Priority + status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as Priority)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#534AB7] text-sm"
              >
                {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as VendorStatus)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#534AB7] text-sm"
              >
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-white/60 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] text-white font-medium text-sm transition-colors"
            >
              {isEdit ? 'Save changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
