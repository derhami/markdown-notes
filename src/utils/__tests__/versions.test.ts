import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { CURRENT_PBKDF2_ITERATIONS, setupVault, unlockWithPassword } from '../crypto';
import { clearAllVersions, listNoteVersions, readNoteVersion, recordNoteVersion } from '../versions';

const ITERATIONS = 1_000;

describe('note version history', () => {
  beforeEach(async () => {
    await db.noteVersions.clear();
  });

  it('stores a snapshot and skips an identical one', async () => {
    await recordNoteVersion('n1', 'Title', 'first draft');
    await recordNoteVersion('n1', 'Title', 'first draft');

    const versions = await listNoteVersions('n1');
    expect(versions).toHaveLength(1);
    expect(await readNoteVersion(versions[0])).toEqual({ title: 'Title', content: 'first draft' });
  });

  it('records a later, meaningfully different draft', async () => {
    await recordNoteVersion('n1', 'Title', 'first draft');
    const [first] = await listNoteVersions('n1');
    // Pretend the first snapshot was taken long ago.
    await db.noteVersions.update(first.id, { createdAt: first.createdAt - 10 * 60 * 1000 });

    await recordNoteVersion('n1', 'Title', 'a much longer second draft with new material in it');
    const versions = await listNoteVersions('n1');
    expect(versions).toHaveLength(2);
    expect(versions[0].content).toContain('second draft');
  });

  it('keeps history encrypted for vault notes', async () => {
    const vault = await setupVault('pw', 'RECOVERY', ITERATIONS);
    const key = await unlockWithPassword(
      'pw',
      vault.salt,
      vault.verifier,
      vault.wrappedMasterKey,
      ITERATIONS
    );

    await recordNoteVersion('secure', 'Secret', 'plaintext must not leak', key!);
    const [version] = await listNoteVersions('secure');

    expect(version.content).toBeUndefined();
    expect(version.payload).toContain(':');
    expect(JSON.stringify(version)).not.toContain('plaintext must not leak');
    expect(await readNoteVersion(version, key!)).toEqual({
      title: 'Secret',
      content: 'plaintext must not leak'
    });
    expect(await readNoteVersion(version, null)).toBeNull();
  });

  it('prunes old snapshots beyond the cap', async () => {
    const base = Date.now() - 60 * 60 * 1000;
    for (let index = 0; index < 35; index++) {
      await db.noteVersions.add({
        id: `v${index}`,
        noteId: 'n2',
        title: 'T',
        createdAt: base + index,
        wordCount: 1,
        content: `draft ${index}`
      });
    }

    await recordNoteVersion('n2', 'T', 'final draft with enough new characters to be stored');
    const versions = await listNoteVersions('n2');
    expect(versions.length).toBeLessThanOrEqual(30);
    expect(versions[0].content).toContain('final draft');
  });

  it('can clear the whole history', async () => {
    await recordNoteVersion('n3', 'T', 'text');
    await clearAllVersions();
    expect(await listNoteVersions('n3')).toHaveLength(0);
    expect(CURRENT_PBKDF2_ITERATIONS).toBeGreaterThan(ITERATIONS);
  });
});
