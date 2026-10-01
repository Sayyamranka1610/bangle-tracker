import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppData, VendorOrder } from '../../types';
import { buildTrailCardGroups, FOLLOWUP_RULES, FOLLOWUP_RULE_ORDER, type TrailCardGroup } from '../../lib/followUpUtils';
import { FollowUpTimeline } from './FollowUpTrail';

// Browse every entity that's ever had a follow-up logged, grouped by issue
// TYPE so every conversation about the same kind of problem sits together,
// split at the top between customer orders and vendor orders (different
// audiences — who you'd actually call). Open to everyone, not owner-gated,
// same as Phase 1 — the whole team can see how any conversation played out.
// Ports Phase 1's openAllFollowUpTrailsModal() (bangle_v19.html ~L18352).
export default function SaareTrailsModal({ data, onClose }: { data: AppData; onClose: () => void }) {
  const navigate = useNavigate();
  const [viewKind, setViewKind] = useState<'co' | 'vo'>('co');
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  const allCards = useMemo(() => buildTrailCardGroups(data), [data]);
  const coCount = allCards.filter(g => g.kind === 'co').length;
  const voCount = allCards.filter(g => g.kind === 'vo').length;
  const cards = allCards.filter(g => g.kind === viewKind);

  const byRule = new Map<string, TrailCardGroup[]>();
  cards.forEach(g => {
    if (!byRule.has(g.ruleKey)) byRule.set(g.ruleKey, []);
    byRule.get(g.ruleKey)!.push(g);
  });
  byRule.forEach(list => list.sort((a, b) =>
    Math.max(...b.entries.map(e => e.loggedAt)) - Math.max(...a.entries.map(e => e.loggedAt))));
  const ruleKeysInOrder = FOLLOWUP_RULE_ORDER.filter(k => (byRule.get(k) ?? []).length);

  function toggleCard(groupKey: string) {
    setOpenCards(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  }

  function goTo(g: TrailCardGroup) {
    onClose();
    if (g.kind === 'co') {
      navigate(`/orders?focus=${g.id}`);
    } else {
      const vo = (data.vendorOrders ?? []).find((v: VendorOrder) => v.id === g.id);
      navigate(`/vendors?q=${encodeURIComponent(vo?.orderId ?? '')}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <span className="w-8 h-8 rounded-lg bg-[#534AB7]/20 text-[#a89fff] flex items-center justify-center text-base flex-shrink-0">📜</span>
          <h3 className="text-sm font-bold text-white">Saare Follow-up Trails</h3>
        </div>

        <div className="flex gap-1 px-5 border-b border-white/10">
          <button onClick={() => setViewKind('co')}
            className={`text-xs font-semibold px-3 py-2 border-b-2 transition-colors ${
              viewKind === 'co' ? 'border-[#534AB7] text-white' : 'border-transparent text-white/40 hover:text-white/70'
            }`}>
            📦 Customer Orders ({coCount})
          </button>
          <button onClick={() => setViewKind('vo')}
            className={`text-xs font-semibold px-3 py-2 border-b-2 transition-colors ${
              viewKind === 'vo' ? 'border-[#534AB7] text-white' : 'border-transparent text-white/40 hover:text-white/70'
            }`}>
            🏭 Vendor Orders ({voCount})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {ruleKeysInOrder.length === 0 ? (
            <p className="text-center py-10 text-white/30 text-sm">
              {viewKind === 'vo' ? 'Vendor orders' : 'Customer orders'} ke liye abhi tak koi follow-up log nahi hua.
            </p>
          ) : ruleKeysInOrder.map(rk => {
            const rule = FOLLOWUP_RULES[rk];
            const list = byRule.get(rk) ?? [];
            return (
              <div key={rk} className="mb-5">
                <p className="text-[11px] font-bold text-[#a89fff] uppercase tracking-wide mb-1.5">
                  {rule.icon} {rule.label} <span className="font-normal text-white/30 normal-case tracking-normal">({list.length})</span>
                </p>
                <div className="flex flex-col gap-1.5">
                  {list.map(g => {
                    const open = openCards.has(g.groupKey);
                    return (
                      <div key={g.groupKey} className="border border-[#534AB7]/25 rounded-lg bg-white/[0.02] overflow-hidden">
                        <button onClick={() => toggleCard(g.groupKey)}
                          className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-white/5 transition-colors">
                          <span className="transition-transform text-white/40 text-[10px]" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
                          <span className="text-xs font-semibold text-white truncate">{g.kind === 'vo' ? '🏭' : '📦'} {g.title}</span>
                          <span className="text-[10px] text-white/30 flex-shrink-0">({g.entries.length})</span>
                        </button>
                        {open && (
                          <div className="px-3 pb-3">
                            <FollowUpTimeline entries={g.entries} />
                            <button onClick={() => goTo(g)}
                              className="mt-2 text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white/70">
                              ↗ Kholo
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-white/10 flex justify-end">
          <button onClick={onClose} className="text-xs font-semibold bg-[#534AB7] hover:bg-[#453d9e] rounded-lg px-4 py-2 text-white">Close</button>
        </div>
      </div>
    </div>
  );
}
