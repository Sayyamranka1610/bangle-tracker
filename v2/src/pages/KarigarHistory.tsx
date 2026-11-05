import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../store/AppContext';
import { karigarHistoryRows, imageForCode, buildKarigarHistoryExport, type KarigarHistoryRow } from '../lib/karigarHistoryUtils';
import { familyOf } from '../lib/familyUtils';
import { useLightbox } from '../components/lightboxContext';

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
  const lightbox = useLightbox();

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
      <h1 className="text-xl font-bold text-[#1a1916] mb-1">💡 Karigar History</h1>
      <p className="text-sm text-[#1a1916]/55 mb-4 leading-relaxed">
        Which design has gone to which karigar, built automatically from your own orders — no separate data entry needed. Click a row to see its full history.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search code, family, or karigar name…"
          className="flex-1 min-w-[220px] bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] placeholder-black/35 text-sm focus:outline-none focus:border-[#534AB7]" />
        <button onClick={exportExcel}
          className="text-sm font-semibold bg-[#534AB7] hover:bg-[#453d9e] text-white rounded-lg px-4 py-2 whitespace-nowrap">
          📥 Export to Excel
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border border-black/10 rounded-xl py-10 text-center text-[#1a1916]/55 text-sm">
          {search ? `No match for "${search}"` : "No karigar has been assigned to any design yet — this fills in automatically as you assign karigars."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-black/10 rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white text-[#1a1916]/55 text-left">
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
                    onZoom={img => lightbox.open([img])} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[#1a1916]/35 mt-2">{rows.length} design{rows.length !== 1 ? 's' : ''} with a karigar history</p>
        </>
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
      <tr className="border-t border-black/[0.07] cursor-pointer hover:bg-black/5" onClick={onToggle}>
        <td className="px-3 py-2">
          {img ? (
            <img src={img} alt="" loading="lazy"
              onClick={e => { e.stopPropagation(); onZoom(img); }}
              className="w-16 h-16 rounded-lg object-cover border border-black/10 cursor-zoom-in" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-white" />
          )}
        </td>
        <td className="px-3 py-2 font-semibold text-[#1a1916]">
          {row.code}
          {row.varietyName && <span className="text-[#1a1916]/55 font-normal"> · {row.varietyName}</span>}
          {row.totalEvents > 1 && <span className="text-[#1a1916]/35 text-[10px] ml-1.5">{open ? '▾' : '▸'} {row.totalEvents}</span>}
        </td>
        <td className="px-3 py-2 text-[#1a1916]/60">{fam}</td>
        <td className="px-3 py-2 text-[#7B3FB5] font-medium">{row.vendor}</td>
        <td className="px-3 py-2 text-[#1a1916]/55">{fmtDate(row.at)}</td>
        <td className="px-3 py-2 text-center text-[#534AB7] font-semibold">{row.count}</td>
      </tr>
      {open && (
        <tr className="bg-white border-t border-dashed border-black/10">
          <td colSpan={6} className="px-4 py-2">
            {row.events.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1 text-xs border-b border-black/[0.07] last:border-0">
                <div><span className="font-semibold text-[#1a1916]">{e.vendor}</span> <span className="text-[#1a1916]/40">· {e.coLabel}</span></div>
                <span className="text-[#1a1916]/55 font-medium">{e.at ? fmtDate(e.at) : '—'}</span>
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}
