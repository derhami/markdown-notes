/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/database';
import { decryptNotePayload, encryptNotePayload } from './crypto';
import { calculateWordCount } from './notesHelper';
import { generateId } from './id';
import type { NoteVersion } from '../types';

/** How many snapshots a single note keeps. Old ones are pruned silently. */
export const MAX_VERSIONS_PER_NOTE = 30;
/** Two snapshots closer than this are merged unless the text changed a lot. */
const MIN_GAP_MS = 2 * 60 * 1000;
const MIN_CHARS_SINCE_LAST = 40;

export interface VersionSnapshot {
  title: string;
  content: string;
}

async function latestVersion(noteId: string): Promise<NoteVersion | undefined> {
  const versions = await db.noteVersions.where('noteId').equals(noteId).toArray();
  return versions.sort((a, b) => b.createdAt - a.createdAt)[0];
}

async function plaintextOf(version: NoteVersion, key?: CryptoKey | null): Promise<string | null> {
  if (version.payload) {
    if (!key) return null;
    const separator = version.payload.indexOf(':');
    if (separator === -1) return null;
    const iv = version.payload.slice(0, separator);
    const ciphertext = version.payload.slice(separator + 1);
    const decrypted = await decryptNotePayload(ciphertext, iv, key);
    return decrypted?.content ?? null;
  }
  return version.content ?? null;
}

/**
 * Stores a snapshot of the note as it is now. Encrypted notes are snapshotted
 * with the vault master key so history never writes plaintext to disk.
 */
export async function recordNoteVersion(
  noteId: string,
  title: string,
  content: string,
  key?: CryptoKey | null
): Promise<void> {
  if (!noteId) return;

  const now = Date.now();
  const latest = await latestVersion(noteId);

  if (latest) {
    const previous = await plaintextOf(latest, key);
    if (previous === content && latest.title === title) return;

    const comparable = previous?.length ?? 0;
    if (now - latest.createdAt < MIN_GAP_MS && Math.abs(content.length - comparable) < MIN_CHARS_SINCE_LAST) {
      return;
    }
  }

  const version: NoteVersion = {
    id: generateId(),
    noteId,
    title,
    createdAt: now,
    wordCount: calculateWordCount(content)
  };

  if (key) {
    const encrypted = await encryptNotePayload(title, content, [], key);
    version.payload = `${encrypted.iv}:${encrypted.ciphertext}`;
  } else {
    version.content = content;
  }

  await db.noteVersions.add(version);

  const versions = await db.noteVersions.where('noteId').equals(noteId).toArray();
  if (versions.length > MAX_VERSIONS_PER_NOTE) {
    const stale = versions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(MAX_VERSIONS_PER_NOTE);
    await db.noteVersions.bulkDelete(stale.map((entry) => entry.id));
  }
}

export async function listNoteVersions(noteId: string): Promise<NoteVersion[]> {
  const versions = await db.noteVersions.where('noteId').equals(noteId).toArray();
  return versions.sort((a, b) => b.createdAt - a.createdAt);
}

/** Reads one snapshot, decrypting it when the note belongs to the vault. */
export async function readNoteVersion(
  version: NoteVersion,
  key?: CryptoKey | null
): Promise<VersionSnapshot | null> {
  const content = await plaintextOf(version, key);
  if (content === null) return null;
  return { title: version.title, content };
}

export async function deleteVersionsForNote(noteId: string): Promise<void> {
  await db.noteVersions.where('noteId').equals(noteId).delete();
}

export async function clearAllVersions(): Promise<void> {
  await db.noteVersions.clear();
}
