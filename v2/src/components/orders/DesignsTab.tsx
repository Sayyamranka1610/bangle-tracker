import { useState } from 'react';
import type { Order, EmbeddedDesign, DesignVariety, DesignImage, VendorOrder, VendorPipelineFields } from '../../types';
import { uid } from '../../lib/orderUtils';
import { DEFAULT_SIZES } from '../../lib/designUtils';
import { dedupedVendorsOfType, setPipeVendor, setKarigarVendor, setPlatingVendor, toggleReceived, toggleVarietyDone } from '../../lib/coStageUtils';
import PhotoPickerModal from '../designs/PhotoPickerModal';

// Small thumbnail strip + "add from library" button — shared by the design
// header (flat/CNC images) and each variety row (dye-gold images).
function PhotoStrip({ images, canEdit, onAdd, onRemove }: {
  images: DesignImage[];
  canEdit: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {images.map((img, i) => (
        <div key={i} className="relative group flex-shrink-0">
          <img src={img.data} alt={img.name ?? ''} className="w-8 h-8 rounded object-cover border border-white/10" />
          {canEdit && (
            <button onClick={() => onRemove(i)} title="Remove photo"
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
          )}
        </div>
      ))}
      {canEdit && (
        <button onClick={onAdd} title="Add photo from library or upload new"
          className="w-8 h-8 rounded border border-dashed border-white/20 text-white/40 hover:text-white hover:border-white/40 flex items-center justify-center text-sm flex-shrink-0 transition-colors">+</button>
      )}
    </div>
  );
}

interface Props {
  order: Order;
  canEdit: boolean;
  dnames: string[];
  dcodes: string[];
  units: string[];
  vendorOrders: VendorOrder[];
  onDesignChange: (designIndex: number, design: EmbeddedDesign) => void;
  onAddDesign: () => void;
  onRemoveDesign: (designIndex: number) => void;
}

// Compact Pipe/Karigar/Plating assignment cell — mirrors Phase 1's _coVendorCells
// (dropdown of vendors of that type + a "received" toggle), simplified to plain
// React controls rather than the exact spreadsheet-cell markup.
function VendorCell({
  label, vendorField, receivedField, vendors, holder, onChange, canEdit,
}: {
  label: string;
  vendorField: 'pipeVendor' | 'assignedVendor' | 'platingVendor';
  receivedField: 'pipeReceived' | 'karigarReceived' | 'platingReceived';
  vendors: string[];
  holder: VendorPipelineFields;
  onChange: (next: VendorPipelineFields) => void;
  canEdit: boolean;
}) {
  const selected = holder[vendorField] || '';
  const received = !!holder[receivedField];
  const setter = vendorField === 'pipeVendor' ? setPipeVendor : vendorField === 'platingVendor' ? setPlatingVendor : setKarigarVendor;
  const stage = vendorField === 'pipeVendor' ? 'pipe' : vendorField === 'platingVendor' ? 'plating' : 'karigar';

  return (
    <div className="flex flex-col gap-0.5 min-w-[90px]">
      <span className="text-[9px] font-bold uppercase tracking-wide text-white/30">{label}</span>
      <div className="flex items-center gap-1">
        <select
          disabled={!canEdit}
          value={selected === '__own__' ? '__own__' : (vendors.includes(selected) ? selected : selected || '')}
          onChange={e => onChange(setter(holder, e.target.value))}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none focus:border-[#534AB7]"
        >
          <option value="">—</option>
          <option value="__own__">Own</option>
          {selected && selected !== '__own__' && !vendors.includes(selected) && <option value={selected}>{selected}</option>}
          {vendors.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <button type="button" disabled={!canEdit}
          onClick={() => onChange(toggleReceived(holder, stage))}
          title={received ? `Unmark ${label.toLowerCase()} received` : `Mark ${label.toLowerCase()} received`}
          className={`w-5 h-5 shrink-0 rounded text-[10px] font-bold flex items-center justify-center transition-colors ${
            received ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-white/5 text-white/20 border border-white/10'
          }`}
        >✓</button>
      </div>
    </div>
  );
}

export default function DesignsTab({ order, canEdit, dnames, dcodes, units, vendorOrders, onDesignChange, onAddDesign, onRemoveDesign }: Props) {
  const pipeVendors = dedupedVendorsOfType(vendorOrders, 'pipe');
  const karigarVendors = dedupedVendorsOfType(vendorOrders, 'karigar');
  const platingVendors = dedupedVendorsOfType(vendorOrders, 'plating');
  const [editingName, setEditingName] = useState<{ di: number; value: string } | null>(null);
  const [editingCode, setEditingCode] = useState<{ di: number; value: string } | null>(null);
  const [editingVarName, setEditingVarName] = useState<{ di: number; vi: number; value: string } | null>(null);
  // Special-request note editor (retail addition, Aug 2026)
  const [noteEdit, setNoteEdit] = useState<{ di: number; vi: number } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [picker, setPicker] = useState<{ di: number; vi: number | null } | null>(null);

  function attachImage(di: number, vi: number | null, image: DesignImage) {
    const d = order.designs[di];
    if (vi === null) {
      onDesignChange(di, { ...d, images: [...(d.images ?? []), image] });
    } else {
      const varieties = d.varieties!.map((v, i) => i === vi ? { ...v, images: [...(v.images ?? []), image] } : v);
      onDesignChange(di, { ...d, varieties });
    }
  }

  function removeImage(di: number, vi: number | null, index: number) {
    const d = order.designs[di];
    if (vi === null) {
      onDesignChange(di, { ...d, images: (d.images ?? []).filter((_, i) => i !== index) });
    } else {
      const varieties = d.varieties!.map((v, i) => i === vi ? { ...v, images: (v.images ?? []).filter((_, j) => j !== index) } : v);
      onDesignChange(di, { ...d, varieties });
    }
  }

  function commitName(di: number, value: string) {
    const d = order.designs[di];
    onDesignChange(di, { ...d, name: value });
    setEditingName(null);
  }

  function commitCode(di: number, value: string) {
    const d = order.designs[di];
    onDesignChange(di, { ...d, code: value });
    setEditingCode(null);
  }

  function commitVarName(di: number, vi: number, value: string) {
    const d = order.designs[di];
    const varieties = d.varieties!.map((v, i) => i === vi ? { ...v, name: value } : v);
    onDesignChange(di, { ...d, varieties });
    setEditingVarName(null);
  }

  function updateVarietySize(di: number, vi: number, sz: string, val: number) {
    const d = order.designs[di];
    const varieties = d.varieties!.map((v, i) => {
      if (i !== vi) return v;
      const sizes = { ...v.sizes, [sz]: val };
      return { ...v, sizes };
    });
    // Recompute aggregate sizes
    const szKeys = Object.keys(varieties[0]?.sizes ?? {});
    const aggSizes: Record<string, number> = {};
    szKeys.forEach(sz => { aggSizes[sz] = varieties.reduce((a, v) => a + (Number(v.sizes[sz]) || 0), 0); });
    onDesignChange(di, { ...d, varieties, sizes: aggSizes });
  }

  function updateVarietyFields(di: number, vi: number, patch: Partial<DesignVariety>) {
    const d = order.designs[di];
    const varieties = d.varieties!.map((v, i) => i === vi ? { ...v, ...patch } : v);
    onDesignChange(di, { ...d, varieties });
  }

  function addVariety(di: number) {
    const d = order.designs[di];
    const szKeys = d.sizes ? Object.keys(d.sizes) : DEFAULT_SIZES;
    const newV: DesignVariety = {
      id: uid(),
      name: `Variety ${(d.varieties?.length ?? 0) + 1}`,
      sizes: Object.fromEntries(szKeys.map(s => [s, 0])),
      images: [],
      unit: 'pcs',
    };
    onDesignChange(di, { ...d, varieties: [...(d.varieties ?? []), newV] });
  }

  function removeVariety(di: number, vi: number) {
    const d = order.designs[di];
    if ((d.varieties?.length ?? 0) <= 1) return;
    const varieties = d.varieties!.filter((_, i) => i !== vi);
    onDesignChange(di, { ...d, varieties });
  }

  function handleAddDesign() {
    onAddDesign();
  }

  return (
    <div className="space-y-5">
      {order.designs.map((design, di) => {
        const varieties = design.varieties ?? [];
        const sizeKeys = design.sizes ? Object.keys(design.sizes) : DEFAULT_SIZES;

        return (
          <div key={design.id} className="border border-white/10 rounded-xl overflow-hidden">
            {/* Design header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white/3 border-b border-white/10">
              {/* Name */}
              {canEdit && editingName?.di === di ? (
                <input autoFocus value={editingName.value}
                  onChange={e => setEditingName({ di, value: e.target.value })}
                  onBlur={() => commitName(di, editingName.value)}
                  onKeyDown={e => e.key === 'Enter' && commitName(di, editingName.value)}
                  className="flex-1 bg-white/10 border border-[#534AB7] rounded px-2 py-1 text-white text-sm focus:outline-none"
                  list={`dnames-${di}`} />
              ) : (
                <span
                  className={`flex-1 text-white font-semibold ${canEdit ? 'cursor-pointer hover:text-[#a89fff]' : ''}`}
                  onClick={() => canEdit && setEditingName({ di, value: design.name })}
                >
                  {design.name || '(unnamed)'}
                </span>
              )}
              <datalist id={`dnames-${di}`}>{dnames.map(n => <option key={n} value={n} />)}</datalist>

              {/* Code */}
              {canEdit && editingCode?.di === di ? (
                <input autoFocus value={editingCode.value}
                  onChange={e => setEditingCode({ di, value: e.target.value })}
                  onBlur={() => commitCode(di, editingCode.value)}
                  onKeyDown={e => e.key === 'Enter' && commitCode(di, editingCode.value)}
                  className="w-24 bg-white/10 border border-[#534AB7] rounded px-2 py-1 text-white text-xs focus:outline-none"
                  list={`dcodes-${di}`} />
              ) : (
                <span
                  className={`text-xs text-white/40 font-mono ${canEdit ? 'cursor-pointer hover:text-white/70' : ''}`}
                  onClick={() => canEdit && setEditingCode({ di, value: design.code ?? '' })}
                >
                  {design.code || (canEdit ? 'Add code' : '—')}
                </span>
              )}
              <datalist id={`dcodes-${di}`}>{dcodes.map(c => <option key={c} value={c} />)}</datalist>

              {canEdit && order.designs.length > 1 && (
                <button onClick={() => onRemoveDesign(di)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors ml-auto">Remove</button>
              )}
            </div>

            {/* Design-level photos (flat/CNC rows use these; dye-gold rows use per-variety photos below) */}
            <div className="px-4 py-2 border-b border-white/5">
              <PhotoStrip
                images={design.images ?? []}
                canEdit={canEdit}
                onAdd={() => setPicker({ di, vi: null })}
                onRemove={i => removeImage(di, null, i)}
              />
            </div>

            {/* Size / variety grid */}
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left pr-3 py-1.5 text-white/40 font-normal">Variety</th>
                    <th className="text-left px-2 py-1.5 text-white/30 font-normal">Photo</th>
                    {sizeKeys.map(sz => (
                      <th key={sz} className="text-center px-2 py-1.5 text-white/40 font-normal">{sz}</th>
                    ))}
                    <th className="text-center pl-2 py-1.5 text-[#a89fff] font-normal">Total</th>
                    <th className="text-center px-1 py-1.5 text-white/30 font-normal">Unit</th>
                    <th className="text-center px-1 py-1.5 text-white/30 font-normal" title="Rate per unit — used to total up the order value">Rate (₹)</th>
                    <th className="text-center px-2 py-1.5 text-white/30 font-normal">Pipe</th>
                    <th className="text-center px-2 py-1.5 text-white/30 font-normal">Karigar</th>
                    <th className="text-center px-2 py-1.5 text-white/30 font-normal">Plating</th>
                    <th className="text-center px-1 py-1.5 text-white/30 font-normal" title="Special request for this row">Note</th>
                    <th className="text-center px-1 py-1.5 text-white/30 font-normal">Done</th>
                    {canEdit && <th className="w-6" />}
                  </tr>
                </thead>
                <tbody>
                  {varieties.map((v, vi) => {
                    const total = sizeKeys.reduce((a, sz) => a + (Number(v.sizes?.[sz]) || 0), 0);
                    const isEditingName = editingVarName?.di === di && editingVarName.vi === vi;

                    return (
                      <tr key={v.id} className="border-b border-white/5">
                        <td className="pr-3 py-1.5">
                          {canEdit && isEditingName ? (
                            <input autoFocus value={editingVarName.value}
                              onChange={e => setEditingVarName({ di, vi, value: e.target.value })}
                              onBlur={() => commitVarName(di, vi, editingVarName.value)}
                              onKeyDown={e => e.key === 'Enter' && commitVarName(di, vi, editingVarName.value)}
                              className="w-24 bg-white/10 border border-[#534AB7] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none" />
                          ) : (
                            <span
                              className={`text-white/70 ${canEdit ? 'cursor-pointer hover:text-white' : ''}`}
                              onClick={() => canEdit && setEditingVarName({ di, vi, value: v.name })}
                            >{v.name}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <PhotoStrip
                            images={v.images ?? []}
                            canEdit={canEdit}
                            onAdd={() => setPicker({ di, vi })}
                            onRemove={i => removeImage(di, vi, i)}
                          />
                        </td>
                        {sizeKeys.map(sz => (
                          <td key={sz} className="text-center px-1 py-1.5">
                            {canEdit ? (
                              <input type="number" min="0"
                                value={v.sizes?.[sz] || ''}
                                onChange={e => updateVarietySize(di, vi, sz, Number(e.target.value))}
                                className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-xs text-center focus:outline-none focus:border-[#534AB7]"
                                placeholder="0" />
                            ) : (
                              <span className="text-white/70">{Number(v.sizes?.[sz]) || 0}</span>
                            )}
                          </td>
                        ))}
                        <td className="text-center pl-2 py-1.5 font-semibold text-[#a89fff]">{total}</td>
                        <td className="px-1 py-1.5">
                          {canEdit ? (
                            <select
                              value={v.unit || ''}
                              onChange={e => updateVarietyFields(di, vi, { unit: e.target.value })}
                              className="w-16 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[11px] focus:outline-none focus:border-[#534AB7]"
                            >
                              <option value="">— not set —</option>
                              {units.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          ) : (
                            <span className={v.unit ? 'text-white/70' : 'text-red-300/70'}>{v.unit || 'not set'}</span>
                          )}
                        </td>
                        <td className="px-1 py-1.5">
                          {canEdit ? (
                            <input type="number" min="0" step="0.01" placeholder="₹"
                              value={v.rate ?? ''}
                              onChange={e => updateVarietyFields(di, vi, { rate: e.target.value === '' ? undefined : Number(e.target.value) })}
                              className="w-16 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[11px] text-right focus:outline-none focus:border-[#534AB7]" />
                          ) : (
                            <span className="text-white/70">{v.rate ? `₹${v.rate}` : '—'}</span>
                          )}
                        </td>
                        <td className="px-1 py-1.5">
                          <VendorCell label="Pipe" vendorField="pipeVendor" receivedField="pipeReceived"
                            vendors={pipeVendors} holder={v} canEdit={canEdit}
                            onChange={patch => updateVarietyFields(di, vi, patch)} />
                        </td>
                        <td className="px-1 py-1.5">
                          <VendorCell label="Karigar" vendorField="assignedVendor" receivedField="karigarReceived"
                            vendors={karigarVendors} holder={v} canEdit={canEdit}
                            onChange={patch => updateVarietyFields(di, vi, patch)} />
                        </td>
                        <td className="px-1 py-1.5">
                          <VendorCell label="Plating" vendorField="platingVendor" receivedField="platingReceived"
                            vendors={platingVendors} holder={v} canEdit={canEdit}
                            onChange={patch => updateVarietyFields(di, vi, patch)} />
                        </td>
                        <td className="text-center px-1 py-1.5">
                          <button
                            onClick={() => {
                              const open = noteEdit?.di === di && noteEdit.vi === vi;
                              if (open) { setNoteEdit(null); return; }
                              setNoteEdit({ di, vi });
                              setNoteDraft(v.note ?? '');
                            }}
                            title={v.note || 'Add a special request for this row'}
                            className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                              v.note
                                ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                                : 'text-white/20 hover:text-white/60 border border-transparent'
                            }`}
                          >{v.note ? '📌' : '+'}</button>
                        </td>
                        <td className="text-center px-1 py-1.5">
                          <button
                            disabled={!canEdit}
                            onClick={() => updateVarietyFields(di, vi, toggleVarietyDone(v))}
                            title={v.done ? 'Undo dispatched' : 'Mark this variety dispatched'}
                            className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center mx-auto transition-colors ${
                              v.done ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-white/5 text-white/20 border border-white/10'
                            }`}
                          >✓</button>
                        </td>
                        {canEdit && (
                          <td className="pl-1 py-1.5">
                            {varieties.length > 1 && (
                              <button onClick={() => removeVariety(di, vi)}
                                className="text-white/20 hover:text-red-400 transition-colors">×</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {/* Special-request note editor — opens under the row it belongs to */}
                  {noteEdit?.di === di && (
                    <tr className="bg-amber-400/5">
                      <td colSpan={99} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <span className="text-amber-300 text-xs pt-1.5">📌</span>
                          <div className="flex-1">
                            <label className="block text-[10px] uppercase tracking-wide text-amber-300/70 mb-1">
                              Special request — {varieties[noteEdit.vi]?.name || 'this row'}
                            </label>
                            {canEdit ? (
                              <textarea
                                autoFocus
                                rows={2}
                                value={noteDraft}
                                onChange={e => setNoteDraft(e.target.value)}
                                placeholder="e.g. wants slightly lighter weight — confirmed on call"
                                className="w-full bg-white/5 border border-amber-400/30 rounded-lg px-3 py-2 text-white placeholder-white/25 text-xs focus:outline-none focus:border-amber-400"
                              />
                            ) : (
                              <p className="text-xs text-white/70">{varieties[noteEdit.vi]?.note || '—'}</p>
                            )}
                            {canEdit && (
                              <div className="flex gap-2 mt-1.5">
                                <button
                                  onClick={() => {
                                    const vi = noteEdit.vi;
                                    updateVarietyFields(di, vi, { ...varieties[vi], note: noteDraft.trim() || undefined });
                                    setNoteEdit(null);
                                  }}
                                  className="px-2.5 py-1 rounded bg-[#534AB7] hover:bg-[#6259c8] text-white text-xs font-medium">Save note</button>
                                <button onClick={() => setNoteEdit(null)}
                                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 text-xs">Cancel</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Totals row */}
                  <tr className="border-t border-white/10">
                    <td className="pr-3 py-1.5 text-white/30 text-xs">Total</td>
                    <td />
                    {sizeKeys.map(sz => {
                      const t = varieties.reduce((a, v) => a + (Number(v.sizes?.[sz]) || 0), 0);
                      return <td key={sz} className="text-center px-2 py-1.5 font-semibold text-white">{t}</td>;
                    })}
                    <td className="text-center pl-2 py-1.5 font-bold text-[#a89fff]">
                      {varieties.reduce((a, v) => a + sizeKeys.reduce((b, sz) => b + (Number(v.sizes?.[sz]) || 0), 0), 0)}
                    </td>
                    <td /><td /><td /><td /><td /><td />
                    {canEdit && <td />}
                  </tr>
                </tbody>
              </table>

              {canEdit && (
                <button onClick={() => addVariety(di)}
                  className="mt-2 text-xs text-[#a89fff] hover:text-white transition-colors">
                  + Add variety
                </button>
              )}
            </div>
          </div>
        );
      })}

      {canEdit && (
        <button onClick={handleAddDesign}
          className="w-full py-2 border border-dashed border-white/20 rounded-xl text-white/40 hover:text-white hover:border-white/40 text-sm transition-colors">
          + Add design
        </button>
      )}

      {picker && (
        <PhotoPickerModal
          designCode={order.designs[picker.di]?.code ?? ''}
          onAttach={image => attachImage(picker.di, picker.vi, image)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
