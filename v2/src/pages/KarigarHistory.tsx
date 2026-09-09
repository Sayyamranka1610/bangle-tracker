import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../store/AppContext';
import { karigarHistoryRows, imageForCode, buildKarigarHistoryExport, type KarigarHistoryRow } from '../lib/karigarHistoryUtils';
import { familyOf } from '../lib/familyUtils';

function fmtDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Ports Phase 1's Karigar History tab (renderKarigarHistoryView()) — "which
// design has gone to which karigar," derived automatically from real
// vendor-order + customer-order records, no separate data entry.
export default function KarigarHistory() {
  const { state, showToast } = useApp();
  const { data } = state;

  const [search, setSearch] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const allRows = useMemo(() => karigarHistoryRows(data), [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(r =>
      `${r.code} ${r.varietyName} ${familyOf(data, r.code, '')} ${r.vendor}`.toLowerCase().includes(q));
  }, [allRows, search, data]);

  function exportExcel() {
    if (!allRows.length) { showToast('Nothing to export yet — no karigar history', 'info'); return; }
    const { current, fullHistory } = buildKarigarHistoryExport(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(current), 'Current');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fullHistory), 'Full History');
    XLSX.writeFile(wb, `Karigar_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-1">💡 Karigar History</h1>
      <p className="text-sm text-white/40 mb-4 leading-relaxed">
        Which design has gone to which karigar, built automatically from your own orders — no separate data entry needed. Click a row to see its full history.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search code, family, or karigar name…"
          className="flex-1 min-w-[220px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
        <button onClick={exportExcel}
          className="text-sm font-semibold bg-[#534AB7] hover:bg-[#453d9e] text-white rounded-lg px-4 py-2 whitespace-nowrap">
          📥 Export to Excel
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border border-white/10 rounded-xl py-10 text-center text-white/40 text-sm">
          {search ? `No match for "${search}"` : "No karigar has been assigned to any design yet — this fills in automatically as you assign karigars."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-white/10 rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 text-white/40 text-left">
                  <th className="px-3 py-2 font-normal">Photo</th>
                  <th className="px-3 py-2 font-normal">Code</th>
                  <th className="px-3 py-2 font-normal">Family</th>
                  <th className="px-3 py-2 font-normal">Karigar</th>
                  <th className="px-3 py-2 font-normal">Last Sent</th>
                  <th className="px-3 py-2 font-normal text-center">Times</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <KarigarRow key={r.key} row={r} data={data}
                    open={openRow === r.key}
                    onToggle={() => setOpenRow(openRow === r.key ? null : r.key)}
                    onZoom={img => setZoomed(img)} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-white/25 mt-2">{rows.length} design{rows.length !== 1 ? 's' : ''} with a karigar history</p>
        </>
      )}

      {zoomed && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6" onClick={() => setZoomed(null)}>
          <img src={zoomed} alt="" className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

function KarigarRow({ row, data, open, onToggle, onZoom }: {
  row: KarigarHistoryRow;
  data: import('../types').AppData;
  open: boolean;
  onToggle: () => void;
  onZoom: (img: string) => void;
}) {
  const img = useMemo(() => imageForCode(data, row.code, row.varietyName), [data, row.code, row.varietyName]);
  const fam = useMemo(() => familyOf(data, row.code, ''), [data, row.code]);

  return (
    <>
      <tr className="border-t border-white/5 cursor-pointer hover:bg-white/3" onClick={onToggle}>
        <td className="px-3 py-2">
          {img ? (
            <img src={img} alt="" loading="lazy"
              onClick={e => { e.stopPropagation(); onZoom(img); }}
              className="w-16 h-16 rounded-lg object-cover border border-white/10 cursor-zoom-in" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-white/5" />
          )}
        </td>
        <td className="px-3 py-2 font-semibold text-white">
          {row.code}
          {row.varietyName && <span className="text-white/40 font-normal"> · {row.varietyName}</span>}
          {row.totalEvents > 1 && <span className="text-white/25 text-[10px] ml-1.5">{open ? '▾' : '▸'} {row.totalEvents}</span>}
        </td>
        <td className="px-3 py-2 text-white/50">{fam}</td>
        <td className="px-3 py-2 text-[#c9a8ff] font-medium">{row.vendor}</td>
        <td className="px-3 py-2 text-white/40">{fmtDate(row.at)}</td>
        <td className="px-3 py-2 text-center text-[#a89fff] font-semibold">{row.count}</td>
      </tr>
      {open && (
        <tr className="bg-white/3 border-t border-dashed border-white/10">
          <td colSpan={6} className="px-4 py-2">
            {row.events.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1 text-xs border-b border-white/5 last:border-0">
                <div><span className="font-semibold text-white">{e.vendor}</span> <span className="text-white/30">· {e.coLabel}</span></div>
                <span className="text-white/40 font-medium">{e.at ? fmtDate(e.at) : '—'}</span>
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}
