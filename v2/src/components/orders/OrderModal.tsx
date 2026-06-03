import { useState, useEffect, type FormEvent } from 'react';
import type { Order, Priority, BangleType } from '../../types';
import { uid } from '../../lib/orderUtils';

interface Props {
  order: Order | null;  // null = create mode
  clients: string[];
  onSave: (order: Order) => void;
  onClose: () => void;
}

const priorities: { value: Priority; label: string }[] = [
  { value: 'normal',   label: 'Normal' },
  { value: 'urgent',   label: 'Urgent' },
  { value: 'critical', label: 'Critical' },
];

const bangleTypes: { value: BangleType; label: string }[] = [
  { value: 'dye_gold', label: 'Dye Gold' },
  { value: 'cnc',      label: 'CNC' },
  { value: 'both',     label: 'Both' },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function OrderModal({ order, clients, onSave, onClose }: Props) {
  const isEdit = order !== null;

  const [client, setClient] = useState(order?.client ?? '');
  const [startDate, setStartDate] = useState(order?.startDate ?? todayStr());
  const [priority, setPriority] = useState<Priority>(order?.priority ?? 'normal');
  const [bangleType, setBangleType] = useState<BangleType>(order?.bangleType ?? 'dye_gold');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [acOpen, setAcOpen] = useState(false);

  const filteredClients = clients.filter(c => c.toLowerCase().includes(client.toLowerCase()) && c !== client);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!client.trim()) return;

    const saved: Order = {
      ...(order ?? {
        id: uid(),
        orderId: '',           // renumberOrders() will assign
        createdAt: new Date().toISOString(),
        designs: [],
      }),
      client: client.trim(),
      startDate,
      priority,
      bangleType,
      notes: notes.trim() || undefined,
    };
    onSave(saved);
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Order' : 'New Order'}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Client name with autocomplete */}
          <div className="relative">
            <label className="block text-xs text-white/60 mb-1">Client name *</label>
            <input
              value={client}
              onChange={e => { setClient(e.target.value); setAcOpen(true); }}
              onFocus={() => setAcOpen(true)}
              onBlur={() => setTimeout(() => setAcOpen(false), 150)}
              placeholder="e.g. Sharma Jewellers"
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
            />
            {acOpen && filteredClients.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-[#1a1750] border border-white/10 rounded-lg shadow-lg max-h-40 overflow-auto">
                {filteredClients.slice(0, 8).map(c => (
                  <li
                    key={c}
                    onMouseDown={() => { setClient(c); setAcOpen(false); }}
                    className="px-3 py-2 text-sm text-white hover:bg-white/10 cursor-pointer"
                  >{c}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Start date */}
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

          {/* Priority + bangle type side by side */}
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
              <label className="block text-xs text-white/60 mb-1">Bangle type</label>
              <select
                value={bangleType}
                onChange={e => setBangleType(e.target.value as BangleType)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#534AB7] text-sm"
              >
                {bangleTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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

          {/* Actions */}
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
              {isEdit ? 'Save changes' : 'Create order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
