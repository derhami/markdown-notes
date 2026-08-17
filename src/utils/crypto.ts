/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Cryptographic helper functions using browser SubtleCrypto API.
//
// The Vault uses a *key-wrapping* architecture:
//   1. A random AES-256 master key encrypts every secure note.
//   2. The master key itself is wrapped (encrypted) twice:
//        - with a key derived from the user password (PBKDF2)
//        - with a key derived from the emergency recovery key (PBKDF2)
//   3. Unlocking with EITHER the password OR the recovery key unwraps the same
//      master key, so both paths can decrypt every secure note.
// This fixes the previous design where the recovery key derived its own key
// that could never decrypt notes locked with the main password.

const VERIFIER_PLAINTEXT = 'markdown-notes-vault-unlocked-v1';
const PBKDF2_ITERATIONS = 100000;

// Helper to convert string to ArrayBuffer (UTF-8)
function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Helper to convert ArrayBuffer to string (UTF-8)
function bufferToString(buf: ArrayBuffer): string {
  return new TextDecoder().decode(buf);
}

// Helper to convert ArrayBuffer to Base64
function bufferToBase64(buf: ArrayBufferLike): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 to Uint8Array
function base64ToBuffer(b64: string): Uint8Array {
  const binary = window.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Generate a random cryptographically secure salt/IV
export function generateRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

export function generateRandomBytesBase64(size: number): string {
  return bufferToBase64(generateRandomBytes(size).buffer);
}

// Derive CryptoKey from password and salt using PBKDF2
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    stringToBuffer(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Derive an AES-GCM key from a secret (password or recovery key) + base64 salt
export async function deriveKeyFromSecret(secret: string, saltB64: string): Promise<CryptoKey> {
  const salt = base64ToBuffer(saltB64);
  return deriveKey(secret, salt);
}

// Low-level encrypt returning { ciphertext, iv } as base64 strings
async function encryptBuffer(buffer: Uint8Array, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const iv = generateRandomBytes(12); // 12-byte IV for GCM
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    buffer
  );
  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer)
  };
}

// Low-level encrypt for strings
async function encryptData(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  return encryptBuffer(stringToBuffer(plaintext), key);
}

// Low-level decrypt: ciphertext+iv (base64) + key -> ArrayBuffer
async function decryptData(ciphertext: string, iv: string, key: CryptoKey): Promise<ArrayBuffer> {
  const ciphertextBuf = base64ToBuffer(ciphertext).buffer as ArrayBuffer;
  const ivBuf = base64ToBuffer(iv).buffer as ArrayBuffer;
  return window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuf
    },
    key,
    ciphertextBuf
  );
}

/**
 * Generate a random 256-bit AES-GCM master key for the vault.
 * The key is marked extractable so it can be re-wrapped on password change.
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  const raw = generateRandomBytes(32);
  return window.crypto.subtle.importKey(
    'raw',
    raw.buffer as ArrayBuffer,
    'AES-GCM',
    true,
    ['encrypt', 'decrypt']
  );
}

// Wrap (encrypt) a master key with a wrapping key
async function wrapMasterKey(masterKey: CryptoKey, wrappingKey: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const raw = await window.crypto.subtle.exportKey('raw', masterKey);
  return encryptBuffer(new Uint8Array(raw), wrappingKey);
}

/**
 * Unwrap (decrypt) a wrapped master key with a wrapping key.
 * Returns the imported AES-GCM master key or null on failure.
 */
export async function unwrapMasterKey(
  wrappedPayload: string,
  wrappingKey: CryptoKey
): Promise<CryptoKey | null> {
  try {
    const [iv, ciphertext] = wrappedPayload.split(':');
    if (!iv || !ciphertext) return null;
    const raw = await decryptData(ciphertext, iv, wrappingKey);
    return window.crypto.subtle.importKey(
      'raw',
      raw,
      'AES-GCM',
      true,
      ['encrypt', 'decrypt']
    );
  } catch (e) {
    return null;
  }
}

/**
 * Setup a new vault with a password and recovery key.
 * Generates the master key and wraps it with both the password-derived key and
 * the recovery-key-derived key.
 */
export async function setupVault(
  password: string,
  recoveryKey: string
): Promise<{
  salt: string;
  verifier: string;
  recoverySalt: string;
  recoveryVerifier: string;
  wrappedMasterKey: string;
  wrappedMasterKeyRecovery: string;
}> {
  const masterKey = await generateMasterKey();

  // Wrap with the password-derived key
  const salt = generateRandomBytes(16);
  const passwordKey = await deriveKey(password, salt);
  const verifier = await encryptData(VERIFIER_PLAINTEXT, passwordKey);
  const wrapped = await wrapMasterKey(masterKey, passwordKey);

  // Wrap with the recovery-key-derived key
  const recoverySalt = generateRandomBytes(16);
  const recoveryKeyDerived = await deriveKey(recoveryKey, recoverySalt);
  const recoveryVerifier = await encryptData(VERIFIER_PLAINTEXT, recoveryKeyDerived);
  const wrappedRecovery = await wrapMasterKey(masterKey, recoveryKeyDerived);

  return {
    salt: bufferToBase64(salt.buffer),
    verifier: `${verifier.iv}:${verifier.ciphertext}`,
    recoverySalt: bufferToBase64(recoverySalt.buffer),
    recoveryVerifier: `${recoveryVerifier.iv}:${recoveryVerifier.ciphertext}`,
    wrappedMasterKey: `${wrapped.iv}:${wrapped.ciphertext}`,
    wrappedMasterKeyRecovery: `${wrappedRecovery.iv}:${wrappedRecovery.ciphertext}`
  };
}

/**
 * Verify a vault password against its stored salt/verifier.
 * Returns the password-derived CryptoKey when correct, otherwise null.
 */
export async function verifyVaultPassword(
  password: string,
  saltB64: string,
  verifierPayload: string
): Promise<CryptoKey | null> {
  try {
    const salt = base64ToBuffer(saltB64);
    const [iv, ciphertext] = verifierPayload.split(':');
    if (!iv || !ciphertext) return null;

    const key = await deriveKey(password, salt);
    const decrypted = await decryptData(ciphertext, iv, key);
    if (bufferToString(decrypted) === VERIFIER_PLAINTEXT) {
      return key;
    }
  } catch (e) {
    // Return null on failure (wrong password, decryption error, etc.)
  }
  return null;
}

/**
 * Verify password and return the unwrapped master key.
 * Used when the user unlocks the vault with their password.
 */
export async function unlockWithPassword(
  password: string,
  saltB64: string,
  verifierPayload: string,
  wrappedMasterKey: string
): Promise<CryptoKey | null> {
  const key = await verifyVaultPassword(password, saltB64, verifierPayload);
  if (!key) return null;
  const masterKey = await unwrapMasterKey(wrappedMasterKey, key);
  return masterKey;
}

/**
 * Verify the recovery key and return the unwrapped master key.
 * Used when the user unlocks the vault with their emergency recovery key.
 */
export async function unlockWithRecoveryKey(
  recoveryKey: string,
  recoverySaltB64: string,
  recoveryVerifierPayload: string,
  wrappedMasterKeyRecovery: string
): Promise<CryptoKey | null> {
  const key = await verifyVaultPassword(recoveryKey, recoverySaltB64, recoveryVerifierPayload);
  if (!key) return null;
  const masterKey = await unwrapMasterKey(wrappedMasterKeyRecovery, key);
  return masterKey;
}

/**
 * Replace the recovery key (must be called with the vault unlocked).
 * Wraps the same master key with the new recovery-key-derived key so the new
 * recovery key can fully decrypt every secure note.
 */
export async function registerRecoveryKey(
  recoveryKey: string,
  masterKey: CryptoKey
): Promise<{
  recoverySalt: string;
  recoveryVerifier: string;
  wrappedMasterKeyRecovery: string;
}> {
  const recoverySalt = generateRandomBytes(16);
  const recoveryKeyDerived = await deriveKey(recoveryKey, recoverySalt);
  const recoveryVerifier = await encryptData(VERIFIER_PLAINTEXT, recoveryKeyDerived);
  const wrappedRecovery = await wrapMasterKey(masterKey, recoveryKeyDerived);

  return {
    recoverySalt: bufferToBase64(recoverySalt.buffer),
    recoveryVerifier: `${recoveryVerifier.iv}:${recoveryVerifier.ciphertext}`,
    wrappedMasterKeyRecovery: `${wrappedRecovery.iv}:${wrappedRecovery.ciphertext}`
  };
}

/**
 * Change the vault password (master key stays the same).
 * Re-wraps the master key with the new password-derived key. No note
 * re-encryption is required because notes are always encrypted with the master key.
 */
export interface PasswordChangeResult {
  masterKey: CryptoKey;
  salt: string;
  verifier: string;
  wrappedMasterKey: string;
}

export async function changeVaultPassword(
  oldPassword: string,
  newPassword: string,
  saltB64: string,
  verifierPayload: string,
  wrappedMasterKey: string
): Promise<PasswordChangeResult | null> {
  const oldKey = await verifyVaultPassword(oldPassword, saltB64, verifierPayload);
  if (!oldKey) return null;

  const masterKey = await unwrapMasterKey(wrappedMasterKey, oldKey);
  if (!masterKey) return null;

  const newSalt = generateRandomBytes(16);
  const newPasswordKey = await deriveKey(newPassword, newSalt);
  const newVerifier = await encryptData(VERIFIER_PLAINTEXT, newPasswordKey);
  const newWrapped = await wrapMasterKey(masterKey, newPasswordKey);

  return {
    masterKey,
    salt: bufferToBase64(newSalt.buffer),
    verifier: `${newVerifier.iv}:${newVerifier.ciphertext}`,
    wrappedMasterKey: `${newWrapped.iv}:${newWrapped.ciphertext}`
  };
}

/**
 * Generate a randomized recovery key: ABCD-EFGH-IJKL-MNOP-QRST-UVWX
 */
export function generateRecoveryKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments: string[] = [];
  const randomBytes = new Uint8Array(24);
  window.crypto.getRandomValues(randomBytes);

  for (let i = 0; i < 6; i++) {
    let seg = '';
    for (let j = 0; j < 4; j++) {
      const idx = randomBytes[i * 4 + j] % chars.length;
      seg += chars[idx];
    }
    segments.push(seg);
  }
  return segments.join('-');
}

/**
 * Encrypt a note structure (title, content, tags) using a vault-derived key
 */
export async function encryptNotePayload(
  title: string,
  content: string,
  tags: string[],
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const payload = JSON.stringify({ title, content, tags });
  return encryptData(payload, key);
}

/**
 * Decrypt a note structure using a vault-derived key
 */
export async function decryptNotePayload(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<{ title: string; content: string; tags: string[] } | null> {
  try {
    const decrypted = await decryptData(ciphertext, iv, key);
    return JSON.parse(bufferToString(decrypted));
  } catch (e) {
    return null;
  }
}

// Re-export helper used for building parser-friendly secrets
/**
 * Alias kept for compatibility: deriveKeyFromSecret accepts a base64 salt.
 */
export const deriveKeyFromBase64Salt = deriveKeyFromSecret;