import { useState } from 'react';
import type { Order, DesignStage } from '../../types';
import { stageName, stageGroup, GROUP_ORDER, GROUP_LABELS } from '../../lib/designUtils';

type StageStatus = 'pending' | 'done' | 'delayed';

interface Props {
  order: Order;
  canEdit: boolean;
  onStageChange: (designIndex: number, stageIndex: number, patch: Partial<DesignStage>) => void;
}

interface EditingCell {
  di: number;
  si: number;
  field: 'qty' | 'vendor' | 'stageNote' | 'completionDate' | 'days';
  value: string;
}

const STATUS_COLORS: Record<string, string> = {
  done:    'text-green-400 bg-green-500/15',
  delayed: 'text-red-400 bg-red-500/15',
  pending: 'text-white/40 bg-white/5',
};

export default function StagesTab({ order, canEdit, onStageChange }: Props) {
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [doneModal, setDoneModal] = useState<{ di: number; si: number } | null>(null);
  const [doneForm, setDoneForm] = useState({ qty: '', vendor: '', stageNote: '', completionDate: new Date().toISOString().slice(0, 10) });
  const [doneError, setDoneError] = useState('');

  function commitEdit(di: number, si: number, field: EditingCell['field'], value: string) {
    if (field === 'qty' || field === 'days') {
      const n = parseInt(value);
      if (!isNaN(n)) onStageChange(di, si, { [field]: n });
    } else {
      onStageChange(di, si, { [field]: value });
    }
    setEditing(null);
  }

  function handleStatusChange(di: number, si: number, newStatus: string) {
    if (newStatus === 'done') {
      const stage = order.designs[di].stages[si];
      setDoneForm({
        qty: stage.qty ? String(stage.qty) : '',
        vendor: stage.vendor ?? '',
        stageNote: stage.stageNote ?? '',
        completionDate: stage.completionDate ?? new Date().toISOString().slice(0, 10),
      });
      setDoneError('');
      setDoneModal({ di, si });
    } else {
      onStageChange(di, si, { status: newStatus as StageStatus });
    }
  }

  function submitDone() {
    if (!doneModal) return;
    const { di, si } = doneModal;
    const design = order.designs[di];
    const stage = design.stages[si];
    const qty = parseInt(doneForm.qty);

    if (!qty || qty <= 0) { setDoneError('Quantity is required before marking as Done.'); return; }

    // Rejection rule: if qty differs from first done stage in same group, require reason
    const gid = stage.group ?? stageGroup(stage.stageId);
    const groupStages = design.stages.filter(s => (s.group ?? stageGroup(s.stageId)) === gid && s.qty && s.qty > 0);
    if (groupStages.length > 0) {
      const firstQty = groupStages[0].qty!;
      if (Math.abs(firstQty - qty) > 0 && doneForm.stageNote.trim().length < 3) {
        setDoneError(`Qty differs from first stage in group (${firstQty} pcs). A reason is required (min 3 chars).`);
        return;
      }
    }

    onStageChange(di, si, {
      status: 'done',
      qty,
      vendor: doneForm.vendor.trim() || undefined,
      stageNote: doneForm.stageNote.trim() || undefined,
      completionDate: doneForm.completionDate,
    });
    setDoneModal(null);
  }

  return (
    <div className="space-y-5">
      {order.designs.map((design, di) => {
        const groups = GROUP_ORDER.map(gid => ({
          gid,
          stages: design.stages.map((s, si) => ({ s, si }))
            .filter(({ s }) => (s.group ?? stageGroup(s.stageId)) === gid),
        })).filter(g => g.stages.length > 0);

        return (
          <div key={design.id}>
            <p className="text-xs font-semibold text-[#a89fff] mb-2">
              {design.name}{design.code ? ` (${design.code})` : ''}
            </p>

            {groups.map(({ gid, stages }) => (
              <div key={gid} className="mb-3">
                <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{GROUP_LABELS[gid]}</p>
                <div className="space-y-1">
                  {stages.map(({ s, si }) => {
                    const isEditingQty     = editing?.di === di && editing.si === si && editing.field === 'qty';
                    const isEditingVendor  = editing?.di === di && editing.si === si && editing.field === 'vendor';
                    const isEditingNote    = editing?.di === di && editing.si === si && editing.field === 'stageNote';
                    const isEditingDate    = editing?.di === di && editing.si === si && editing.field === 'completionDate';
                    const isEditingDays    = editing?.di === di && editing.si === si && editing.field === 'days';

                    return (
                      <div key={si} className="bg-white/3 border border-white/8 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Status */}
                          {canEdit ? (
                            <select
                              value={s.status}
                              onChange={e => handleStatusChange(di, si, e.target.value)}
                              className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 focus:outline-none focus:border-[#534AB7] text-white"
                            >
                              <option value="pending">Pending</option>
                              <option value="done">Done</option>
                              <option value="delayed">Delayed</option>
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] ?? STATUS_COLORS.pending}`}>
                              {s.status}
                            </span>
                          )}

                          {/* Stage name */}
                          <span className="text-sm text-white flex-1">
                            {stageName(s)}
                            <span className="text-xs text-white/30 ml-1.5">{s.loc}</span>
                          </span>

                          {/* Qty */}
                          {canEdit ? (
                            isEditingQty ? (
                              <input type="number" autoFocus value={editing.value}
                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                onBlur={() => commitEdit(di, si, 'qty', editing!.value)}
                                onKeyDown={e => e.key === 'Enter' && commitEdit(di, si, 'qty', editing!.value)}
                                className="w-16 bg-white/10 border border-[#534AB7] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none" />
                            ) : (
                              <button onClick={() => setEditing({ di, si, field: 'qty', value: String(s.qty ?? '') })}
                                className="text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/30 rounded px-2 py-0.5 transition-colors min-w-[48px] text-center">
                                {s.qty != null ? `${s.qty} pcs` : '— pcs'}
                              </button>
                            )
                          ) : (
                            s.qty != null && <span className="text-xs text-green-400">{s.qty} pcs</span>
                          )}
                        </div>

                        {/* Secondary row: vendor, note, date, days */}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {/* Vendor */}
                          {canEdit ? (
                            isEditingVendor ? (
                              <input autoFocus value={editing.value}
                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                onBlur={() => commitEdit(di, si, 'vendor', editing!.value)}
                                onKeyDown={e => e.key === 'Enter' && commitEdit(di, si, 'vendor', editing!.value)}
                                placeholder="Vendor"
                                className="flex-1 bg-white/10 border border-[#534AB7] rounded px-2 py-0.5 text-white text-xs focus:outline-none" />
                            ) : (
                              <button onClick={() => setEditing({ di, si, field: 'vendor', value: s.vendor ?? '' })}
                                className="text-xs text-white/40 hover:text-white/70 transition-colors">
                                🏭 {s.vendor || 'Add vendor'}
                              </button>
                            )
                          ) : (
                            s.vendor && <span className="text-xs text-white/40">🏭 {s.vendor}</span>
                          )}

                          {/* Completion date */}
                          {canEdit ? (
                            isEditingDate ? (
                              <input type="date" autoFocus value={editing.value}
                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                onBlur={() => commitEdit(di, si, 'completionDate', editing!.value)}
                                className="bg-white/10 border border-[#534AB7] rounded px-2 py-0.5 text-white text-xs focus:outline-none [color-scheme:dark]" />
                            ) : (
                              <button onClick={() => setEditing({ di, si, field: 'completionDate', value: s.completionDate ?? new Date().toISOString().slice(0, 10) })}
                                className="text-xs text-white/40 hover:text-white/70 transition-colors">
                                📅 {s.completionDate || 'Set date'}
                              </button>
                            )
                          ) : (
                            s.completionDate && <span className="text-xs text-white/40">📅 {s.completionDate}</span>
                          )}

                          {/* Days override */}
                          {canEdit && (
                            isEditingDays ? (
                              <input type="number" autoFocus value={editing.value}
                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                onBlur={() => commitEdit(di, si, 'days', editing!.value)}
                                onKeyDown={e => e.key === 'Enter' && commitEdit(di, si, 'days', editing!.value)}
                                className="w-12 bg-white/10 border border-[#534AB7] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none" />
                            ) : (
                              <button onClick={() => setEditing({ di, si, field: 'days', value: String(s.days ?? '') })}
                                className="text-xs text-white/30 hover:text-white/60 transition-colors">
                                ⏱ {s.days != null ? `${s.days}d` : 'Days'}
                              </button>
                            )
                          )}

                          {/* Stage note */}
                          {canEdit ? (
                            isEditingNote ? (
                              <input autoFocus value={editing.value}
                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                onBlur={() => commitEdit(di, si, 'stageNote', editing!.value)}
                                onKeyDown={e => e.key === 'Enter' && commitEdit(di, si, 'stageNote', editing!.value)}
                                placeholder="Note / rejection reason"
                                className="flex-1 bg-white/10 border border-[#534AB7] rounded px-2 py-0.5 text-white text-xs focus:outline-none" />
                            ) : (
                              s.stageNote ? (
                                <button onClick={() => setEditing({ di, si, field: 'stageNote', value: s.stageNote ?? '' })}
                                  className="text-xs text-orange-300 hover:text-orange-200 transition-colors truncate max-w-[200px]">
                                  ⚠ {s.stageNote}
                                </button>
                              ) : (
                                <button onClick={() => setEditing({ di, si, field: 'stageNote', value: '' })}
                                  className="text-xs text-white/20 hover:text-white/50 transition-colors">+ Note</button>
                              )
                            )
                          ) : (
                            s.stageNote && <span className="text-xs text-orange-300 truncate max-w-[200px]">{s.stageNote}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Done modal */}
      {doneModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDoneModal(null); }}>
          <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-3">
            <h3 className="text-white font-semibold">
              Mark as Done — {stageName(order.designs[doneModal.di].stages[doneModal.si])}
            </h3>
            {doneError && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{doneError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-white/50 block mb-1">Quantity (pcs) *</label>
                <input type="number" min="1" value={doneForm.qty}
                  onChange={e => setDoneForm(f => ({ ...f, qty: e.target.value }))}
                  autoFocus placeholder="e.g. 200"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]" />
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">Completion date</label>
                <input type="date" value={doneForm.completionDate}
                  onChange={e => setDoneForm(f => ({ ...f, completionDate: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7] [color-scheme:dark]" />
              </div>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Vendor / Party</label>
              <input value={doneForm.vendor} onChange={e => setDoneForm(f => ({ ...f, vendor: e.target.value }))}
                placeholder="Who did this stage?"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Note / rejection reason</label>
              <input value={doneForm.stageNote} onChange={e => setDoneForm(f => ({ ...f, stageNote: e.target.value }))}
                placeholder="Required if qty differs from group"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7]" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDoneModal(null)} className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={submitDone} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors">Mark Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
