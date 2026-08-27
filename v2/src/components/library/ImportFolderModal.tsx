import { useEffect, useRef, useState } from 'react';
import type { LibSegment, LibEntry } from '../../lib/imageLibrary';
import { planLibraryImport, batchAddLibraryEntries } from '../../lib/imageLibrary';
import { compressImage, uploadToR2 } from '../../lib/r2';

interface Props {
  seg: LibSegment;
  onImported: (entries: LibEntry[]) => void;
  onClose: () => void;
}

const BATCH = 4;      // concurrent uploads — mirrors Phase 1's _libImportFiles()
const SAVE_EVERY = 50; // Firebase writes flushed every N successful uploads

// Ports Phase 1's openLibraryImport()/_libImportFiles(): pick a whole folder
// (webkitdirectory) or individual files, upload every one (no filtering —
// see planLibraryImport()'s comment), showing live progress and per-folder
// counts, saving to Firebase in batches so a 2,000-photo import doesn't lose
// everything if the tab closes partway through.
export default function ImportFolderModal({ seg, onImported, onClose }: Props) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'pick' | 'uploading' | 'done'>('pick');
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [failedFiles, setFailedFiles] = useState<{ folder: string; fileName: string; reason: string }[]>([]);

  // webkitdirectory/mozdirectory aren't in React's typed HTML attributes —
  // set them imperatively via ref so "Select Folder" opens a directory picker.
  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('mozdirectory', '');
  }, []);

  async function runImport(files: FileList, forceFolder: string | null) {
    const plan = planLibraryImport(files, forceFolder);
    if (!plan.length) return;
    setPhase('uploading');
    setTotal(plan.length);
    setDone(0);
    setFailed(0);
    setFolderCounts({});
    setFailedFiles([]);

    let doneCt = 0, failedCt = 0;
    const counts: Record<string, number> = {};
    const failList: { folder: string; fileName: string; reason: string }[] = [];
    let pending: { designCode: string; folder: string; segment: LibSegment; r2url: string; fileName: string }[] = [];
    const imported: LibEntry[] = [];

    const flush = async () => {
      if (!pending.length) return;
      const created = await batchAddLibraryEntries(pending);
      imported.push(...created);
      pending = [];
    };

    for (let i = 0; i < plan.length; i += BATCH) {
      const batch = plan.slice(i, i + BATCH);
      await Promise.all(batch.map(async p => {
        try {
          const dataUrl = await compressImage(p.file, 2400, 0.92);
          const r2url = await uploadToR2(dataUrl);
          pending.push({ designCode: p.designCode, folder: p.folder, segment: seg, r2url, fileName: p.fileName });
          counts[p.folder] = (counts[p.folder] ?? 0) + 1;
          doneCt++;
        } catch (e) {
          failedCt++; doneCt++;
          failList.push({ folder: p.folder, fileName: p.fileName, reason: e instanceof Error ? e.message : 'Upload failed' });
        }
        setDone(doneCt);
        setFailed(failedCt);
        setFolderCounts({ ...counts });
      }));
      if (pending.length >= SAVE_EVERY) await flush();
    }
    await flush();

    setFailedFiles(failList);
    setPhase('done');
    if (imported.length) onImported(imported);
  }

  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={phase === 'uploading' ? undefined : onClose}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-lg p-5 flex flex-col gap-3.5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#a89fff]">📁 Import Photos into Library</h3>
            <p className="text-xs text-white/40 mt-1">
              Select your entire photos folder — its structure is preserved automatically. FolderName/photo.jpg → folder <strong className="text-white/60">FolderName</strong> in <strong className="text-white/60">{seg}</strong>. Every file is uploaded, nothing is filtered.
            </p>
          </div>
          {phase !== 'uploading' && (
            <button onClick={onClose} className="text-white/40 hover:text-white text-sm flex-shrink-0 ml-2">✕</button>
          )}
        </div>

        {phase === 'pick' && (
          <div className="border-2 border-dashed border-white/15 rounded-xl p-6 text-center bg-white/3">
            <div className="text-3xl mb-2">📂</div>
            <p className="text-xs text-white/50 mb-3">Works with 2,000+ photos — uploads {BATCH} at a time, saves progress every {SAVE_EVERY}</p>
            <label className="inline-flex items-center gap-2 bg-[#534AB7] hover:bg-[#453d9e] text-white rounded-lg px-5 py-2.5 text-sm font-semibold cursor-pointer">
              📂 Select Folder
              <input ref={folderInputRef} type="file" multiple accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files; if (f?.length) runImport(f, null); e.target.value = ''; }} />
            </label>
            <p className="text-[11px] text-white/30 mt-2.5 mb-1.5">— or select individual files —</p>
            <label className="inline-flex items-center gap-2 bg-white/5 border border-white/15 text-white/70 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer">
              🖼️ Select Individual Files
              <input type="file" multiple accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files; if (f?.length) runImport(f, 'General'); e.target.value = ''; }} />
            </label>
          </div>
        )}

        {(phase === 'uploading' || phase === 'done') && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-white">
              {phase === 'done'
                ? `✅ ${(done - failed).toLocaleString()} photos imported!${failed ? ` · ${failed} failed` : ''}`
                : `Uploading ${done.toLocaleString()} / ${total.toLocaleString()} photos (${pct}%)…`}
            </p>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${phase === 'done' ? (failed ? 'bg-amber-500' : 'bg-green-500') : 'bg-[#534AB7]'}`} style={{ width: `${phase === 'done' ? 100 : pct}%` }} />
            </div>
            {phase === 'uploading' && (
              <p className="text-[11px] text-white/40">{failed ? `${failed} failed — will show list at end` : 'All uploads successful so far ✓'}</p>
            )}
            {Object.keys(folderCounts).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(folderCounts).map(([f, n]) => (
                  <span key={f} className="text-[10px] bg-white/5 border border-white/10 rounded px-2 py-0.5 text-white/60">{f}: {n}</span>
                ))}
              </div>
            )}
            {phase === 'done' && failedFiles.length > 0 && (
              <div className="mt-2 bg-red-500/10 border border-red-500/25 rounded-lg p-2.5 max-h-32 overflow-y-auto">
                <p className="text-[11px] font-semibold text-red-300 mb-1">Failed files:</p>
                {failedFiles.map((f, i) => (
                  <p key={i} className="text-[10px] text-red-300/70">{f.folder}/{f.fileName} — {f.reason}</p>
                ))}
              </div>
            )}
            {phase === 'done' && (
              <button onClick={onClose} className="mt-2 self-end text-xs font-semibold bg-white/10 hover:bg-white/15 rounded-lg px-4 py-2 text-white">Close</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
