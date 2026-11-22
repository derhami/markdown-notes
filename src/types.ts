/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string | null; // null means root
  tags: string[]; // array of tag names
  isFavorite: boolean;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  wordCount: number;
  characterCount: number;
  readingTime: number; // in minutes
  deletedAt: number | null; // timestamp if deleted, null if active
  isArchived?: boolean; // Archived flag
  isEncrypted?: boolean; // Encryption flag
  isHidden?: boolean; // Hidden flag
  encryptedContent?: string; // Encrypted content payload (ciphertext)
  encryptionIv?: string; // Random initialization vector (IV)
  encryptionSalt?: string; // Salt used for key derivation of this note if different or generic
}

export interface Attachment {
  id: string;
  noteId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  encrypted: boolean;
  /** Plain bytes for notes that are not encrypted. */
  blob?: Blob;
  /** Base64 ciphertext + iv when the note lives in the vault. */
  data?: string;
  iv?: string;
}

export interface SyncIndexEntry {
  noteId: string;
  path: string;
  syncedAt: number;
  remoteModified: number;
}

export interface SyncHandleRow {
  id: string;
  // A FileSystemDirectoryHandle is structured-cloneable and survives IndexedDB.
  handle: any;
}

export interface NoteVersion {
  id: string;
  noteId: string;
  title: string;
  createdAt: number;
  wordCount: number;
  /** Plaintext snapshot. Present only for notes that are not encrypted. */
  content?: string;
  /** Encrypted snapshot (iv:ciphertext) for notes that live in the vault. */
  payload?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // nested folder support
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string; // hex or Tailwind color token
  createdAt: number;
}

export interface Settings {
  id?: string;
  theme: 'light' | 'dark' | 'system';
  accentPreset?: string;
  language: 'en' | 'fa';
  editorFontSize: number;
  editorLineHeight: string;
  editorWordWrap: boolean;
  autoSaveInterval: number;
  sidebarOpen: boolean;
  noteListWidth: number;
  editorMode: 'editor' | 'split' | 'preview';
  uiDensity: 'comfortable' | 'compact' | 'spacious';
  editorWidth?: 'focused' | 'comfortable' | 'wide';
  vaultSalt?: string; // Base64 salt for PBKDF2 key derivation (password)
  vaultVerifier?: string; // iv:ciphertext of a verifier string encrypted with the password-derived key
  vaultRecoveryKeyHash?: string; // Base64 salt used for recovery-key PBKDF2 derivation
  vaultRecoveryVerifier?: string; // iv:ciphertext of a verifier string encrypted with the recovery-derived key
  vaultWrappedMasterKey?: string; // iv:ciphertext of the AES master key wrapped with the password-derived key
  vaultWrappedMasterKeyRecovery?: string; // iv:ciphertext of the AES master key wrapped with the recovery-derived key
  vaultAutoLockDelay?: 'immediately' | '5m' | '15m' | '30m' | '1h' | 'never'; // Auto-lock configuration
  vaultShowHidden?: boolean; // Hidden notes visibility preference
  vaultKdfIterations?: number; // PBKDF2 rounds for the password-derived key
  vaultRecoveryKdfIterations?: number; // PBKDF2 rounds for the recovery-key-derived key
  seededAt?: number; // Set once demo content has been seeded, so wiping stays wiped
  syncTarget?: 'browser' | 'device'; // Where the Markdown mirror lives
  syncAuto?: boolean; // Mirror edits automatically after they settle
  syncFolderLabel?: string; // Human readable folder path for the UI
  syncLastAt?: number; // Timestamp of the last successful pass
}

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'fa';
export type EditorMode = 'editor' | 'split' | 'preview';
export type UiDensity = 'comfortable' | 'compact';
