import { useState } from 'react';
import { LIB_SEGMENTS, LIB_SEG_META, type LibSegment, type LibEntry, type LibFolderReg, getFoldersForSegment } from '../../lib/imageLibrary';

interface Props {
  mode: 'move' | 'copy';
  count: number;
  defaultSegment: LibSegment;
  entries: LibEntry[];
  registry: LibFolderReg[];
  onConfirm: (toSeg: LibSegment, toFolder: string) => void;
  onClose: () => void;
}

// Ports Phase 1's _libShowMovePicker()/_libMvPickSeg() — pick a destination
// segment, then either an existing folder in that segment or type a new one.
export default function MoveCopyModal({ mode, count, defaultSegment, entries, registry, onConfirm, onClose }: Props) {
  const [toSeg, setToSeg] = useState<LibSegment>(defaultSegment);
  const [selFolder, setSelFolder] = useState('');
  const [newFolder, setNewFolder] = useState('');

  const folders = getFoldersForSegment(entries, registry, toSeg);
  const destFolder = newFolder.trim() || selFolder;

  function handleConfirm() {
    if (!destFolder) return;
    onConfirm(toSeg, destFolder);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-md p-5 flex flex-col gap-3.5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#534AB7]">
            {mode === 'move' ? '📂 Move' : '📋 Copy'} {count} photo{count !== 1 ? 's' : ''} to…
          </h3>
          <button onClick={onClose} className="text-[#1a1916]/55 hover:text-[#1a1916] text-sm">✕</button>
        </div>

        <div>
          <label className="text-[11px] font-bold text-[#1a1916]/60 uppercase tracking-wide block mb-1.5">Destination segment</label>
          <div className="flex gap-2">
            {LIB_SEGMENTS.map(s => {
              const meta = LIB_SEG_META[s];
              const active = s === toSeg;
              return (
                <button key={s}
                  onClick={() => { setToSeg(s); setSelFolder(''); }}
                  className={`flex-1 text-xs font-semibold rounded-lg px-3 py-2 border transition-colors ${active ? `${meta.bg} ${meta.border}` : 'border-black/10 text-[#1a1916]/60'}`}
                  style={active ? { color: meta.color } : undefined}>
                  {meta.icon} {s}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold text-[#1a1916]/60 uppercase tracking-wide block mb-1.5">Destination folder</label>
          <select value={selFolder} onChange={e => { setSelFolder(e.target.value); setNewFolder(''); }}
            className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] text-sm focus:outline-none focus:border-[#534AB7]">
            <option value="">— select folder —</option>
            {folders.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          <p className="text-[11px] text-[#1a1916]/40 mt-1.5 mb-1">Or type a new folder name:</p>
          <input value={newFolder} onChange={e => { setNewFolder(e.target.value); setSelFolder(''); }}
            placeholder="New folder name…"
            className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] placeholder-black/35 text-sm focus:outline-none focus:border-[#534AB7]" />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="text-xs font-semibold bg-white hover:bg-black/[0.06] border border-black/10 rounded-lg px-4 py-2 text-[#1a1916]/80">Cancel</button>
          <button onClick={handleConfirm} disabled={!destFolder}
            className={`text-xs font-semibold rounded-lg px-4 py-2 text-white ${destFolder ? (mode === 'move' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700') : 'bg-black/[0.06] text-[#1a1916]/40 cursor-not-allowed'}`}>
            {mode === 'move' ? 'Move Here' : 'Copy Here'}
          </button>
        </div>
      </div>
    </div>
  );
}
