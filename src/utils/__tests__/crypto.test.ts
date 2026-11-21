import { describe, expect, it } from 'vitest';
import {
  decryptNotePayload,
  encryptNotePayload,
  setupVault,
  unlockWithPassword,
  unlockWithRecoveryKey,
  upgradeVaultKdf
} from '../crypto';

const ITERATIONS = 1_000; // Keep the suite fast; the algorithm is identical.
const PASSWORD = 'correct horse battery staple';
const RECOVERY_KEY = 'AAAA-BBBB-CCCC-DDDD';
const PLAINTEXT = 'Secret body with [[a link]] and Persian متن.';

describe('vault crypto', () => {
  it('rejects a wrong password and accepts the right one', async () => {
    const vault = await setupVault(PASSWORD, RECOVERY_KEY, ITERATIONS);

    const wrong = await unlockWithPassword(
      'not the password',
      vault.salt,
      vault.verifier,
      vault.wrappedMasterKey,
      ITERATIONS
    );
    expect(wrong).toBeNull();

    const masterKey = await unlockWithPassword(
      PASSWORD,
      vault.salt,
      vault.verifier,
      vault.wrappedMasterKey,
      ITERATIONS
    );
    expect(masterKey).not.toBeNull();
  });

  it('encrypts and decrypts a note payload', async () => {
    const vault = await setupVault(PASSWORD, RECOVERY_KEY, ITERATIONS);
    const masterKey = await unlockWithPassword(
      PASSWORD,
      vault.salt,
      vault.verifier,
      vault.wrappedMasterKey,
      ITERATIONS
    );

    const payload = await encryptNotePayload('Title', PLAINTEXT, ['work'], masterKey!);
    const decrypted = await decryptNotePayload(payload.ciphertext, payload.iv, masterKey!);

    expect(decrypted).toEqual({ title: 'Title', content: PLAINTEXT, tags: ['work'] });
  });

  it('does not decrypt with another vault key', async () => {
    const first = await setupVault(PASSWORD, RECOVERY_KEY, ITERATIONS);
    const second = await setupVault(PASSWORD, RECOVERY_KEY, ITERATIONS);
    const firstKey = await unlockWithPassword(PASSWORD, first.salt, first.verifier, first.wrappedMasterKey, ITERATIONS);
    const secondKey = await unlockWithPassword(PASSWORD, second.salt, second.verifier, second.wrappedMasterKey, ITERATIONS);

    const payload = await encryptNotePayload('Title', PLAINTEXT, [], firstKey!);
    expect(await decryptNotePayload(payload.ciphertext, payload.iv, secondKey!)).toBeNull();
  });

  it('unlocks with the recovery key only', async () => {
    const vault = await setupVault(PASSWORD, RECOVERY_KEY, ITERATIONS);

    const rejected = await unlockWithRecoveryKey(
      'WRONG-KEY',
      vault.recoverySalt,
      vault.recoveryVerifier,
      vault.wrappedMasterKeyRecovery,
      ITERATIONS
    );
    expect(rejected).toBeNull();

    const masterKey = await unlockWithRecoveryKey(
      RECOVERY_KEY,
      vault.recoverySalt,
      vault.recoveryVerifier,
      vault.wrappedMasterKeyRecovery,
      ITERATIONS
    );
    expect(masterKey).not.toBeNull();
  });

  it('rewraps the same master key when upgrading the KDF', async () => {
    const vault = await setupVault(PASSWORD, RECOVERY_KEY, ITERATIONS);
    const masterKey = await unlockWithPassword(
      PASSWORD,
      vault.salt,
      vault.verifier,
      vault.wrappedMasterKey,
      ITERATIONS
    );
    const payload = await encryptNotePayload('Title', PLAINTEXT, [], masterKey!);

    const upgraded = await upgradeVaultKdf(PASSWORD, masterKey!, ITERATIONS * 2);
    expect(upgraded.iterations).toBe(ITERATIONS * 2);

    const reopened = await unlockWithPassword(
      PASSWORD,
      upgraded.salt,
      upgraded.verifier,
      upgraded.wrappedMasterKey,
      upgraded.iterations
    );
    expect(reopened).not.toBeNull();

    // The rewrapped key must still open content encrypted before the upgrade.
    const decrypted = await decryptNotePayload(payload.ciphertext, payload.iv, reopened!);
    expect(decrypted?.content).toBe(PLAINTEXT);
  });
});
