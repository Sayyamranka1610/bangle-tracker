import { useState, useEffect, useMemo } from 'react';
import { fetchLibrary, addLibraryEntry, registerFolder, getFoldersForSegment, fetchFolderRegistry, type LibEntry } from '../../lib/imageLibrary';
import { uploadToR2, compressImage } from '../../lib/r2';

// Mirrors Phase 1's openLibraryPicker exactly: search by design code, filter
// by folder, "suggested" matches for the current design's own code shown
// first, click any photo to attach, or upload a brand-new one straight into
// the library (and attach it in the same step).

interface Props {
  designCode: string;
  onAttach: (image: { data: string; name?: string }) => void;
  onClose: () => void;
}

export default function PhotoPickerModal({ designCode, onAttach, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [library, setLibrary] = useState<LibEntry[]>([]);
  const [search, setSearch] = useState(designCode);
  const [folder, setFolder] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const lib = await fetchLibrary();
        setLibrary(lib);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const suggested = useMemo(
    () => designCode ? library.filter(e => e.designCode.toLowerCase() === designCode.toLowerCase()) : [],
    [library, designCode],
  );

  const allFolders = useMemo(() => [...new Set(library.map(e => e.folder).filter(Boolean))].sort(), [library]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let items = library;
    if (folder) items = items.filter(e => e.folder === folder);
    if (q) items = items.filter(e => e.designCode.toLowerCase().includes(q) || e.folder.toLowerCase().includes(q) || e.fileName.toLowerCase().includes(q));
    return [...items].sort((a, b) => (a.designCode || '').localeCompare(b.designCode || '', undefined, { numeric: true }));
  }, [library, search, folder]);

  function attach(entry: LibEntry) {
    onAttach({ data: entry.r2url, name: entry.fileName || entry.designCode || undefined });
    onClose();
  }

  async function uploadAndAttach(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    const suggestedFolder = designCode || 'General';
    const targetFolder = (prompt(`Save to which folder?`, allFolders.includes(suggestedFolder) ? suggestedFolder : suggestedFolder) || '').trim();
    if (!targetFolder) return;

    setUploading(true);
    try {
      const registry = await fetchFolderRegistry();
      const segment = getFoldersForSegment(library, registry, 'CNC').some(f => f.name === targetFolder) ? 'CNC' : 'Dye Gold';
      const dataUrl = await compressImage(file, 1200, 0.82);
      const r2url = await uploadToR2(dataUrl);
      if (!registry.some(f => f.name === targetFolder)) await registerFolder(segment, targetFolder);
      const entry = await addLibraryEntry({ designCode, folder: targetFolder, segment, r2url, fileName: file.name });
      attach(entry);
    } catch {
      alert('Upload failed — check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-3">
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col p-5 gap-3">
        <div className="flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold">🖼️ Choose Photo from Library</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {designCode && <>Searching for design code <strong className="text-white/70">{designCode}</strong> · </>}
              {library.length.toLocaleString()} photos available
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-sm border border-white/10 rounded-lg px-3 py-1.5 flex-shrink-0">✕ Close</button>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Type design code (e.g. 8001, DD-1)…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#534AB7]" />
          <select value={folder} onChange={e => { setFolder(e.target.value); setSearch(''); }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none min-w-[160px]">
            <option value="">All folders</option>
            {allFolders.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {suggested.length > 0 && (
          <div className="flex-shrink-0">
            <p className="text-xs font-semibold text-green-400 mb-1.5">✅ Suggested for "{designCode}" — {suggested.length} match{suggested.length !== 1 ? 'es' : ''}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {suggested.map(e => (
                <button key={e._id} onClick={() => attach(e)} className="flex-shrink-0 w-20 border-2 border-green-500 rounded-lg overflow-hidden hover:scale-105 transition-transform">
                  <img src={e.r2url} className="w-full h-16 object-cover" alt="" loading="lazy" />
                  <p className="text-[9px] text-green-400 font-medium px-1 py-0.5 truncate">{e.folder}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <p className="text-center py-10 text-white/30 text-sm">Loading library…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-10 text-white/30 text-sm">No photos match.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {filtered.slice(0, 200).map(e => (
                <button key={e._id} onClick={() => attach(e)} title={`${e.designCode} · ${e.folder}`}
                  className="border border-white/10 rounded-lg overflow-hidden hover:border-[#534AB7] hover:scale-105 transition-all bg-white/5">
                  <img src={e.r2url} className="w-full h-16 object-cover" alt="" loading="lazy" />
                  <div className="px-1 py-1">
                    <p className="text-[9px] font-semibold text-white truncate">{e.designCode || '—'}</p>
                    <p className="text-[8px] text-white/40 truncate">{e.folder}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {filtered.length > 200 && <p className="text-[10px] text-white/25 text-center py-2">Showing 200 of {filtered.length.toLocaleString()} — narrow your search to see more.</p>}
        </div>

        <div className="flex-shrink-0 pt-2 border-t border-white/10 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-white/40">Photo not in library?</span>
          <label className={`text-xs font-semibold rounded-lg px-3 py-1.5 cursor-pointer transition-colors ${uploading ? 'bg-white/10 text-white/40' : 'bg-[#534AB7] hover:bg-[#6259c8] text-white'}`}>
            {uploading ? 'Uploading…' : '📁 Upload from Device & Add to Library'}
            <input type="file" accept="image/*" disabled={uploading} className="hidden" onChange={e => uploadAndAttach(e.target.files)} />
          </label>
        </div>
      </div>
    </div>
  );
}
