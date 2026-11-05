import { useMemo } from 'react';
import type { AppData } from '../../types';
import { todaysLogByUser } from '../../lib/followUpUtils';

// Today's follow-up responses, grouped by who logged them (busiest first) —
// owner-only, so the owner can see how the team's day went without digging
// through every individual order. Ports Phase 1's openTodayFollowUpLogModal()
// (bangle_v19.html ~L18156) exactly.
export default function AajKaLogModal({ data, onClose }: { data: AppData; onClose: () => void }) {
  const byUser = useMemo(() => todaysLogByUser(data), [data]);
  const total = byUser.reduce((a, u) => a + u.entries.length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <span className="w-8 h-8 rounded-lg bg-[#534AB7]/20 text-[#534AB7] flex items-center justify-center text-base flex-shrink-0">📋</span>
          <h3 className="text-sm font-bold text-[#1a1916]">Aaj ka Follow-up Log <span className="text-xs font-normal text-[#1a1916]/55">({total})</span></h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {byUser.length === 0 ? (
            <p className="text-center py-10 text-[#1a1916]/40 text-sm">Aaj tak koi follow-up log nahi hua.</p>
          ) : byUser.map(u => (
            <div key={u.loggedBy} className="mb-4">
              <p className="text-xs font-extrabold text-[#534AB7] mb-1.5">
                👤 {u.loggedBy} <span className="text-[10px] text-[#1a1916]/40 font-semibold">({u.entries.length})</span>
              </p>
              <div className="flex flex-col gap-1.5">
                {u.entries.map((e, i) => (
                  <div key={i} className="bg-white border border-[#534AB7]/20 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-[#1a1916]">{e.title}</p>
                    <p className="text-[11px] text-[#534AB7] mt-0.5">
                      🗣️ {e.reasonLabel}
                      {(e.reasonKey !== 'no_pipe' && e.reasonKey !== 'no_pickup') && e.detail ? ` — ${e.detail}` : ''}
                    </p>
                    <p className="text-[10px] text-[#1a1916]/40 mt-0.5">
                      {new Date(e.loggedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-black/10 flex justify-end">
          <button onClick={onClose} className="text-xs font-semibold bg-[#534AB7] hover:bg-[#453d9e] rounded-lg px-4 py-2 text-white">Close</button>
        </div>
      </div>
    </div>
  );
}
