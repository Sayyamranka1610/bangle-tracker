import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import {
  LIB_SEGMENTS, LIB_SEG_META, type LibSegment, type LibEntry, type LibFolderReg,
  fetchLibrary, fetchFolderRegistry, addLibraryEntry, deleteLibraryEntry,
  registerFolder, unregisterFolder, getFoldersForSegment,
} from '../lib/imageLibrary';
import { uploadToR2, compressImage } from '../lib/r2';

export default function Library() {
  const { state, showToast } = useApp();
  const canEdit = state.session?.role === 'owner' && state.hasLock;

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [registry, setRegistry] = useState<LibFolderReg[]>([]);
  const [segment, setSegment] = useState<LibSegment | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lib, regs] = await Promise.all([fetchLibrary(), fetchFolderRegistry()]);
      setEntries(lib);
      setRegistry(regs);
    } catch {
      showToast('Could not load image library', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  function goRoot() { setSegment(null); setFolder(null); setSearch(''); }
  function goSegment() { setFolder(null); setSearch(''); }
  function selectSegment(seg: LibSegment) { setSegment(seg); setFolder(null); setSearch(''); }
  function selectFolder(name: string) { setFolder(name); setSearch(''); }

  async function handleNewFolder(seg: LibSegment) {
    const name = prompt('New folder name:');
    if (!name?.trim()) return;
    if (getFoldersForSegment(entries, registry, seg).some(f => f.name === name.trim())) {
      showToast('A folder with that name already exists', 'error');
      return;
    }
    try {
      const reg = await registerFolder(seg, name.trim());
      setRegistry(prev => [...prev, reg]);
      showToast(`Folder "${name.trim()}" created`, 'success');
    } catch {
      showToast('Failed to create folder', 'error');
    }
  }

  async function handleRenameFolder(seg: LibSegment, oldName: string, regId: string | null) {
    const newName = prompt(`Rename folder "${oldName}" to:`, oldName);
    if (!newName?.trim() || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    try {
      const toUpdate = entries.filter(e => e.segment === seg && e.folder === oldName);
      await Promise.all(toUpdate.map(e => addLibraryEntry({ ...e, folder: trimmed }).then(() => deleteLibraryEntry(e._id))));
      let newRegId = regId;
      if (regId) {
        await unregisterFolder(regId);
        const reg = await registerFolder(seg, trimmed);
        newRegId = reg._id;
      }
      setEntries(prev => prev.map(e => (e.segment === seg && e.folder === oldName) ? { ...e, folder: trimmed } : e));
      setRegistry(prev => regId ? prev.map(f => f._id === regId ? { ...f, _id: newRegId!, name: trimmed } : f) : prev);
      if (folder === oldName) setFolder(trimmed);
      showToast(`Renamed to "${trimmed}"`, 'success');
    } catch {
      showToast('Rename failed', 'error');
    }
  }

  async function handleDeleteFolder(seg: LibSegment, name: string, regId: string | null) {
    const imgs = entries.filter(e => e.segment === seg && e.folder === name);
    if (!confirm(`Delete folder "${name}"?\n\n${imgs.length > 0 ? `This will also delete all ${imgs.length} photos inside it.` : '(Folder is empty)'}\n\nThis cannot be undone.`)) return;
    try {
      await Promise.all(imgs.map(e => deleteLibraryEntry(e._id)));
      if (regId) await unregisterFolder(regId);
      setEntries(prev => prev.filter(e => !(e.segment === seg && e.folder === name)));
      setRegistry(prev => prev.filter(f => f._id !== regId));
      if (folder === name) setFolder(null);
      showToast(`Folder "${name}" deleted${imgs.length ? ` with ${imgs.length} photo${imgs.length !== 1 ? 's' : ''}` : ''}`, 'info');
    } catch {
      showToast('Delete failed', 'error');
    }
  }

  async function handleDeletePhoto(id: string) {
    if (!confirm('Remove this photo from the library?\n\nDesigns already using it will keep showing it.')) return;
    try {
      await deleteLibraryEntry(id);
      setEntries(prev => prev.filter(e => e._id !== id));
      showToast('Photo removed from library', 'info');
    } catch {
      showToast('Delete failed', 'error');
    }
  }

  async function handleUpload(files: FileList | null, seg: LibSegment, folderName: string) {
    if (!files || !files.length) return;
    setUploading(true);
    let ok = 0, failed = 0;
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await compressImage(file, 1200, 0.82);
        const r2url = await uploadToR2(dataUrl);
        const entry = await addLibraryEntry({ designCode: '', folder: folderName, segment: seg, r2url, fileName: file.name });
        setEntries(prev => [...prev, entry]);
        ok++;
      } catch {
        failed++;
      }
    }
    setUploading(false);
    if (ok) showToast(`Uploaded ${ok} photo${ok !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}`, failed ? 'info' : 'success');
    else if (failed) showToast('Upload failed — check your connection', 'error');
  }

  const folders = useMemo(() => segment ? getFoldersForSegment(entries, registry, segment) : [], [entries, registry, segment]);
  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? folders.filter(f => f.name.toLowerCase().includes(q)) : folders;
  }, [folders, search]);

  const folderItems = useMemo(() => {
    if (!segment || !folder) return [];
    const q = search.trim().toLowerCase();
    const items = entries.filter(e => e.segment === segment && e.folder === folder);
    const filtered = q ? items.filter(e => e.designCode.toLowerCase().includes(q) || e.fileName.toLowerCase().includes(q)) : items;
    return [...filtered].sort((a, b) => (a.designCode || a.fileName).localeCompare(b.designCode || b.fileName, undefined, { numeric: true }));
  }, [entries, segment, folder, search]);

  if (loading) {
    return <div className="p-6 text-center text-white/40 animate-pulse">Loading library…</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button onClick={goRoot} className="text-sm font-semibold text-[#a89fff] bg-[#534AB7]/15 border border-[#534AB7]/40 rounded-lg px-3 py-1.5">🖼️ Library</button>
        {segment && (
          <>
            <span className="text-white/20">›</span>
            <button onClick={goSegment} className={`text-sm font-semibold rounded-lg px-3 py-1.5 border ${LIB_SEG_META[segment].bg} ${LIB_SEG_META[segment].border}`} style={{ color: LIB_SEG_META[segment].color }}>
              {LIB_SEG_META[segment].icon} {segment}
            </button>
          </>
        )}
        {folder && (
          <>
            <span className="text-white/20">›</span>
            <span className="text-sm font-semibold text-white">📁 {folder}</span>
          </>
        )}
      </div>

      {/* ── ROOT: segment cards ── */}
      {!segment && (
        <div>
          <p className="text-sm text-white/40 mb-4">{entries.length.toLocaleString()} photos permanently in cloud — organized by segment</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {LIB_SEGMENTS.map(seg => {
              const meta = LIB_SEG_META[seg];
              const imgs = entries.filter(e => e.segment === seg);
              const segFolders = getFoldersForSegment(entries, registry, seg);
              const previews = imgs.slice(0, 4).map(e => e.r2url);
              return (
                <button key={seg} onClick={() => selectSegment(seg)}
                  className={`text-left border rounded-2xl overflow-hidden hover:-translate-y-0.5 transition-transform ${meta.border}`}>
                  <div className={`px-4 py-3 flex items-center justify-between ${meta.bg}`}>
                    <span className="text-lg font-bold" style={{ color: meta.color }}>{meta.icon} {seg}</span>
                    <span className="text-xs font-semibold" style={{ color: meta.color }}>{segFolders.length} folder{segFolders.length !== 1 ? 's' : ''} · {imgs.length} photo{imgs.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid grid-cols-4 h-20 bg-white/5">
                    {previews.length ? previews.map((url, i) => <img key={i} src={url} className="w-full h-20 object-cover" alt="" />)
                      : <div className="col-span-4 flex items-center justify-center text-3xl text-white/10">{meta.icon}</div>}
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span className="text-white/50">Click to browse & manage</span>
                    <span className="font-semibold" style={{ color: meta.color }}>→</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SEGMENT: folder tiles ── */}
      {segment && !folder && (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <span className="text-sm font-semibold" style={{ color: LIB_SEG_META[segment].color }}>
              {LIB_SEG_META[segment].icon} {segment} — {folders.length} folder{folders.length !== 1 ? 's' : ''}
            </span>
            {canEdit && (
              <button onClick={() => handleNewFolder(segment)} className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5">➕ New Folder</button>
            )}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search folders in ${segment}…`}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm mb-4 focus:outline-none focus:border-[#534AB7]" />

          {filteredFolders.length === 0 ? (
            <p className="text-center py-10 text-white/30 text-sm">{search ? `No folders match "${search}"` : 'No folders yet — click ➕ New Folder to create one'}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredFolders.map(f => (
                <div key={f.name} className="border border-white/10 rounded-xl overflow-hidden hover:-translate-y-0.5 transition-transform">
                  <button onClick={() => selectFolder(f.name)} className="w-full h-24 bg-white/5 flex items-center justify-center overflow-hidden">
                    {f.preview ? <img src={f.preview} className="w-full h-full object-cover" alt="" /> : <span className="text-3xl">📁</span>}
                  </button>
                  <div className="px-2.5 py-2">
                    <button onClick={() => selectFolder(f.name)} className="text-xs font-semibold text-white truncate block w-full text-left">📁 {f.name}</button>
                    <p className="text-[10px] text-white/40">{f.count} photo{f.count !== 1 ? 's' : ''}</p>
                    {canEdit && (
                      <div className="flex gap-1 mt-1.5">
                        <button onClick={() => handleRenameFolder(segment, f.name, f.regId)} className="flex-1 text-[9px] bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/60">✏️ Rename</button>
                        <button onClick={() => handleDeleteFolder(segment, f.name, f.regId)} className="flex-1 text-[9px] bg-red-500/10 border border-red-500/30 rounded px-1 py-0.5 text-red-400">🗑️ Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FOLDER: photo grid ── */}
      {segment && folder && (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <span className="text-sm font-semibold text-white">{folderItems.length} photo{folderItems.length !== 1 ? 's' : ''}</span>
            {canEdit && (
              <label className={`text-xs font-semibold rounded-lg px-3 py-1.5 cursor-pointer transition-colors ${uploading ? 'bg-white/10 text-white/40' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
                {uploading ? 'Uploading…' : '+ Upload Here'}
                <input type="file" multiple accept="image/*" disabled={uploading} className="hidden"
                  onChange={e => { handleUpload(e.target.files, segment, folder); e.target.value = ''; }} />
              </label>
            )}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search in ${folder}…`}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm mb-4 focus:outline-none focus:border-[#534AB7]" />

          {folderItems.length === 0 ? (
            <p className="text-center py-10 text-white/30 text-sm">No photos{search ? ` matching "${search}"` : ''} in this folder.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {folderItems.map(e => (
                <div key={e._id} className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
                  <a href={e.r2url} target="_blank" rel="noreferrer" className="block h-20 bg-white/5">
                    <img src={e.r2url} className="w-full h-full object-cover" alt={e.designCode || e.fileName} loading="lazy" />
                  </a>
                  <div className="px-1.5 py-1.5">
                    <p className="text-[10px] font-semibold text-white truncate" title={e.designCode || e.fileName}>{e.designCode || e.fileName || '—'}</p>
                    {canEdit && (
                      <button onClick={() => handleDeletePhoto(e._id)} className="mt-1 w-full text-[9px] bg-red-500/10 border border-red-500/30 rounded px-1 py-0.5 text-red-400">Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
