/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/database';
import { generateId } from './id';
import {
  calculateCharacterCount,
  calculateReadingTime,
  calculateWordCount,
  normalizeText,
  parseFrontmatter
} from './notesHelper';
import type { Note } from '../types';

export interface ImportFile {
  /** Path relative to the picked folder, e.g. "Projects/Design/Notes.md". */
  path: string;
  content: string;
}

export interface PlannedNote {
  folderPath: string | null;
  title: string;
  content: string;
  tags: string[];
}

export interface ImportPlan {
  /** Unique folder paths, parents included. */
  folders: string[];
  notes: PlannedNote[];
  skipped: number;
}

export interface ImportResult {
  notes: number;
  folders: number;
  skipped: number;
  duplicates: number;
}

const MARKDOWN_FILE = /\.(md|markdown|mdown)$/i;
const IGNORED_SEGMENTS = new Set(['node_modules', '__macosx']);

/** Only plain Markdown files outside hidden/system folders are imported. */
export function isImportablePath(path: string): boolean {
  const segments = path.split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  if (segments.some((segment) => segment.startsWith('.') || IGNORED_SEGMENTS.has(segment.toLowerCase()))) {
    return false;
  }
  return MARKDOWN_FILE.test(segments[segments.length - 1]);
}

/**
 * Obsidian-specific syntax that has no meaning in this editor is translated
 * into plain Markdown. Wiki links are kept: the editor understands [[links]].
 */
export function cleanObsidianBody(body: string): string {
  return body
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (_match, name: string) => `*[attachment: ${name.trim()}]*`)
    .replace(/^>\s*\[!(\w+)\][+-]?\s?/gm, '> ');
}

function tagsFromFrontmatter(metadata: Record<string, any>): string[] {
  const raw = metadata.tags ?? metadata.tag;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of list) {
    const tag = String(entry).replace(/^#/, '').trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

/** Builds the import plan without touching the database. */
export function planImport(files: ImportFile[]): ImportPlan {
  const folders = new Set<string>();
  const notes: PlannedNote[] = [];
  let skipped = 0;

  for (const file of files) {
    const path = file.path.replace(/\\/g, '/');
    if (!isImportablePath(path)) {
      skipped++;
      continue;
    }

    const segments = path.split('/').filter(Boolean);
    const fileName = segments[segments.length - 1];
    const folderPath = segments.slice(0, -1).join('/') || null;
    if (folderPath) {
      const parts = folderPath.split('/');
      for (let index = 1; index <= parts.length; index++) {
        folders.add(parts.slice(0, index).join('/'));
      }
    }

    const { metadata, contentOnly } = parseFrontmatter(file.content);
    const title =
      (typeof metadata.title === 'string' && metadata.title.trim()) ||
      fileName.replace(MARKDOWN_FILE, '').trim() ||
      'Untitled';

    notes.push({
      folderPath,
      title,
      content: cleanObsidianBody(contentOnly).replace(/^\n+/, ''),
      tags: tagsFromFrontmatter(metadata)
    });
  }

  return {
    folders: [...folders].sort((a, b) => a.split('/').length - b.split('/').length),
    notes,
    skipped
  };
}

function noteFingerprint(title: string, content: string): string {
  return `${normalizeText(title)}|${content.length}|${content.slice(0, 160)}`;
}

/**
 * Merges a folder of Markdown files into the workspace. Existing folder names
 * are reused (matching parent + name) and notes that already exist with the
 * same title and body are skipped, so importing twice is safe.
 */
export async function importMarkdownFolder(files: ImportFile[]): Promise<ImportResult> {
  const plan = planImport(files);

  const existingFolders = await db.folders.toArray();
  const folderKey = (parentId: string | null, name: string) => `${parentId ?? ''}/${normalizeText(name)}`;
  const folderByKey = new Map(existingFolders.map((folder) => [folderKey(folder.parentId, folder.name), folder]));
  const folderIdByPath = new Map<string, string>();
  let createdFolders = 0;

  for (const path of plan.folders) {
    const segments = path.split('/');
    let parentId: string | null = null;
    for (let index = 0; index < segments.length; index++) {
      const subPath = segments.slice(0, index + 1).join('/');
      const cached = folderIdByPath.get(subPath);
      if (cached) {
        parentId = cached;
        continue;
      }
      const key = folderKey(parentId, segments[index]);
      let folder = folderByKey.get(key);
      if (!folder) {
        const now = Date.now();
        folder = {
          id: generateId(),
          name: segments[index],
          parentId,
          createdAt: now,
          updatedAt: now
        };
        await db.folders.add(folder);
        folderByKey.set(key, folder);
        createdFolders++;
      }
      folderIdByPath.set(subPath, folder.id);
      parentId = folder.id;
    }
  }

  const existingNotes = await db.notes.toArray();
  const existingFingerprints = new Set(
    existingNotes.filter((note) => !note.deletedAt).map((note) => noteFingerprint(note.title, note.content))
  );
  const existingTags = new Set((await db.tags.toArray()).map((tag) => normalizeText(tag.name)));

  let importedNotes = 0;
  let duplicates = 0;

  for (const planned of plan.notes) {
    const fingerprint = noteFingerprint(planned.title, planned.content);
    if (existingFingerprints.has(fingerprint)) {
      duplicates++;
      continue;
    }

    const now = Date.now();
    const note: Note = {
      id: generateId(),
      title: planned.title,
      content: planned.content,
      folderId: planned.folderPath ? folderIdByPath.get(planned.folderPath) ?? null : null,
      tags: planned.tags,
      isFavorite: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      wordCount: calculateWordCount(planned.content),
      characterCount: calculateCharacterCount(planned.content),
      readingTime: calculateReadingTime(planned.content),
      deletedAt: null
    };
    await db.notes.add(note);
    existingFingerprints.add(fingerprint);
    importedNotes++;

    for (const tag of planned.tags) {
      const key = normalizeText(tag);
      if (existingTags.has(key)) continue;
      existingTags.add(key);
      await db.tags.add({
        id: generateId(),
        name: tag,
        color: '#3b82f6',
        createdAt: now
      });
    }
  }

  return {
    notes: importedNotes,
    folders: createdFolders,
    skipped: plan.skipped,
    duplicates
  };
}
