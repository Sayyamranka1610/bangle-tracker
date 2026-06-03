import { useState, useEffect, useCallback, type FormEvent } from 'react';
import type { Order, EmbeddedDesign, DesignVariety, Priority, BangleType } from '../../types';
import { uid } from '../../lib/orderUtils';
import { DEFAULT_SIZES, makeStageFresh } from '../../lib/designUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModalVariety {
  id: string;
  name: string;
  sizes: Record<string, number>;  // size key → qty
}

interface ModalDesign {
  id: string;
  name: string;
  code: string;
  sizes: string[];          // selected size keys
  varieties: ModalVariety[];
}

interface Props {
  order: Order | null;       // null = create mode
  clients: string[];
  dnames: string[];          // design name autocomplete
  dcodes: string[];          // design code autocomplete
  onSave: (order: Order) => void;
  onClose: () => void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'normal',   label: 'Normal' },
  { value: 'urgent',   label: 'Urgent' },
  { value: 'critical', label: '🔴 Critical' },
];

const BANGLE_TYPES: { value: BangleType; label: string }[] = [
  { value: 'dye_gold', label: 'Dye Gold' },
  { value: 'cnc',      label: 'CNC' },
  { value: 'both',     label: 'Both' },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }

function emptyVariety(sizes: string[], name: string): ModalVariety {
  return { id: uid(), name, sizes: Object.fromEntries(sizes.map(s => [s, 0])) };
}

function emptyDesign(): ModalDesign {
  const sizes = [...DEFAULT_SIZES];
  return {
    id: uid(),
    name: '',
    code: '',
    sizes,
    varieties: [emptyVariety(sizes, 'Variety 1')],
  };
}

// Build EmbeddedDesign from modal state — mirrors Phase 1 buildDesignFromModal
function buildEmbeddedDesign(md: ModalDesign): EmbeddedDesign {
  const szObj: Record<string, number> = Object.fromEntries(md.sizes.map(s => [s, 0]));
  md.varieties.forEach(v => md.sizes.forEach(sz => {
    szObj[sz] = (szObj[sz] ?? 0) + (Number(v.sizes[sz]) || 0);
  }));
  const varieties: DesignVariety[] = md.varieties.map(v => ({
    id: v.id,
    name: v.name,
    sizes: Object.fromEntries(md.sizes.map(s => [s, Number(v.sizes[s]) || 0])),
    images: [],
    unit: 'pcs',
  }));
  return {
    id: md.id,
    name: md.name,
    code: md.code || undefined,
    sizes: szObj,
    sizesLocked: true,
    images: [],
    varieties,
    stages: makeStageFresh(),
  };
}

// ─── Variety row component ────────────────────────────────────────────────────

function VarietyRow({
  variety, sizes, onChange, onRemove, canRemove,
}: {
  variety: ModalVariety;
  sizes: string[];
  onChange: (updated: ModalVariety) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const total = sizes.reduce((a, s) => a + (Number(variety.sizes[s]) || 0), 0);

  return (
    <tr className="border-b border-white/5">
      {/* Variety name */}
      <td className="pr-2 py-1.5">
        <input
          value={variety.name}
          onChange={e => onChange({ ...variety, name: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#534AB7]"
          placeholder="Variety name"
        />
      </td>
      {/* One cell per size */}
      {sizes.map(sz => (
        <td key={sz} className="px-1 py-1.5">
          <input
            type="number"
            min="0"
            value={variety.sizes[sz] || ''}
            onChange={e => onChange({ ...variety, sizes: { ...variety.sizes, [sz]: Number(e.target.value) || 0 } })}
            className="w-14 bg-white/5 border border-white/10 rounded px-1.5 py-1 text-white text-xs text-center focus:outline-none focus:border-[#534AB7]"
            placeholder="0"
          />
        </td>
      ))}
      {/* Total */}
      <td className="pl-2 py-1.5 text-center text-xs font-semibold text-[#a89fff] w-10">{total}</td>
      {/* Remove */}
      <td className="pl-1 py-1.5 w-6">
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-white/20 hover:text-red-400 transition-colors">×</button>
        )}
      </td>
    </tr>
  );
}

// ─── Single design section ────────────────────────────────────────────────────

function DesignSection({
  design, index, totalDesigns, dnames, dcodes,
  onChange, onRemove,
}: {
  design: ModalDesign;
  index: number;
  totalDesigns: number;
  dnames: string[];
  dcodes: string[];
  onChange: (d: ModalDesign) => void;
  onRemove: () => void;
}) {
  const [dnameAc, setDnameAc] = useState(false);
  const [dcodeAc, setDcodeAc] = useState(false);

  const filteredDnames = dnames.filter(n => n.toLowerCase().includes(design.name.toLowerCase()) && n !== design.name);
  const filteredDcodes = dcodes.filter(c => c.toLowerCase().includes(design.code.toLowerCase()) && c !== design.code);

  function toggleSize(sz: string) {
    const next = design.sizes.includes(sz)
      ? design.sizes.filter(s => s !== sz)
      : [...design.sizes, sz];
    if (next.length === 0) return; // must keep at least one
    // Sync varieties
    const updatedVarieties = design.varieties.map(v => ({
      ...v,
      sizes: Object.fromEntries(next.map(s => [s, v.sizes[s] ?? 0])),
    }));
    onChange({ ...design, sizes: next, varieties: updatedVarieties });
  }

  function addVariety() {
    const newV = emptyVariety(design.sizes, `Variety ${design.varieties.length + 1}`);
    onChange({ ...design, varieties: [...design.varieties, newV] });
  }

  function updateVariety(i: number, v: ModalVariety) {
    onChange({ ...design, varieties: design.varieties.map((x, j) => j === i ? v : x) });
  }

  function removeVariety(i: number) {
    onChange({ ...design, varieties: design.varieties.filter((_, j) => j !== i) });
  }

  const grandTotal = design.varieties.reduce(
    (a, v) => a + design.sizes.reduce((b, s) => b + (Number(v.sizes[s]) || 0), 0), 0,
  );

  return (
    <div className="border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/80">
          Design {index + 1}
        </h3>
        {totalDesigns > 1 && (
          <button type="button" onClick={onRemove}
            className="text-xs text-red-400/70 hover:text-red-400 transition-colors">Remove</button>
        )}
      </div>

      {/* Name + Code */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-xs text-white/50 mb-1">Design name *</label>
          <input
            value={design.name}
            onChange={e => { onChange({ ...design, name: e.target.value }); setDnameAc(true); }}
            onFocus={() => setDnameAc(true)}
            onBlur={() => setTimeout(() => setDnameAc(false), 150)}
            placeholder="e.g. Floral Bangle"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]"
          />
          {dnameAc && filteredDnames.length > 0 && (
            <ul className="absolute z-20 w-full mt-1 bg-[#1a1750] border border-white/10 rounded-lg shadow-xl max-h-32 overflow-auto">
              {filteredDnames.slice(0, 6).map(n => (
                <li key={n} onMouseDown={() => { onChange({ ...design, name: n }); setDnameAc(false); }}
                  className="px-3 py-1.5 text-sm text-white hover:bg-white/10 cursor-pointer">{n}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="relative">
          <label className="block text-xs text-white/50 mb-1">Design code</label>
          <input
            value={design.code}
            onChange={e => { onChange({ ...design, code: e.target.value }); setDcodeAc(true); }}
            onFocus={() => setDcodeAc(true)}
            onBlur={() => setTimeout(() => setDcodeAc(false), 150)}
            placeholder="e.g. DG-001"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]"
          />
          {dcodeAc && filteredDcodes.length > 0 && (
            <ul className="absolute z-20 w-full mt-1 bg-[#1a1750] border border-white/10 rounded-lg shadow-xl max-h-32 overflow-auto">
              {filteredDcodes.slice(0, 6).map(c => (
                <li key={c} onMouseDown={() => { onChange({ ...design, code: c }); setDcodeAc(false); }}
                  className="px-3 py-1.5 text-sm text-white hover:bg-white/10 cursor-pointer">{c}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Size selector */}
      <div>
        <label className="block text-xs text-white/50 mb-1.5">Sizes</label>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_SIZES.map(sz => (
            <button
              key={sz} type="button"
              onClick={() => toggleSize(sz)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                design.sizes.includes(sz)
                  ? 'bg-[#534AB7] border-[#534AB7] text-white'
                  : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'
              }`}
            >{sz}</button>
          ))}
        </div>
      </div>

      {/* Varieties grid */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-white/50">Quantities per variety</label>
          {grandTotal > 0 && (
            <span className="text-xs text-[#a89fff]">Total: {grandTotal} pcs</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left pr-2 py-1 text-white/30 font-normal">Variety</th>
                {design.sizes.map(sz => (
                  <th key={sz} className="text-center px-1 py-1 text-white/40 font-normal w-14">{sz}</th>
                ))}
                <th className="text-center pl-2 py-1 text-[#a89fff] font-normal w-10">Total</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {design.varieties.map((v, i) => (
                <VarietyRow
                  key={v.id}
                  variety={v}
                  sizes={design.sizes}
                  onChange={updated => updateVariety(i, updated)}
                  onRemove={() => removeVariety(i)}
                  canRemove={design.varieties.length > 1}
                />
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addVariety}
          className="mt-2 text-xs text-[#a89fff] hover:text-white transition-colors">
          + Add variety
        </button>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function OrderModal({ order, clients, dnames, dcodes, onSave, onClose }: Props) {
  const isEdit = order !== null;

  // Order-level fields
  const [client, setClient]     = useState(order?.client ?? '');
  const [startDate, setStartDate] = useState(order?.startDate ?? todayStr());
  const [priority, setPriority] = useState<Priority>(order?.priority ?? 'normal');
  const [bangleType, setBangleType] = useState<BangleType>(order?.bangleType ?? 'dye_gold');
  const [notes, setNotes]       = useState(order?.notes ?? '');
  const [clientAc, setClientAc] = useState(false);
  const [error, setError]       = useState('');

  // Designs state — start with one empty design for new orders,
  // or convert existing designs to modal state for edits
  const [designs, setDesigns]   = useState<ModalDesign[]>(() => {
    if (!isEdit || !order?.designs?.length) return [emptyDesign()];
    return order.designs.map(d => ({
      id: d.id,
      name: d.name,
      code: d.code ?? '',
      sizes: d.sizes ? Object.keys(d.sizes) : [...DEFAULT_SIZES],
      varieties: (d.varieties ?? []).map(v => ({
        id: v.id,
        name: v.name,
        sizes: Object.fromEntries(Object.entries(v.sizes).map(([k, val]) => [k, Number(val)])),
      })),
    }));
  });

  const filteredClients = clients.filter(c => c.toLowerCase().includes(client.toLowerCase()) && c !== client);

  const addDesign = useCallback(() => setDesigns(prev => [...prev, emptyDesign()]), []);
  const removeDesign = useCallback((i: number) => setDesigns(prev => prev.filter((_, j) => j !== i)), []);
  const updateDesign = useCallback((i: number, d: ModalDesign) => setDesigns(prev => prev.map((x, j) => j === i ? d : x)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!client.trim())    { setError('Client name is required.'); return; }
    if (!startDate)        { setError('Start date is required.'); return; }
    if (designs.some(d => !d.name.trim())) { setError('All designs need a name.'); return; }

    const embeddedDesigns = designs.map(buildEmbeddedDesign);

    const saved: Order = {
      ...(order ?? {
        id: uid(),
        orderId: '',      // renumberOrders() assigns ORD-NNN
        createdAt: new Date().toISOString(),
      }),
      client: client.trim(),
      startDate,
      priority,
      bangleType,
      notes: notes.trim() || undefined,
      designs: embeddedDesigns,
    };
    onSave(saved);
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl my-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#1a1750] rounded-t-2xl z-10">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit Order' : 'New Order'}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

          {/* ── Order Info ── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Order Details</p>

            {/* Client */}
            <div className="relative">
              <label className="block text-xs text-white/60 mb-1">Client name *</label>
              <input
                value={client}
                onChange={e => { setClient(e.target.value); setClientAc(true); }}
                onFocus={() => setClientAc(true)}
                onBlur={() => setTimeout(() => setClientAc(false), 150)}
                placeholder="e.g. Sharma Jewellers"
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]"
              />
              {clientAc && filteredClients.length > 0 && (
                <ul className="absolute z-20 w-full mt-1 bg-[#1a1750] border border-white/10 rounded-lg shadow-xl max-h-36 overflow-auto">
                  {filteredClients.slice(0, 8).map(c => (
                    <li key={c} onMouseDown={() => { setClient(c); setClientAc(false); }}
                      className="px-3 py-2 text-sm text-white hover:bg-white/10 cursor-pointer">{c}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Date + Priority + Type */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-white/60 mb-1">Start date *</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7] [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]">
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Bangle type</label>
                <select value={bangleType} onChange={e => setBangleType(e.target.value as BangleType)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]">
                  {BANGLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-white/60 mb-1">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-[#534AB7]" />
            </div>
          </div>

          {/* ── Designs ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Designs ({designs.length})
            </p>

            {designs.map((d, i) => (
              <DesignSection
                key={d.id}
                design={d}
                index={i}
                totalDesigns={designs.length}
                dnames={dnames}
                dcodes={dcodes}
                onChange={updated => updateDesign(i, updated)}
                onRemove={() => removeDesign(i)}
              />
            ))}

            <button type="button" onClick={addDesign}
              className="w-full py-2 border border-dashed border-white/20 rounded-xl text-white/40 hover:text-white hover:border-white/40 text-sm transition-colors">
              + Add another design
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 sticky bottom-0 pb-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-2 flex-1 py-2.5 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] text-white font-medium text-sm transition-colors">
              {isEdit ? 'Save changes' : 'Create order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
