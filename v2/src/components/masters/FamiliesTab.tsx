import { useState, useMemo } from 'react';
import { useApp } from '../../store/AppContext';
import {
  familyCodeRows, allFamilies, setDesignFamily, setDesignFamilyMany,
  setFamilyNote, renameFamily, type FamilyCodeRow,
} from '../../lib/familyUtils';
import { buildAuditLog } from '../../lib/auditUtils';

// Masters → Families. Groups every design code into a family so the Pooling
// Board can batch by family instead of by exact code, and gives each family a
// standing notes box that everyone sees.

export default function FamiliesTab() {
  const { state, showToast, saveAppData } = useApp();
  const { data, session, hasLock } = state;
  const canEdit = session?.role === 'owner' && hasLock;

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => familyCodeRows(data), [data]);
  const families = useMemo(() => allFamilies(data), [data]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const by = new Map<string, FamilyCodeRow[]>();
    rows.forEach(r => {
      if (q && !(
        r.family.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.names.some(n => n.toLowerCase().includes(q))
      )) return;
      if (!by.has(r.family)) by.set(r.family, []);
      by.get(r.family)!.push(r);
    });
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, search]);

  function toggle(fam: string) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(fam)) next.delete(fam); else next.add(fam);
      return next;
    });
  }

  async function moveCode(code: string, family: string) {
    if (!canEdit) return;
    setBusy(true);
    try {
      const patch = setDesignFamily(data, code, family);
      if (session?.username) {
        patch.auditLog = buildAuditLog('Set family', `${code} → ${family || '(auto)'}`, session.username, data.auditLog ?? []);
      }
      await saveAppData(patch);
      showToast(`${code} moved to ${family || 'automatic'}`, 'success');
    } catch { showToast('Could not save — check your connection', 'error'); }
    finally { setBusy(false); }
  }

  async function mergeFamily(from: string, into: string) {
    if (!canEdit || !into.trim() || into === from) return;
    const codes = rows.filter(r => r.family === from).map(r => r.code);
    setBusy(true);
    try {
      const patch = setDesignFamilyMany(data, codes, into);
      const notes = setFamilyNote(data, from, '');
      if (session?.username) {
        patch.auditLog = buildAuditLog('Merge family', `"${from}" (${codes.length} codes) → "${into}"`, session.username, data.auditLog ?? []);
      }
      await saveAppData({ ...patch, ...notes });
      showToast(`${codes.length} code${codes.length !== 1 ? 's' : ''} moved into ${into}`, 'success');
    } catch { showToast('Could not save — check your connection', 'error'); }
    finally { setBusy(false); }
  }

  async function commitRename(oldName: string) {
    const target = renameVal.trim();
    setRenaming(null);
    if (!canEdit || !target || target === oldName) return;
    setBusy(true);
    try {
      const patch = renameFamily(data, oldName, target);
      if (!Object.keys(patch).length) return;
      if (session?.username) {
        patch.auditLog = buildAuditLog('Rename family', `"${oldName}" → "${target}"`, session.username, data.auditLog ?? []);
      }
      await saveAppData(patch);
      showToast(`Family renamed to "${target}"`, 'success');
    } catch { showToast('Could not save — check your connection', 'error'); }
    finally { setBusy(false); }
  }

  async function commitNote(fam: string) {
    if (!canEdit) return;
    const draft = noteDraft[fam];
    if (draft === undefined) return;
    if ((data.familyNotes?.[fam] ?? '') === draft) return;
    setBusy(true);
    try {
      await saveAppData(setFamilyNote(data, fam, draft));
      showToast('Family note saved', 'success');
    } catch { showToast('Could not save — check your connection', 'error'); }
    finally { setBusy(false); }
  }

  const totalCodes = rows.length;
  const guessed = rows.filter(r => r.guessed).length;

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <p className="text-sm text-white/70 leading-relaxed">
          A <b className="text-white">family</b> groups design codes that are the same product to a vendor —
          e.g. <span className="text-[#a89fff]">12MM Sardar Kada</span> covers 1203.29, 1203.30, 1203.31…
          The Pooling Board batches by family, so grouping them correctly means bigger, more worthwhile batches.
        </p>
        <div className="flex gap-4 mt-3 text-xs">
          <span className="text-white/50">{totalCodes} codes</span>
          <span className="text-white/50">{grouped.length} families shown</span>
          {guessed > 0 && (
            <span className="text-amber-300/80">{guessed} still on the automatic guess</span>
          )}
        </div>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search family, code or design name…"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]"
      />

      {grouped.length === 0 && (
        <p className="text-sm text-white/40 px-1 py-6 text-center">
          {rows.length === 0 ? 'No designs yet — families appear once orders have designs.' : 'No match found.'}
        </p>
      )}

      {grouped.map(([fam, codes]) => {
        const isOpen = open.has(fam);
        const qty = codes.reduce((a, r) => a + r.qty, 0);
        const note = noteDraft[fam] ?? data.familyNotes?.[fam] ?? '';
        return (
          <div key={fam} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 flex-wrap border-b border-white/10">
              <button onClick={() => toggle(fam)} className="text-white/40 hover:text-white text-sm w-4 text-left">
                {isOpen ? '▾' : '▸'}
              </button>

              {renaming === fam ? (
                <input
                  autoFocus value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={() => commitRename(fam)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(fam);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="flex-1 min-w-[180px] bg-white/10 border border-[#534AB7] rounded px-2 py-1 text-white text-sm focus:outline-none"
                />
              ) : (
                <button onClick={() => toggle(fam)} className="flex-1 min-w-[160px] text-left">
                  <span className="text-sm font-semibold text-white">{fam}</span>
                </button>
              )}

              <span className="text-xs text-white/40">{codes.length} code{codes.length !== 1 ? 's' : ''}</span>
              <span className="text-xs text-white/40">{qty.toLocaleString()} pcs</span>

              {canEdit && renaming !== fam && (
                <button
                  onClick={() => { setRenaming(fam); setRenameVal(fam); }}
                  className="text-white/20 hover:text-white text-sm" title="Rename this family everywhere">✏️</button>
              )}
            </div>

            {isOpen && (
              <div className="px-4 py-3 space-y-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-white/40 mb-1">
                    Family notes — everyone sees this
                  </label>
                  <textarea
                    value={note}
                    disabled={!canEdit}
                    onChange={e => setNoteDraft(p => ({ ...p, [fam]: e.target.value }))}
                    onBlur={() => commitNote(fam)}
                    rows={2}
                    placeholder="Which karigar does these best, standing instructions, what to watch for…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#534AB7] disabled:opacity-60"
                  />
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-white/40">Merge this whole family into:</span>
                    <select
                      defaultValue=""
                      disabled={busy}
                      onChange={e => { const v = e.target.value; e.currentTarget.value = ''; if (v) mergeFamily(fam, v); }}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white/80 text-xs focus:outline-none">
                      <option value="">choose a family…</option>
                      {families.filter(f => f !== fam).map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                )}

                <div className="divide-y divide-white/5 border-t border-white/10 pt-1">
                  {codes.map(r => (
                    <div key={r.code} className="py-2 flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="text-sm text-white font-medium">
                          {r.code}
                          {r.guessed && (
                            <span className="ml-2 text-[10px] bg-amber-400/15 text-amber-300 rounded-full px-2 py-0.5 align-middle"
                              title="Automatically guessed from the design name — not yet confirmed by you">
                              auto
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-white/40 mt-0.5">{r.names.join(' · ') || '—'}</div>
                        <div className="text-[11px] text-white/30 mt-0.5">
                          {r.rows} row{r.rows !== 1 ? 's' : ''} · {r.qty.toLocaleString()} pcs
                          {r.finishes.length ? ` · ${r.finishes.join(', ')}` : ''}
                        </div>
                      </div>
                      {canEdit && (
                        <input
                          list="bt-family-options"
                          defaultValue={r.family}
                          disabled={busy}
                          onBlur={e => { const v = e.target.value.trim(); if (v !== r.family) moveCode(r.code, v); }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="w-44 bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#534AB7]"
                          placeholder="family…"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <datalist id="bt-family-options">
        {families.map(f => <option key={f} value={f} />)}
      </datalist>
    </div>
  );
}
