import { db } from './firebase';

// ─── Central image library — stored at Firebase /imageLibrary + /imageFolders,
// entirely separate from /appData. Mirrors Phase 1's library system exactly
// (bangle_v19.html ~L2235). Photos live permanently in R2 (Cloudflare object
// storage); this is just a searchable, organized index of their URLs.

export const LIB_SEGMENTS = ['CNC', 'Dye Gold'] as const;
export type LibSegment = typeof LIB_SEGMENTS[number];

export const LIB_SEG_META: Record<LibSegment, { icon: string; color: string; bg: string; border: string }> = {
  'CNC':      { icon: '⚙️', color: '#a89fff', bg: 'bg-[#534AB7]/15', border: 'border-[#534AB7]/40' },
  'Dye Gold': { icon: '✨', color: '#facc15', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
};

export interface LibEntry {
  _id: string;
  designCode: string;
  folder: string;
  segment: LibSegment;
  r2url: string;
  fileName: string;
  uploadedAt: number;
}

export interface LibFolderReg {
  _id: string;
  name: string;
  segment: LibSegment;
  createdAt: number;
}

const LIB_PATH = 'imageLibrary';
const FOLDERS_PATH = 'imageFolders';

export async function fetchLibrary(): Promise<LibEntry[]> {
  const raw = await db.get<Record<string, Omit<LibEntry, '_id'>>>(LIB_PATH);
  if (!raw) return [];
  return Object.entries(raw).map(([id, v]) => ({ ...v, _id: id, segment: (v.segment as LibSegment) || 'CNC' }));
}

export async function fetchFolderRegistry(): Promise<LibFolderReg[]> {
  const raw = await db.get<Record<string, Omit<LibFolderReg, '_id'>>>(FOLDERS_PATH);
  if (!raw) return [];
  return Object.entries(raw).map(([id, v]) => ({ ...v, _id: id }));
}

function newKey(): string {
  return `-lib${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function addLibraryEntry(entry: { designCode: string; folder: string; segment: LibSegment; r2url: string; fileName: string }): Promise<LibEntry> {
  const id = newKey();
  const full = { ...entry, uploadedAt: Date.now() };
  await db.set(`${LIB_PATH}/${id}`, full);
  return { ...full, _id: id };
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  await db.delete(`${LIB_PATH}/${id}`);
}

// Bulk-add many entries in one round trip (ports Phase 1's _batchAddLibraryEntries()
// exactly — a single multi-path PATCH instead of N individual writes). Used by
// both folder import and R2 sync, which can add hundreds/thousands of rows.
export async function batchAddLibraryEntries(
  entries: Array<{ designCode: string; folder: string; segment: LibSegment; r2url: string; fileName: string; uploadedAt?: number }>,
): Promise<LibEntry[]> {
  if (!entries.length) return [];
  const updates: Record<string, unknown> = {};
  const created: LibEntry[] = [];
  entries.forEach(e => {
    const id = newKey();
    const full = { ...e, uploadedAt: e.uploadedAt ?? Date.now() };
    updates[`${LIB_PATH}/${id}`] = full;
    created.push({ ...full, _id: id });
  });
  await db.update('', updates);
  return created;
}

// Phase 1 defines _LIB_SKIP_FOLDERS/_LIB_SKIP_FILES regexes (Picasa originals,
// thumbs.db, .DS_Store, etc) but — per its own UI copy ("Nothing is filtered
// or skipped", bangle_v19.html ~L3081/3119) and a code trace confirming
// neither regex is ever actually referenced anywhere — they're dead code: the
// real live behavior is upload everything you select, no filtering. Matched
// here rather than the unused regexes, so this behaves like the real app.
export interface ImportPlanItem { file: File; folder: string; designCode: string; fileName: string }

// Turns a FileList (from a webkitdirectory or plain multi-file <input>) into
// an upload plan — one item per file, with its target library folder and
// design code derived from the folder structure. Ports Phase 1's
// _libImportFiles() planning step exactly.
export function planLibraryImport(files: FileList, forceFolder: string | null): ImportPlanItem[] {
  const plan: ImportPlanItem[] = [];
  Array.from(files).forEach(f => {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const parts = rel.split('/');

    let folder: string, designCode: string;
    if (forceFolder) {
      folder = forceFolder;
      designCode = f.name.replace(/\.[^.]+$/, '').trim();
    } else if (parts.length >= 3) {
      folder = parts.slice(1, -1).join('/');
      designCode = parts[parts.length - 1].replace(/\.[^.]+$/, '').trim();
    } else if (parts.length === 2) {
      folder = 'General';
      designCode = parts[1].replace(/\.[^.]+$/, '').trim();
    } else {
      folder = 'General';
      designCode = f.name.replace(/\.[^.]+$/, '').trim();
    }
    plan.push({ file: f, folder, designCode, fileName: f.name });
  });
  return plan;
}

export async function registerFolder(seg: LibSegment, name: string): Promise<LibFolderReg> {
  const id = newKey();
  const entry = { name, segment: seg, createdAt: Date.now() };
  await db.set(`${FOLDERS_PATH}/${id}`, entry);
  return { ...entry, _id: id };
}

export async function unregisterFolder(id: string): Promise<void> {
  await db.delete(`${FOLDERS_PATH}/${id}`);
}

// Merges image-derived folders (any folder with photos) with the registry
// (tracks empty folders too) — mirrors _libGetFolders() exactly.
export interface FolderTile {
  name: string;
  count: number;
  preview: string | null;
  regId: string | null;
}

// ─── Bulk move / copy (ports Phase 1's _libExecuteMove()) ────────────────────
// Move: a single multi-path PATCH updates segment+folder on every selected
// entry in one round trip (mirrors Phase 1's root-level PATCH with
// "imageLibrary/<id>/segment" style keys). Copy: creates new entries pointing
// at the same r2url (photos live permanently in R2 either way — a "copy" is
// just a second index row, no re-upload).
export async function moveLibraryEntries(ids: string[], toSeg: LibSegment, toFolder: string): Promise<void> {
  const updates: Record<string, unknown> = {};
  ids.forEach(id => {
    updates[`${LIB_PATH}/${id}/segment`] = toSeg;
    updates[`${LIB_PATH}/${id}/folder`] = toFolder;
  });
  await db.update('', updates);
}

export async function copyLibraryEntries(ids: string[], toSeg: LibSegment, toFolder: string, entries: LibEntry[]): Promise<LibEntry[]> {
  const toCopy = ids.map(id => entries.find(e => e._id === id)).filter((e): e is LibEntry => !!e);
  const copies = await Promise.all(toCopy.map(e => addLibraryEntry({
    designCode: e.designCode || '', folder: toFolder, segment: toSeg, r2url: e.r2url, fileName: e.fileName || '',
  })));
  return copies;
}

export function getFoldersForSegment(entries: LibEntry[], registry: LibFolderReg[], seg: LibSegment): FolderTile[] {
  const map = new Map<string, FolderTile>();
  entries.filter(e => e.segment === seg).forEach(e => {
    const f = e.folder || 'General';
    if (!map.has(f)) map.set(f, { name: f, count: 0, preview: null, regId: null });
    const tile = map.get(f)!;
    tile.count++;
    if (!tile.preview) tile.preview = e.r2url;
  });
  registry.filter(f => f.segment === seg).forEach(f => {
    if (!map.has(f.name)) map.set(f.name, { name: f.name, count: 0, preview: null, regId: f._id });
    else map.get(f.name)!.regId = f._id;
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
