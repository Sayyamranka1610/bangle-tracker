import { useState } from 'react';
import { FU_REASONS, type FollowUpItem, type FuReason } from '../../lib/followUpUtils';

interface Props {
  item: FollowUpItem;
  onSubmit: (reason: FuReason, detail: string) => void;
  onClose: () => void;
}

// Ports Phase 1's openFollowUpResponseModal()/_fuResponseModalHtml() — the
// mandatory "Kya Bola?" response. Replaces a blank "done" click: a team
// member must pick what was actually said (or "Others" + write it) before a
// follow-up can be marked handled.
export default function FollowUpResponseModal({ item, onSubmit, onClose }: Props) {
  const [selected, setSelected] = useState<FuReason | null>(null);
  const [detail, setDetail] = useState('');

  const canSubmit = selected && (selected.kind === 'instruction' || detail.trim().length > 0);

  function handleSelect(r: FuReason) {
    setSelected(r);
    setDetail('');
  }

  function handleSubmit() {
    if (!selected || !canSubmit) return;
    onSubmit(selected, detail.trim());
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-md p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-[#534AB7]/20 text-[#a89fff] flex items-center justify-center text-base flex-shrink-0">💬</span>
          <h3 className="text-sm font-bold text-white">Kya Bola?</h3>
        </div>
        <div>
          <p className="text-xs text-white/50">{item.title}</p>
          <p className="text-[11px] text-red-300/80 italic mt-0.5">"{item.rule.ask}"</p>
        </div>

        <div className="flex flex-col gap-1.5">
          {FU_REASONS.map(r => (
            <label key={r.key}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                selected?.key === r.key ? 'border-[#534AB7] bg-[#534AB7]/10' : 'border-white/10 hover:bg-white/5'
              }`}>
              <input type="radio" name="fu-reason" checked={selected?.key === r.key} onChange={() => handleSelect(r)}
                className="mt-0.5 accent-[#534AB7]" />
              <span className="text-xs font-semibold text-white">{r.label}</span>
            </label>
          ))}
        </div>

        {selected?.kind === 'date' && (
          <div>
            <label className="block text-[11px] font-bold text-[#a89fff] mb-1">{selected.question}</label>
            <input type="date" autoFocus value={detail} onChange={e => setDetail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#534AB7] [color-scheme:dark]" />
          </div>
        )}
        {selected?.kind === 'text' && (
          <div>
            {selected.question && <label className="block text-[11px] font-bold text-[#a89fff] mb-1">{selected.question}</label>}
            <textarea autoFocus rows={2} value={detail} onChange={e => setDetail(e.target.value)}
              placeholder="Yahan likhein…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-[#534AB7]" />
          </div>
        )}
        {selected?.kind === 'instruction' && (
          <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-2 text-xs font-bold text-amber-300">
            {selected.message}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-2 text-white/70">Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className={`text-xs font-semibold rounded-lg px-4 py-2 text-white ${canSubmit ? 'bg-[#534AB7] hover:bg-[#453d9e]' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
            ✅ Submit
          </button>
        </div>
      </div>
    </div>
  );
}
