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
