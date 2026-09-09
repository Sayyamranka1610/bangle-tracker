import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { AppData } from '../types';
import { buildAuditLog } from '../lib/auditUtils';
import {
  computeFollowUps, groupByVendor, severityOf, lastLogFor, submitFollowUpResponse,
  SEV_COLORS, type FollowUpItem, type FuReason, type FuSeverity,
} from '../lib/followUpUtils';
import FollowUpResponseModal from '../components/followups/FollowUpResponseModal';

type SevFilter = 'all' | FuSeverity;

const SEV_CHIPS: { key: SevFilter; label: string }[] = [
  { key: 'all',  label: 'Sab' },
  { key: 'crit', label: '🔴 60+ din' },
  { key: 'warn', label: '🟠 30–60 din' },
  { key: 'ok',   label: '🟡 Recent' },
];

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function FollowUps() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;
  const navigate = useNavigate();
  // Every write in Phase 2 requires the edit lock (stricter than Phase 1's
  // per-role gating) — same canEdit convention as every other page.
  const canEdit = session?.role === 'owner' && hasLock;

  const { items } = useMemo(() => computeFollowUps(data), [data]);
  const [sevFilter, setSevFilter] = useState<SevFilter>('all');
  const [openGroups, setOpenGroups] = useState<Set<string> | null>(null);
  const [responseItem, setResponseItem] = useState<FollowUpItem | null>(null);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => groupByVendor(items), [items]);

  // First load: auto-expand only the single most-overdue group. After that,
  // respect whatever the user has manually toggled (mirrors Phase 1's
  // _fuOpenGroups===null seed-once behavior).
  const effectiveOpen = openGroups ?? new Set(groups.length ? [groups[0].key] : []);

  function toggleGroup(key: string) {
    const next = new Set(effectiveOpen);
    if (next.has(key)) next.delete(key); else next.add(key);
    setOpenGroups(next);
  }

  function goToTarget(it: FollowUpItem) {
    if (it.kind === 'co' && it.orderId) {
      navigate(`/orders?focus=${it.orderId}`);
    } else if (it.kind === 'vo' && it.voId) {
      const vo = (data.vendorOrders ?? []).find(v => v.id === it.voId);
      navigate(`/vendors?q=${encodeURIComponent(vo?.orderId ?? '')}`);
    }
  }

  async function handleSubmitResponse(reason: FuReason, detail: string) {
    if (!responseItem || !session?.username) return;
    setSaving(true);
    try {
      const { followUps, followUpLog } = submitFollowUpResponse(data, responseItem, reason, detail, session.username);
      const patch: Partial<AppData> = {
        followUps,
        followUpLog,
        auditLog: buildAuditLog(
          'Follow-up',
          `${reason.label} — ${responseItem.title} (by ${session.username})`,
          session.username,
          data.auditLog ?? [],
        ),
      };
      await saveAppData(patch, { immediate: true });
      showToast('Follow-up logged', 'success');
      setResponseItem(null);
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  const totalCount = items.length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-white">💬 Kya Bola?</h1>
        <span className="text-xs text-white/50">{totalCount} pending follow-up{totalCount === 1 ? '' : 's'}</span>
      </div>
      <p className="text-xs text-white/50 mb-4">Stuck orders and vendor orders that need a real answer.</p>

      <div className="flex gap-2 mb-5 flex-wrap">
        {SEV_CHIPS.map(chip => {
          const count = chip.key === 'all' ? items.length : items.filter(it => severityOf(it.overdueDays) === chip.key).length;
          const active = sevFilter === chip.key;
          return (
            <button key={chip.key} onClick={() => setSevFilter(chip.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                active ? 'bg-[#534AB7] border-[#534AB7] text-white' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}>
              {chip.label} {count > 0 && <span className="opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {groups.length === 0 && (
        <div className="text-center py-16 text-white/40 text-sm">
          🎉 Koi follow-up pending nahi hai. Sab up to date hai.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {groups.map(g => {
          const visRows = sevFilter === 'all' ? g.rows : g.rows.filter(it => severityOf(it.overdueDays) === sevFilter);
          if (!visRows.length) return null;
          const isOpen = effectiveOpen.has(g.key);
          const sev = severityOf(g.oldest);
          const colors = SEV_COLORS[sev];
          return (
            <div key={g.key} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <button onClick={() => toggleGroup(g.key)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0">{g.icon}</span>
                  <span className="font-semibold text-white text-sm truncate">{g.label}</span>
                  <span className="text-xs text-white/40 flex-shrink-0">({visRows.length})</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: colors.bg, color: colors.tx, borderColor: colors.bd }}>
                    {g.oldest <= 0 ? 'Aaj se due' : `${g.oldest} din`}
                  </span>
                  <span className="text-white/40 text-xs transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 flex flex-col gap-2">
                  {visRows.map(it => {
                    const lastLog = lastLogFor(data, it.key);
                    const itSev = severityOf(it.overdueDays);
                    const itColors = SEV_COLORS[itSev];
                    return (
                      <div key={it.key} className="rounded-lg border border-white/10 bg-[#1a1750]/50 p-3 flex flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-white">{it.title}</span>
                              {g.isVendor && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                                  {it.rule.icon} {it.rule.label}
                                </span>
                              )}
                              {it.isBrokenPromise && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#FCEBEB] text-[#A32D2D] border border-[#F09595]">
                                  ⚠️ Maal promise kiya{it.promisedDate ? ` (${fmtDate(it.promisedDate)})` : ''}, diya nahi
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white/50 mt-0.5">{it.subtitle}</p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
                            style={{ background: itColors.bg, color: itColors.tx, borderColor: itColors.bd }}>
                            {it.overdueDays <= 0 ? 'Aaj se due hai' : `${it.overdueDays} din se pending`}
                          </span>
                        </div>

                        <p className="text-xs italic text-red-300/80">
                          "{it.isBrokenPromise && it.promisedDate
                            ? `Pichli baar bola tha ki ${fmtDate(it.promisedDate)} tak aa jayega — ab tak nahi aaya, kyun?`
                            : it.rule.ask}"
                        </p>

                        {lastLog && (
                          <p className="text-[11px] text-white/40">
                            💬 Last time ({fmtDate(lastLog.loggedAt ? new Date(lastLog.loggedAt).toISOString().slice(0, 10) : '')}): {lastLog.reasonLabel}{lastLog.detail ? ` — ${lastLog.detail}` : ''}
                          </p>
                        )}
                        {it.timesFollowedUp > 0 && (
                          <p className="text-[11px] text-white/30">Pehle bhi {it.timesFollowedUp} baar follow-up ho chuka hai</p>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button onClick={() => goToTarget(it)}
                            className="text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white/70">
                            ↗ Kholo
                          </button>
                          {canEdit && (
                            <button onClick={() => setResponseItem(it)} disabled={saving}
                              className="text-xs font-semibold bg-[#534AB7] hover:bg-[#453d9e] rounded-lg px-3 py-1.5 text-white disabled:opacity-50">
                              ✅ Ho gaya
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {responseItem && (
        <FollowUpResponseModal
          item={responseItem}
          onClose={() => setResponseItem(null)}
          onSubmit={handleSubmitResponse}
        />
      )}
    </div>
  );
}
