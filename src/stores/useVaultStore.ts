/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { db } from '../db/database';
import type { Note, Settings } from '../types';
import {
  setupVault as cryptoSetupVault,
  encryptNotePayload,
  decryptNotePayload,
  generateRecoveryKey as cryptoGenerateRecoveryKey,
  registerRecoveryKey as cryptoRegisterRecoveryKey,
  unlockWithPassword as cryptoUnlockWithPassword,
  unlockWithRecoveryKey as cryptoUnlockWithRecoveryKey,
  changeVaultPassword as cryptoChangeVaultPassword
} from '../utils/crypto';

interface DecryptedNote {
  title: string;
  content: string;
  tags: string[];
}

interface VaultState {
  isLocked: boolean;
  derivedKey: CryptoKey | null; // The AES-GCM master key for note decryption
  vaultPasswordExists: boolean;
  autoLockDelay: 'immediately' | '5m' | '15m' | '30m' | '1h' | 'never';
  showHidden: boolean;
  decryptedNotes: Record<string, DecryptedNote>; // maps noteId to decrypted plain values
  recoveryKeyGenerated: string | null; // shown once upon password set/reset
  lastActivityTime: number;

  // Actions
  initVaultState: () => Promise<void>;
  setPassword: (password: string) => Promise<{ success: boolean; recoveryKey: string }>;
  setupVault: (password: string) => Promise<boolean>;
  generateRecoveryKey: () => Promise<string | null>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  unlock: (password: string) => Promise<boolean>;
  unlockWithRecoveryKey: (recoveryKey: string) => Promise<boolean>;
  lock: () => void;
  encryptExistingNote: (note: Note) => Promise<boolean>;
  decryptExistingNote: (note: Note) => Promise<boolean>;
  updateSecureNoteContent: (noteId: string, title: string, content: string, tags: string[]) => Promise<void>;
  setAutoLockDelay: (delay: 'immediately' | '5m' | '15m' | '30m' | '1h' | 'never') => Promise<void>;
  setShowHidden: (show: boolean) => Promise<void>;
  recordActivity: () => void;
}

let autoLockTimeoutId: any = null;

// Decrypt every secure note with the provided master key.
const loadDecryptedNotes = async (masterKey: CryptoKey): Promise<Record<string, DecryptedNote>> => {
  const secureNotes = await db.notes.filter((n) => !!n.isEncrypted).toArray();
  const decryptedMap: Record<string, DecryptedNote> = {};
  for (const note of secureNotes) {
    if (note.encryptedContent && note.encryptionIv) {
      const decrypted = await decryptNotePayload(note.encryptedContent, note.encryptionIv, masterKey);
      if (decrypted) {
        decryptedMap[note.id] = decrypted;
      }
    }
  }
  return decryptedMap;
};

export const useVaultStore = create<VaultState>((set, get) => {
  // Setup standard inactivity timer check
  const startAutoLockTimer = () => {
    if (autoLockTimeoutId) clearTimeout(autoLockTimeoutId);

    const { autoLockDelay, isLocked } = get();
    if (isLocked || autoLockDelay === 'never') return;

    let delayMs = 15 * 60 * 1000; // default 15 minutes
    if (autoLockDelay === 'immediately') delayMs = 5000; // 5 seconds for visual immediacy
    else if (autoLockDelay === '5m') delayMs = 5 * 60 * 1000;
    else if (autoLockDelay === '15m') delayMs = 15 * 60 * 1000;
    else if (autoLockDelay === '30m') delayMs = 30 * 60 * 1000;
    else if (autoLockDelay === '1h') delayMs = 60 * 60 * 1000;

    autoLockTimeoutId = setTimeout(() => {
      const elapsed = Date.now() - get().lastActivityTime;
      if (elapsed >= delayMs) {
        get().lock();
      } else {
        startAutoLockTimer(); // restart with remaining time
      }
    }, delayMs);
  };

  return {
    isLocked: true,
    derivedKey: null,
    vaultPasswordExists: false,
    autoLockDelay: '15m',
    showHidden: false,
    decryptedNotes: {},
    recoveryKeyGenerated: null,
    lastActivityTime: Date.now(),

    initVaultState: async () => {
      const currentSettings = await db.settings.get('current');
      if (currentSettings) {
        set({
          vaultPasswordExists:
            !!currentSettings.vaultSalt &&
            !!currentSettings.vaultVerifier &&
            !!currentSettings.vaultWrappedMasterKey,
          autoLockDelay: currentSettings.vaultAutoLockDelay || '15m',
          showHidden: currentSettings.vaultShowHidden || false
        });
      }
    },

    setPassword: async (password: string) => {
      const recoveryKey = cryptoGenerateRecoveryKey();
      const secrets = await cryptoSetupVault(password, recoveryKey);

      const updatePayload: Partial<Settings> = {
        vaultSalt: secrets.salt,
        vaultVerifier: secrets.verifier,
        vaultRecoveryKeyHash: secrets.recoverySalt,
        vaultRecoveryVerifier: secrets.recoveryVerifier,
        vaultWrappedMasterKey: secrets.wrappedMasterKey,
        vaultWrappedMasterKeyRecovery: secrets.wrappedMasterKeyRecovery
      };

      await db.settings.update('current', updatePayload);

      set({
        vaultPasswordExists: true,
        recoveryKeyGenerated: recoveryKey
      });

      // Unlock immediately so the user can start encrypting notes right away
      await get().unlock(password);

      return { success: true, recoveryKey };
    },

    setupVault: async (password: string) => {
      const res = await get().setPassword(password);
      return res.success;
    },

    generateRecoveryKey: async () => {
      const { derivedKey } = get();
      if (!derivedKey) return null;

      const recoveryKey = cryptoGenerateRecoveryKey();
      const secret = await cryptoRegisterRecoveryKey(recoveryKey, derivedKey);

      await db.settings.update('current', {
        vaultRecoveryKeyHash: secret.recoverySalt,
        vaultRecoveryVerifier: secret.recoveryVerifier,
        vaultWrappedMasterKeyRecovery: secret.wrappedMasterKeyRecovery
      });

      set({ recoveryKeyGenerated: recoveryKey });
      return recoveryKey;
    },

    changePassword: async (oldPassword: string, newPassword: string) => {
      const current = await db.settings.get('current');
      if (!current || !current.vaultSalt || !current.vaultVerifier || !current.vaultWrappedMasterKey) {
        return false;
      }

      // Verify old password, unwrap the (unchanged) master key, re-wrap with the new password
      const result = await cryptoChangeVaultPassword(
        oldPassword,
        newPassword,
        current.vaultSalt,
        current.vaultVerifier,
        current.vaultWrappedMasterKey
      );
      if (!result) return false;

      await db.settings.update('current', {
        vaultSalt: result.salt,
        vaultVerifier: result.verifier,
        vaultWrappedMasterKey: result.wrappedMasterKey
      });

      // Decrypt notes with the same master key (it never changed)
      const decryptedMap = await loadDecryptedNotes(result.masterKey);

      set({
        derivedKey: result.masterKey,
        isLocked: false,
        decryptedNotes: decryptedMap
      });

      return true;
    },

    unlock: async (password: string) => {
      const current = await db.settings.get('current');
      if (!current || !current.vaultSalt || !current.vaultVerifier || !current.vaultWrappedMasterKey) {
        return false;
      }

      const masterKey = await cryptoUnlockWithPassword(
        password,
        current.vaultSalt,
        current.vaultVerifier,
        current.vaultWrappedMasterKey
      );
      if (!masterKey) return false;

      // Decrypt all secure notes into memory with the master key
      const decryptedMap = await loadDecryptedNotes(masterKey);

      set({
        isLocked: false,
        derivedKey: masterKey,
        decryptedNotes: decryptedMap,
        lastActivityTime: Date.now()
      });

      startAutoLockTimer();
      return true;
    },

    unlockWithRecoveryKey: async (recoveryKey: string) => {
      const current = await db.settings.get('current');
      if (
        !current ||
        !current.vaultRecoveryKeyHash ||
        !current.vaultRecoveryVerifier ||
        !current.vaultWrappedMasterKeyRecovery
      ) {
        return false;
      }

      // The recovery key unwraps the SAME master key, so every secure note is decryptable
      const masterKey = await cryptoUnlockWithRecoveryKey(
        recoveryKey.trim(),
        current.vaultRecoveryKeyHash,
        current.vaultRecoveryVerifier,
        current.vaultWrappedMasterKeyRecovery
      );
      if (!masterKey) return false;

      const decryptedMap = await loadDecryptedNotes(masterKey);

      set({
        isLocked: false,
        derivedKey: masterKey,
        decryptedNotes: decryptedMap,
        lastActivityTime: Date.now()
      });

      startAutoLockTimer();
      return true;
    },

    lock: () => {
      if (autoLockTimeoutId) clearTimeout(autoLockTimeoutId);
      set({
        isLocked: true,
        derivedKey: null,
        decryptedNotes: {},
        recoveryKeyGenerated: null
      });
    },

    encryptExistingNote: async (note: Note) => {
      const { derivedKey, decryptedNotes } = get();
      if (!derivedKey) return false;

      const { ciphertext, iv } = await encryptNotePayload(note.title, note.content, note.tags, derivedKey);

      // Update at rest in DB
      await db.notes.update(note.id, {
        isEncrypted: true,
        encryptedContent: ciphertext,
        encryptionIv: iv,
        // Zero out plaintext fields so no sensitive data is leaked at rest
        title: 'Locked Note',
        content: '',
        tags: [],
        wordCount: 0,
        characterCount: 0,
        readingTime: 0
      });

      // Save original in memory cache
      set({
        decryptedNotes: {
          ...decryptedNotes,
          [note.id]: {
            title: note.title,
            content: note.content,
            tags: note.tags
          }
        }
      });

      return true;
    },

    decryptExistingNote: async (note: Note) => {
      const { derivedKey, decryptedNotes } = get();
      if (!derivedKey) return false;

      const plain = decryptedNotes[note.id];
      if (!plain) return false;

      // Re-calculate counts
      const words = plain.content.trim().split(/\s+/).filter(Boolean).length;
      const chars = plain.content.length;
      const read = Math.max(1, Math.round(words / 200));

      await db.notes.update(note.id, {
        isEncrypted: false,
        encryptedContent: undefined,
        encryptionIv: undefined,
        title: plain.title,
        content: plain.content,
        tags: plain.tags,
        wordCount: words,
        characterCount: chars,
        readingTime: read
      });

      // Remove from decrypted cache
      const updatedCache = { ...decryptedNotes };
      delete updatedCache[note.id];
      set({ decryptedNotes: updatedCache });

      return true;
    },

    updateSecureNoteContent: async (noteId: string, title: string, content: string, tags: string[]) => {
      const { derivedKey, decryptedNotes } = get();
      if (!derivedKey) return;

      const { ciphertext, iv } = await encryptNotePayload(title, content, tags, derivedKey);

      // Update DB with encrypted payload
      await db.notes.update(noteId, {
        encryptedContent: ciphertext,
        encryptionIv: iv,
        title: 'Locked Note',
        content: '',
        tags: []
      });

      // Update memory cache
      set({
        decryptedNotes: {
          ...decryptedNotes,
          [noteId]: { title, content, tags }
        }
      });
    },

    setAutoLockDelay: async (delay) => {
      await db.settings.update('current', { vaultAutoLockDelay: delay });
      set({ autoLockDelay: delay });
      startAutoLockTimer();
    },

    setShowHidden: async (show) => {
      await db.settings.update('current', { vaultShowHidden: show });
      set({ showHidden: show });
    },

    recordActivity: () => {
      set({ lastActivityTime: Date.now() });
      const { isLocked } = get();
      if (!isLocked) {
        startAutoLockTimer();
      }
    }
  };
});