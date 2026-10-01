import { useState } from 'react';
import type { AppData } from '../../types';
import { trailFor } from '../../lib/followUpUtils';

// Small collapsible block embedded inside an order's / vendor order's own
// Details tab — the follow-up ("Kya Bola?") conversation history for THIS
// entity only, visible to anyone who opens it. Ports Phase 1's
// _followUpTrailSectionHtml()/_followUpTrailHtml() (bangle_v19.html
// ~L18253) exactly: a vertical timeline, each entry showing when/who/what
// was said, skipping the detail text for the two fixed-instruction reasons
// (no_pipe/no_pickup) since those carry no free text worth repeating.
// Renders nothing at all when there's no history yet — adds nothing to the
// vast majority of orders that never needed a follow-up.
export default function FollowUpTrail({ data, kind, id }: { data: AppData; kind: 'vo' | 'co'; id: string }) {
  const [open, setOpen] = useState(false);
  const entries = trailFor(data, kind, id);
  if (!entries.length) return null;

  return (
    <div className="mt-3.5 border border-[#534AB7]/25 rounded-xl bg-white/[0.02] overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-[11px] font-bold text-[#a89fff] hover:bg-white/5 transition-colors">
        <span className="transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        <span>📜 Follow-up Trail ({entries.length})</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-5 relative">
          <div className="absolute left-[18px] top-1 bottom-3 w-px bg-[#534AB7]/25" />
          <div className="flex flex-col gap-3">
            {entries.map((e, i) => (
              <div key={i} className="relative pl-3">
                <div className="absolute -left-[3.5px] top-1 w-2 h-2 rounded-full bg-[#534AB7] ring-2 ring-[#1a1750]" />
                <p className="text-[10px] text-white/40">
                  {new Date(e.loggedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' · '}
                  {new Date(e.loggedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}{e.loggedBy}
                </p>
                <p className="text-xs font-semibold text-white mt-0.5">{e.subtitle || e.title}</p>
                <p className="text-[11px] text-[#a89fff] mt-0.5">
                  🗣️ {e.reasonLabel}
                  {(e.reasonKey !== 'no_pipe' && e.reasonKey !== 'no_pickup') && e.detail ? ` — ${e.detail}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
