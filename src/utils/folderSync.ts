/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/database';
import type { Folder, Note } from '../types';
import { generateId } from './id';
import {
  calculateCharacterCount,
  calculateReadingTime,
  calculateWordCount,
  normalizeText,
  parseFrontmatter,
  stringifyFrontmatter
} from './notesHelper';
import { recordNoteVersion } from './versions';

/** A Markdown file as it exists on the other side of the mirror. */
export interface RemoteFile {
  /** Path relative to the sync root, e.g. "Projects/Design.md". */
  path: string;
  content: string;
  modifiedAt: number;
}

/**
 * A writable Markdown mirror. The browser implementation uses the File System
 * Access API; the Android shell uses the Capacitor Filesystem plugin, because
 * Android WebView never exposes `showDirectoryPicker`.
 */
export interface SyncAdapter {
  kind: 'browser' | 'device';
  label: string;
  listFiles(): Promise<RemoteFile[]>;
  writeFile(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

export interface SyncReport {
  at: number;
  scanned: number;
  pushed: number;
  pulled: number;
  imported: number;
  removed: number;
  unchanged: number;
  skipped: number;
  conflicts: number;
  errors: string[];
}

const MARKDOWN_FILE = /\.(md|markdown|mdown)$/i;
const IGNORED_SEGMENTS = new Set([
  '.obsidian',
  '.trash',
  '.git',
  '.stfolder',
  '.stversions',
  'node_modules',
  '__macosx'
]);
const MAX_SEGMENT_LENGTH = 80;

/** Only real Markdown files outside hidden/system folders take part. */
export function isSyncablePath(path: string): boolean {
  const segments = path.split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  if (
    segments.some(
      (segment) => segment.startsWith('.') || IGNORED_SEGMENTS.has(segment.toLowerCase())
    )
  ) {
    return false;
  }
  return MARKDOWN_FILE.test(segments[segments.length - 1]);
}

function sanitizeSegment(value: string, fallback = 'Folder'): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH)
    .trim();
  return cleaned || fallback;
}

function folderSegments(folderId: string | null, folders: Map<string, Folder>): string[] {
  const segments: string[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = folders.get(current);
    if (!folder) break;
    segments.unshift(sanitizeSegment(folder.name));
    current = folder.parentId;
  }
  return segments;
}

function notePath(note: Note, folders: Map<string, Folder>): string {
  const directory = folderSegments(note.folderId, folders).join('/');
  const base = sanitizeSegment(note.title || 'Untitled', 'Untitled');
  return directory ? `${directory}/${base}.md` : `${base}.md`;
}

/**
 * Builds a stable path per note. Two notes with the same title and folder get
 * a numbered suffix instead of overwriting each other.
 */
export function assignNotePaths(
  notes: Note[],
  folders: Folder[],
  preferred?: Map<string, string>
): Map<string, string> {
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const used = new Set<string>();
  const paths = new Map<string, string>();

  const ordered = [...notes].sort((a, b) => a.id.localeCompare(b.id));
  for (const note of ordered) {
    const preferredPath = preferred?.get(note.id);
    const desired = notePath(note, folderMap);
    const directoryOf = (path: string) =>
      path.includes('/') ? path.slice(0, path.lastIndexOf('/')).toLowerCase() : '';
    const fileNameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    const candidatePath =
      preferredPath &&
      directoryOf(preferredPath) === directoryOf(desired) &&
      fileNameOf(preferredPath) === fileNameOf(desired)
        ? preferredPath
        : desired;
    let candidate = candidatePath;

    if (used.has(candidate.toLowerCase())) {
      const suffix = desired.replace(/\.md$/i, '');
      let counter = 2;
      candidate = `${suffix} (${counter}).md`;
      while (used.has(candidate.toLowerCase())) {
        counter += 1;
        candidate = `${suffix} (${counter}).md`;
      }
    }

    used.add(candidate.toLowerCase());
    paths.set(note.id, candidate);
  }

  return paths;
}

function renderNoteFile(note: Note): string {
  return stringifyFrontmatter(note.content ?? '', {
    id: note.id,
    title: note.title || 'Untitled',
    tags: note.tags ?? [],
    created: new Date(note.createdAt || Date.now()).toISOString(),
    updated: note.updatedAt || Date.now()
  });
}

interface RemoteNote extends RemoteFile {
  id: string | null;
  updatedAt: number;
  title: string;
  tags: string[];
  content: string;
  dirSegments: string[];
  createdAt: number | null;
}

function parseRemoteFile(file: RemoteFile): RemoteNote {
  const { metadata, contentOnly } = parseFrontmatter(file.content);
  const segments = file.path.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] ?? file.path;
  const rawTags = metadata.tags ?? metadata.tag;
  const tags = (Array.isArray(rawTags) ? rawTags : rawTags ? String(rawTags).split(/[,\s]+/) : [])
    .map((tag: unknown) => String(tag).replace(/^#/, '').trim())
    .filter(Boolean);

  const updatedAt = Number(metadata.updated);
  const createdAt = Number(metadata.created ?? metadata.createdAt);

  return {
    ...file,
    id: typeof metadata.id === 'string' && metadata.id.trim() ? metadata.id.trim() : null,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : file.modifiedAt,
    title:
      (typeof metadata.title === 'string' && metadata.title.trim()) ||
      fileName.replace(MARKDOWN_FILE, '').trim() ||
      'Untitled',
    tags,
    content: contentOnly.replace(/^\n+/, ''),
    dirSegments: segments.slice(0, -1),
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null
  };
}

async function ensureTags(tags: string[]): Promise<void> {
  const known = new Set((await db.tags.toArray()).map((tag) => tag.name.toLowerCase()));
  for (const tag of tags) {
    if (!tag || known.has(tag.toLowerCase())) continue;
    known.add(tag.toLowerCase());
    await db.tags.add({
      id: generateId(),
      name: tag,
      color: 'var(--accent)',
      createdAt: Date.now()
    });
  }
}

function createFolderResolver() {
  const known = new Map<string, string>();
  return async (segments: string[]): Promise<string | null> => {
    let parentId: string | null = null;
    for (const segment of segments) {
      const key = `${parentId ?? ''}/${segment.toLowerCase()}`;
      const cached = known.get(key);
      if (cached) {
        parentId = cached;
        continue;
      }
      const existing = await db.folders
        .filter(
          (folder) =>
            folder.parentId === parentId &&
            folder.name.toLowerCase() === segment.toLowerCase()
        )
        .first();
      if (existing) {
        known.set(key, existing.id);
        parentId = existing.id;
        continue;
      }
      const now = Date.now();
      const folder: Folder = {
        id: generateId(),
        name: segment,
        parentId,
        createdAt: now,
        updatedAt: now
      };
      await db.folders.add(folder);
      known.set(key, folder.id);
      parentId = folder.id;
    }
    return parentId;
  };
}

/**
 * Runs a full two-way pass:
 *  1. every unlocked local note is written as `<folder>/<title>.md`;
 *  2. newer remote files are merged back into the local database;
 *  3. unknown Markdown files in the mirror are imported as notes;
 *  4. files that belong to removed or trashed notes are deleted.
 *
 * Conflicts are resolved by timestamp (newest wins) and the losing local text
 * is snapshotted into version history first, so nothing is silently lost.
 */
export async function runFolderSync(
  adapter: SyncAdapter,
  options: { onProgress?: (message: string) => void } = {}
): Promise<SyncReport> {
  const startedAt = Date.now();
  const report: SyncReport = {
    at: startedAt,
    scanned: 0,
    pushed: 0,
    pulled: 0,
    imported: 0,
    removed: 0,
    unchanged: 0,
    skipped: 0,
    conflicts: 0,
    errors: []
  };

  const notify = (message: string) => {
    try {
      options.onProgress?.(message);
    } catch {
      /* progress is best-effort */
    }
  };

  const [allNotes, folders, entries] = await Promise.all([
    db.notes.toArray(),
    db.folders.toArray(),
    db.syncIndex.toArray()
  ]);

  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const indexByNote = new Map(entries.map((entry) => [entry.noteId, entry]));
  const localById = new Map(allNotes.map((note) => [note.id, note]));
  const activeNotes = allNotes.filter((note) => !note.deletedAt);
  // Secure notes never touch the disk in plaintext, not even while unlocked.
  const syncable = activeNotes.filter((note) => !note.isEncrypted);
  report.skipped += activeNotes.length - syncable.length;

  notify('Reading the folder…');
  const remoteFiles = (await adapter.listFiles()).filter((file) => isSyncablePath(file.path));
  report.scanned = remoteFiles.length;

  const remoteByPath = new Map<string, RemoteNote>();
  for (const file of remoteFiles) {
    remoteByPath.set(file.path.toLowerCase(), parseRemoteFile(file));
  }
  const remoteById = new Map<string, RemoteNote>();
  for (const remote of remoteByPath.values()) {
    if (remote.id && !remoteById.has(remote.id)) remoteById.set(remote.id, remote);
  }

  const preferred = new Map<string, string>();
  for (const entry of entries) preferred.set(entry.noteId, entry.path);
  const paths = assignNotePaths(syncable, folders, preferred);

  // Never clobber a Markdown file that belongs to a different note.
  const taken = new Set([...paths.values()].map((path) => path.toLowerCase()));
  for (const note of syncable) {
    const path = paths.get(note.id)!;
    const remote = remoteByPath.get(path.toLowerCase());
    const indexedPath = indexByNote.get(note.id)?.path?.toLowerCase();
    if (remote && remote.id && remote.id !== note.id && indexedPath !== path.toLowerCase()) {
      const base = path.replace(/\.md$/i, '');
      let counter = 2;
      let candidate = `${base} (${counter}).md`;
      while (taken.has(candidate.toLowerCase())) {
        counter += 1;
        candidate = `${base} (${counter}).md`;
      }
      taken.add(candidate.toLowerCase());
      paths.set(note.id, candidate);
    }
  }

  const consumed = new Set<string>();
  const resolveFolderPath = createFolderResolver();

  const push = async (note: Note, path: string) => {
    await adapter.writeFile(path, renderNoteFile(note));
    const previous = indexByNote.get(note.id);
    if (previous && previous.path.toLowerCase() !== path.toLowerCase()) {
      await adapter.removeFile(previous.path).catch(() => undefined);
    }
    const stamp = Date.now();
    await db.syncIndex.put({
      noteId: note.id,
      path,
      syncedAt: stamp,
      remoteModified: 0
    });
    indexByNote.set(note.id, { noteId: note.id, path, syncedAt: stamp, remoteModified: 0 });
    report.pushed += 1;
  };

  const pull = async (note: Note, remote: RemoteNote) => {
    if (note.isEncrypted) {
      report.skipped += 1;
      return;
    }
    await recordNoteVersion(note.id, note.title, note.content, null).catch(() => undefined);
    const folderId = await resolveFolderPath(remote.dirSegments);
    await ensureTags(remote.tags);
    await db.notes.update(note.id, {
      title: remote.title,
      content: remote.content,
      folderId,
      tags: remote.tags,
      updatedAt: remote.updatedAt,
      wordCount: calculateWordCount(remote.content),
      characterCount: calculateCharacterCount(remote.content),
      readingTime: calculateReadingTime(remote.content)
    });
    const stamp = Date.now();
    await db.syncIndex.put({
      noteId: note.id,
      path: remote.path,
      syncedAt: stamp,
      remoteModified: remote.modifiedAt
    });
    indexByNote.set(note.id, {
      noteId: note.id,
      path: remote.path,
      syncedAt: stamp,
      remoteModified: remote.modifiedAt
    });
    report.pulled += 1;
  };

  notify(`Mirroring ${syncable.length} note${syncable.length === 1 ? '' : 's'}…`);

  for (const note of syncable) {
    const path = paths.get(note.id)!;
    const entry = indexByNote.get(note.id);
    const remote = remoteById.get(note.id) ?? remoteByPath.get(path.toLowerCase());

    if (remote) consumed.add(remote.path.toLowerCase());

    try {
      if (!remote) {
        await push(note, path);
        continue;
      }

      const base = entry?.syncedAt ?? 0;
      const localChanged = note.updatedAt > base;
      const remoteChanged = remote.updatedAt > base;

      if (localChanged && remoteChanged) {
        report.conflicts += 1;
        if (note.updatedAt >= remote.updatedAt) {
          await push(note, path);
        } else {
          await pull(note, remote);
        }
      } else if (localChanged) {
        await push(note, path);
      } else if (remoteChanged) {
        await pull(note, remote);
      } else {
        report.unchanged += 1;
      }
    } catch (error) {
      report.errors.push(`${path}: ${(error as Error).message}`);
    }
  }

  notify('Checking the folder for new files…');

  for (const remote of remoteByPath.values()) {
    if (consumed.has(remote.path.toLowerCase())) continue;

    const local = remote.id ? localById.get(remote.id) : undefined;
    if (local) {
      // Encrypted or trashed note with the same id: leave the file untouched.
      report.skipped += 1;
      continue;
    }

    const duplicate = syncable.find(
      (note) =>
        normalizeText(note.title) === normalizeText(remote.title) &&
        folderSegments(note.folderId, folderMap).join('/').toLowerCase() ===
          remote.dirSegments.join('/').toLowerCase() &&
        (note.content ?? '').trim() === remote.content.trim()
    );

    if (duplicate) {
      const stamp = Date.now();
      await db.syncIndex.put({
        noteId: duplicate.id,
        path: remote.path,
        syncedAt: stamp,
        remoteModified: remote.modifiedAt
      });
      report.unchanged += 1;
      consumed.add(remote.path.toLowerCase());
      continue;
    }

    try {
      const folderId = await resolveFolderPath(remote.dirSegments);
      await ensureTags(remote.tags);
      const now = Date.now();
      const id = remote.id && !localById.has(remote.id) ? remote.id : generateId();
      await db.notes.add({
        id,
        title: remote.title,
        content: remote.content,
        folderId,
        tags: remote.tags,
        isFavorite: false,
        isPinned: false,
        createdAt: remote.createdAt ?? Math.min(now, remote.updatedAt),
        updatedAt: remote.updatedAt,
        wordCount: calculateWordCount(remote.content),
        characterCount: calculateCharacterCount(remote.content),
        readingTime: calculateReadingTime(remote.content),
        deletedAt: null
      });
      await db.syncIndex.put({
        noteId: id,
        path: remote.path,
        syncedAt: Date.now(),
        remoteModified: remote.modifiedAt
      });
      report.imported += 1;
      consumed.add(remote.path.toLowerCase());
    } catch (error) {
      report.errors.push(`${remote.path}: ${(error as Error).message}`);
    }
  }

  // Drop files whose note was trashed or deleted.
  for (const entry of entries) {
    const note = localById.get(entry.noteId);
    if (note && !note.deletedAt) continue;
    try {
      await adapter.removeFile(entry.path);
      report.removed += 1;
    } catch {
      /* the file may already be gone */
    }
    await db.syncIndex.delete(entry.noteId);
  }

  return report;
}

/* ------------------------------------------------------------------ *
 * Browser adapter (File System Access API, desktop Chromium)
 * ------------------------------------------------------------------ */

export function supportsBrowserFolderSync(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

export async function pickBrowserSyncFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({
    id: 'markdown-notes-sync',
    mode: 'readwrite'
  });
  await db.syncHandles.put({ id: 'browser', handle });
  return handle as FileSystemDirectoryHandle;
}

export async function loadBrowserSyncFolder(): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.syncHandles.get('browser');
  return (row?.handle as FileSystemDirectoryHandle) ?? null;
}

export async function clearBrowserSyncFolder(): Promise<void> {
  await db.syncHandles.delete('browser');
}

export async function ensureBrowserPermission(
  handle: FileSystemDirectoryHandle,
  request = false
): Promise<boolean> {
  const options = { mode: 'readwrite' } as any;
  const query = (handle as any).queryPermission;
  if (typeof query === 'function' && (await query.call(handle, options)) === 'granted') {
    return true;
  }
  if (!request) return false;
  const requestFn = (handle as any).requestPermission;
  if (typeof requestFn !== 'function') return false;
  return (await requestFn.call(handle, options)) === 'granted';
}

async function resolveDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean
): Promise<FileSystemDirectoryHandle> {
  let directory = root;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }
  return directory;
}

export function createBrowserAdapter(handle: FileSystemDirectoryHandle): SyncAdapter {
  return {
    kind: 'browser',
    label: handle.name ,
    async listFiles() {
      const files: RemoteFile[] = [];
      const walk = async (directory: FileSystemDirectoryHandle, prefix: string) => {
        for await (const [name, entry] of (directory as any).entries()) {
          if (name.startsWith('.') || IGNORED_SEGMENTS.has(name.toLowerCase())) continue;
          const path = prefix ? `${prefix}/${name}` : name;
          if (entry.kind === 'directory') {
            await walk(entry as FileSystemDirectoryHandle, path);
          } else if (MARKDOWN_FILE.test(name)) {
            const file = await (entry as FileSystemFileHandle).getFile();
            files.push({ path, content: await file.text(), modifiedAt: file.lastModified });
          }
        }
      };
      await walk(handle, '');
      return files;
    },
    async writeFile(path, content) {
      const segments = path.split('/').filter(Boolean);
      const fileName = segments.pop();
      if (!fileName) return;
      const directory = await resolveDirectory(handle, segments, true);
      const fileHandle = await directory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    },
    async removeFile(path) {
      const segments = path.split('/').filter(Boolean);
      const fileName = segments.pop();
      if (!fileName) return;
      const directory = await resolveDirectory(handle, segments, false);
      await directory.removeEntry(fileName).catch(() => undefined);
    }
  };
}

/* ------------------------------------------------------------------ *
 * Device adapter (Capacitor Filesystem inside the Android shell)
 * ------------------------------------------------------------------ */

export const DEVICE_SYNC_FOLDER = 'Markdown Notes';
export const DEVICE_SYNC_LABEL = `Documents/${DEVICE_SYNC_FOLDER}`;

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
}

async function filesystemModule() {
  return import('@capacitor/filesystem');
}

/**
 * Prepares `Documents/Markdown Notes`. On Android 10 and older this asks for
 * the legacy storage permission; on Android 11+ the app owns the folder it
 * creates, so no prompt is needed.
 */
export async function prepareDeviceSyncFolder(): Promise<string> {
  const { Filesystem, Directory } = await filesystemModule();
  try {
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage !== 'granted') {
      await Filesystem.requestPermissions();
    }
  } catch {
    /* permission state is advisory; the write itself is the real test */
  }
  try {
    await Filesystem.mkdir({
      path: DEVICE_SYNC_FOLDER,
      directory: Directory.Documents,
      recursive: true
    });
  } catch {
    /* the folder already exists */
  }
  return DEVICE_SYNC_LABEL;
}

export function createDeviceAdapter(): SyncAdapter {
  const readDirectory = async (
    path: string,
    prefix: string,
    out: RemoteFile[],
    depth: number
  ): Promise<void> => {
    if (depth > 10) return;
    const { Filesystem, Directory, Encoding } = await filesystemModule();
    let listing;
    try {
      listing = await Filesystem.readdir({ path, directory: Directory.Documents });
    } catch {
      return;
    }
    for (const entry of listing.files) {
      if (!entry.name || entry.name.startsWith('.') || IGNORED_SEGMENTS.has(entry.name.toLowerCase())) {
        continue;
      }
      const childPath = `${path}/${entry.name}`;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.type === 'directory') {
        await readDirectory(childPath, relative, out, depth + 1);
        continue;
      }
      if (!MARKDOWN_FILE.test(entry.name)) continue;
      try {
        const result = await Filesystem.readFile({
          path: childPath,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
        out.push({
          path: relative,
          content: typeof result.data === 'string' ? result.data : '',
          modifiedAt: (entry as any).mtime ?? Date.now()
        });
      } catch {
        /* an unreadable file is skipped, not fatal */
      }
    }
  };

  return {
    kind: 'device',
    label: DEVICE_SYNC_LABEL,
    async listFiles() {
      const files: RemoteFile[] = [];
      await readDirectory(DEVICE_SYNC_FOLDER, '', files, 0);
      return files;
    },
    async writeFile(path, content) {
      const { Filesystem, Directory, Encoding } = await filesystemModule();
      await Filesystem.writeFile({
        path: `${DEVICE_SYNC_FOLDER}/${path}`,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true
      });
    },
    async removeFile(path) {
      const { Filesystem, Directory } = await filesystemModule();
      await Filesystem.deleteFile({
        path: `${DEVICE_SYNC_FOLDER}/${path}`,
        directory: Directory.Documents
      });
    }
  };
}

/** Convenience helper used by the settings screen summary. */
export function describeSyncReport(report: SyncReport): string {
  const parts: string[] = [];
  if (report.pushed) parts.push(`${report.pushed} written`);
  if (report.pulled) parts.push(`${report.pulled} updated`);
  if (report.imported) parts.push(`${report.imported} imported`);
  if (report.removed) parts.push(`${report.removed} removed`);
  if (!parts.length) parts.push(`${report.unchanged} already in sync`);
  if (report.skipped) parts.push(`${report.skipped} secure/ignored`);
  if (report.conflicts) parts.push(`${report.conflicts} conflict${report.conflicts === 1 ? '' : 's'} resolved`);
  return parts.join(' · ');
}
