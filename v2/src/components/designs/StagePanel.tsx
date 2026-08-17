import { useState } from 'react';
import type { EmbeddedDesign, DesignStage, Order, StageStatus } from '../../types';
import { stageName, stageGroup, getTemplate, GROUP_ORDER, GROUP_LABELS, STATUS_CONFIG } from '../../lib/designUtils';

interface Props {
  design: EmbeddedDesign;
  order: Order;  // used for priority-aware effDays in future
  canEdit: boolean;
  onStageUpdate: (stageIndex: number, patch: Partial<DesignStage>) => void;
}

interface EditingStage {
  index: number;
  qty: string;
  stageNote: string;
  completionDate: string;
  vendor: string;
}

export default function StagePanel({ design, order: _order, canEdit, onStageUpdate }: Props) {
  const [editing, setEditing] = useState<EditingStage | null>(null);
  const [error, setError] = useState('');

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function openEdit(si: number) {
    const st = design.stages[si];
    setEditing({
      index: si,
      qty: String(st.qty ?? ''),
      stageNote: st.stageNote ?? '',
      completionDate: st.completionDate ?? todayStr(),
      vendor: st.vendor ?? '',
    });
    setError('');
  }

  function handleMarkDone() {
    if (!editing) return;
    const si = editing.index;
    const stage = design.stages[si];
    const qty = parseInt(editing.qty);

    if (!qty || qty <= 0) {
      setError('Quantity is required before marking as Done.');
      return;
    }

    // Check if qty differs from first stage in same group — require reason
    const gid = stageGroup(stage.stageId);
    const groupStages = design.stages
      .filter(s => stageGroup(s.stageId) === gid && s.qty != null && s.qty > 0);
    if (groupStages.length > 0) {
      const firstQty = groupStages[0].qty!;
      const rejection = firstQty - qty;
      if (Math.abs(rejection) > 0 && editing.stageNote.trim().length < 3) {
        setError(`Quantities differ from first stage (${firstQty} pcs vs ${qty} pcs). A reason is required (min 3 characters).`);
        return;
      }
    }

    onStageUpdate(si, {
      status: 'done',
      qty,
      completionDate: editing.completionDate,
      stageNote: editing.stageNote.trim() || undefined,
      vendor: editing.vendor.trim() || undefined,
    });
    setEditing(null);
    setError('');
  }

  function handleSetStatus(si: number, status: StageStatus) {
    if (status === 'done') {
      openEdit(si);
    } else {
      onStageUpdate(si, { status });
    }
  }

  // Group stages
  const groups = GROUP_ORDER.map(gid => ({
    gid,
    stages: design.stages.map((s, i) => ({ s, i })).filter(({ s }) => stageGroup(s.stageId) === gid),
  })).filter(g => g.stages.length > 0);

  return (
    <div className="mt-3 space-y-4">
      {groups.map(({ gid, stages }) => (
        <div key={gid}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-2">
            {GROUP_LABELS[gid]}
          </p>
          <div className="space-y-1">
            {stages.map(({ s, i }) => {
              const tmpl = getTemplate(s.stageId);
              const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending;
              const isEditingThis = editing?.index === i;

              return (
                <div key={s.stageId ?? i}>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isEditingThis ? 'bg-white/10' : 'bg-white/5 hover:bg-white/8'}`}>
                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />

                    {/* Stage name + meta */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white">{stageName(s.stageId)}</span>
                      {tmpl && (
                        <span className="text-xs text-white/30 ml-2">{tmpl.loc}</span>
                      )}
                      {s.status === 'done' && s.qty != null && (
                        <span className="text-xs text-green-400 ml-2">{s.qty} pcs</span>
                      )}
                      {s.completionDate && (
                        <span className="text-xs text-white/30 ml-2">✓ {s.completionDate}</span>
                      )}
                      {s.stageNote && (
                        <p className="text-xs text-orange-300 mt-0.5 truncate">{s.stageNote}</p>
                      )}
                    </div>

                    {/* Status badge / action */}
                    {canEdit ? (
                      <select
                        value={s.status}
                        onChange={e => handleSetStatus(i, e.target.value as StageStatus)}
                        className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white/80 focus:outline-none focus:border-[#534AB7]"
                      >
                        <option value="pending">Pending</option>
                        <option value="done">Done</option>
                        <option value="delayed">Delayed</option>
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.text} ${cfg.bg}`}>
                        {cfg.label}
                      </span>
                    )}
                  </div>

                  {/* Inline done form */}
                  {isEditingThis && (
                    <div className="mx-3 mb-2 p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
                      {error && <p className="text-xs text-red-400">{error}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-white/50 block mb-0.5">Quantity (pcs) *</label>
                          <input
                            type="number"
                            min="1"
                            value={editing.qty}
                            onChange={e => setEditing({ ...editing, qty: e.target.value })}
                            placeholder="e.g. 200"
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#534AB7]"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/50 block mb-0.5">Completion date</label>
                          <input
                            type="date"
                            value={editing.completionDate}
                            onChange={e => setEditing({ ...editing, completionDate: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#534AB7] [color-scheme:dark]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 block mb-0.5">Party / vendor</label>
                        <input
                          type="text"
                          value={editing.vendor}
                          onChange={e => setEditing({ ...editing, vendor: e.target.value })}
                          placeholder="Who did this stage?"
                          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#534AB7]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/50 block mb-0.5">Note / rejection reason</label>
                        <input
                          type="text"
                          value={editing.stageNote}
                          onChange={e => setEditing({ ...editing, stageNote: e.target.value })}
                          placeholder="e.g. 10 pcs rejected"
                          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#534AB7]"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => { setEditing(null); setError(''); }}
                          className="flex-1 py-1.5 text-xs rounded border border-white/10 text-white/60 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleMarkDone}
                          className="flex-1 py-1.5 text-xs rounded bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
                        >
                          Mark as Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
