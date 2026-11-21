/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/database';
import { generateId } from './id';
import type { Attachment } from '../types';

export const ATTACHMENT_PREFIX = 'attachment:';

function attachmentIdFromSource(source: string): string | null {
  if (!source.startsWith(ATTACHMENT_PREFIX)) return null;
  return source.slice(ATTACHMENT_PREFIX.length) || null;
}

/** True when a markdown image source points at a locally stored attachment. */
export function isAttachmentSource(source?: string | null): boolean {
  return !!source && attachmentIdFromSource(source) !== null;
}

async function encryptBytes(bytes: Uint8Array, key: CryptoKey): Promise<{ data: string; iv: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    bytes.buffer as ArrayBuffer
  );
  return {
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

async function decryptBytes(data: string, iv: string, key: CryptoKey): Promise<Uint8Array> {
  const raw = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (char) => char.charCodeAt(0));
  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    raw.buffer as ArrayBuffer
  );
  return new Uint8Array(plaintext);
}

/**
 * Saves an image/file for a note and returns the markdown snippet to insert.
 * When a vault key is supplied the bytes are encrypted before they touch
 * IndexedDB, so an encrypted note never leaves plaintext attachments behind.
 */
export async function saveAttachment(
  noteId: string,
  file: Blob,
  name: string,
  key?: CryptoKey | null
): Promise<string> {
  const id = generateId();
  const record: Attachment = {
    id,
    noteId,
    name: name || 'attachment',
    mime: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now(),
    encrypted: !!key
  };

  if (key) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encrypted = await encryptBytes(bytes, key);
    record.data = encrypted.data;
    record.iv = encrypted.iv;
  } else {
    record.blob = file;
  }

  await db.attachments.add(record);

  const label = name.replace(/\.[^.]+$/, '') || 'image';
  return `![${label}](${ATTACHMENT_PREFIX}${id})`;
}

/** Returns the readable bytes of an attachment, decrypting when necessary. */
export async function readAttachment(
  id: string,
  key?: CryptoKey | null
): Promise<{ blob: Blob; name: string; mime: string } | null> {
  const record = await db.attachments.get(id);
  if (!record) return null;

  if (record.encrypted) {
    if (!key || !record.data || !record.iv) return null;
    const bytes = await decryptBytes(record.data, record.iv, key);
    return {
      blob: new Blob([bytes.buffer as ArrayBuffer], { type: record.mime }),
      name: record.name,
      mime: record.mime
    };
  }

  if (!record.blob) return null;
  return { blob: record.blob, name: record.name, mime: record.mime };
}

const urlCache = new Map<string, string>();

/** Object URL for preview rendering (cached for the session). */
export async function getAttachmentObjectUrl(
  id: string,
  key?: CryptoKey | null
): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;

  const attachment = await readAttachment(id, key);
  if (!attachment) return null;

  const url = URL.createObjectURL(attachment.blob);
  urlCache.set(id, url);
  return url;
}

export function attachmentIdFromMarkdown(source: string): string | null {
  return attachmentIdFromSource(source);
}

export async function deleteAttachmentsForNote(noteId: string): Promise<void> {
  const records = await db.attachments.where('noteId').equals(noteId).toArray();
  for (const record of records) {
    const url = urlCache.get(record.id);
    if (url) {
      URL.revokeObjectURL(url);
      urlCache.delete(record.id);
    }
  }
  await db.attachments.where('noteId').equals(noteId).delete();
}

export async function clearAllAttachments(): Promise<void> {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  await db.attachments.clear();
}
