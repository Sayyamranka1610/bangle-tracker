import { useState } from 'react';
import type { Order, EmbeddedDesign, DesignVariety } from '../../types';
import { uid } from '../../lib/orderUtils';
import { DEFAULT_SIZES } from '../../lib/designUtils';

interface Props {
  order: Order;
  canEdit: boolean;
  dnames: string[];
  dcodes: string[];
  onDesignChange: (designIndex: number, design: EmbeddedDesign) => void;
  onAddDesign: () => void;
  onRemoveDesign: (designIndex: number) => void;
}

export default function DesignsTab({ order, canEdit, dnames, dcodes, onDesignChange, onAddDesign, onRemoveDesign }: Props) {
  const [editingName, setEditingName] = useState<{ di: number; value: string } | null>(null);
  const [editingCode, setEditingCode] = useState<{ di: number; value: string } | null>(null);
  const [editingVarName, setEditingVarName] = useState<{ di: number; vi: number; value: string } | null>(null);

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

            {/* Size / variety grid */}
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left pr-3 py-1.5 text-white/40 font-normal">Variety</th>
                    {sizeKeys.map(sz => (
                      <th key={sz} className="text-center px-2 py-1.5 text-white/40 font-normal">{sz}</th>
                    ))}
                    <th className="text-center pl-2 py-1.5 text-[#a89fff] font-normal">Total</th>
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
                  {/* Totals row */}
                  <tr className="border-t border-white/10">
                    <td className="pr-3 py-1.5 text-white/30 text-xs">Total</td>
                    {sizeKeys.map(sz => {
                      const t = varieties.reduce((a, v) => a + (Number(v.sizes?.[sz]) || 0), 0);
                      return <td key={sz} className="text-center px-2 py-1.5 font-semibold text-white">{t}</td>;
                    })}
                    <td className="text-center pl-2 py-1.5 font-bold text-[#a89fff]">
                      {varieties.reduce((a, v) => a + sizeKeys.reduce((b, sz) => b + (Number(v.sizes?.[sz]) || 0), 0), 0)}
                    </td>
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
    </div>
  );
}
