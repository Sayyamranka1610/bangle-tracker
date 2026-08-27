import { useEffect, useState } from 'react';
import type { LibSegment, LibEntry } from '../../lib/imageLibrary';
import { batchAddLibraryEntries } from '../../lib/imageLibrary';
import { listR2Objects, R2_PUBLIC_BASE } from '../../lib/r2';

interface Props {
  entries: LibEntry[];
  onSynced: (entries: LibEntry[]) => void;
  onClose: () => void;
}

const SAVE_BATCH = 200;

// Ports Phase 1's syncLibraryFromR2(): scans the R2 bucket directly for
// objects uploaded outside the app (via rclone) that aren't cataloged yet.
// Expected rclone layout: SEGMENT/FOLDER NAME/filename.jpg — e.g.
// CNC/8MM CNC/8001.jpg → segment=CNC, folder="8MM CNC", designCode=8001.
// App-uploaded photos live under a "bt/" prefix and are always skipped here
// (they're already cataloged the moment they're uploaded).
export default function SyncR2Modal({ entries, onSynced, onClose }: Props) {
  const [status, setStatus] = useState('Scanning R2 bucket…');
  const [detail, setDetail] = useState('');
  const [pct, setPct] = useState(5);
  const [running, setRunning] = useState(true);
  const [failed, setFailed] = useState(false);

  async function run() {
    try {
      const knownKeys = new Set(entries.map(e => {
        try { return new URL(e.r2url || '').pathname.replace(/^\//, ''); } catch { return ''; }
      }).filter(Boolean));

      setStatus('Scanning bucket…'); setPct(10);
      const allObjects = await listR2Objects();

      setStatus(`Found ${allObjects.length.toLocaleString()} objects in R2`); setPct(40);
      setDetail('Checking which are new…');

      const toAdd = allObjects.filter(o => {
        if (!o.key || o.key.startsWith('bt/')) return false; // app-uploaded, already cataloged
        const parts = o.key.split('/');
        if (parts.length < 3) return false; // must be segment/folder/file
        if (knownKeys.has(o.key)) return false;
        return true;
      });

      setStatus(`${toAdd.length.toLocaleString()} new images to catalog`); setPct(60);
      setDetail(`${allObjects.length - toAdd.length} already in library`);

      if (!toAdd.length) {
        setStatus('✅ Library is up to date — nothing new to add');
        setDetail('All R2 images are already cataloged');
        setPct(100); setRunning(false);
        return;
      }

      const planned = toAdd.map(o => {
        const parts = o.key.split('/');
        const segment = (parts[0] as LibSegment) || 'CNC';
        const folder = parts[1] || 'General';
        const fileName = parts[parts.length - 1] || '';
        const designCode = fileName.replace(/\.[^.]+$/, '').trim();
        return { designCode, folder, segment, r2url: `${R2_PUBLIC_BASE}/${o.key}`, fileName, uploadedAt: o.uploaded ?? Date.now() };
      });

      const synced: LibEntry[] = [];
      for (let i = 0; i < planned.length; i += SAVE_BATCH) {
        const slice = planned.slice(i, i + SAVE_BATCH);
        const created = await batchAddLibraryEntries(slice);
        synced.push(...created);
        const donePct = 60 + Math.round(((i + SAVE_BATCH) / planned.length) * 38);
        setPct(Math.min(donePct, 98));
        setStatus(`Saving to library… ${Math.min(i + SAVE_BATCH, planned.length).toLocaleString()} / ${planned.length.toLocaleString()}`);
      }

      setStatus(`✅ Done! ${synced.length.toLocaleString()} new images added to library`);
      setDetail('Library synced from R2 successfully');
      setPct(100); setRunning(false);
      onSynced(synced);
    } catch (e) {
      setStatus(`❌ Sync failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setDetail('Check that the Worker is deployed and the upload key is correct');
      setFailed(true); setRunning(false);
    }
  }

  // Runs the scan exactly once on mount. NOTE: this trips eslint's
  // react-hooks/set-state-in-effect rule (it flags any setState reachable
  // from an effect, even post-await) — same pre-existing-style debt as
  // Library.tsx's mount fetch, tracked in the spawned cleanup task rather
  // than restructured here.
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={running ? undefined : onClose}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-md p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-[#4a9fe0]">🔄 Sync from R2 Bucket</h3>
        <p className="text-sm text-white/70">{status}</p>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${failed ? 'bg-red-500' : 'bg-[#4a9fe0]'}`} style={{ width: `${pct}%` }} />
        </div>
        {detail && <p className="text-[11px] text-white/40 min-h-[16px]">{detail}</p>}
        {!running && (
          <button onClick={onClose} className="mt-1 self-end text-xs font-semibold bg-white/10 hover:bg-white/15 rounded-lg px-4 py-2 text-white">Close</button>
        )}
      </div>
    </div>
  );
}
