import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { setupVault, unlockWithPassword } from '../crypto';
import {
  ATTACHMENT_PREFIX,
  clearAllAttachments,
  deleteAttachmentsForNote,
  isAttachmentSource,
  readAttachment,
  saveAttachment
} from '../attachments';

const ITERATIONS = 1_000;

describe('attachments', () => {
  beforeEach(async () => {
    await clearAllAttachments();
  });

  it('stores a plain attachment and returns a markdown snippet', async () => {
    const file = new Blob(['hello bytes'], { type: 'image/png' });
    const snippet = await saveAttachment('n1', file, 'diagram.png');

    expect(snippet).toContain('![diagram]');
    expect(snippet).toContain(ATTACHMENT_PREFIX);
    const id = snippet.slice(snippet.indexOf(ATTACHMENT_PREFIX) + ATTACHMENT_PREFIX.length, -1);
    expect(isAttachmentSource(`${ATTACHMENT_PREFIX}${id}`)).toBe(true);

    const stored = await readAttachment(id);
    expect(stored?.name).toBe('diagram.png');
    expect(await stored?.blob.text()).toBe('hello bytes');
  });

  it('encrypts attachment bytes for vault notes', async () => {
    const vault = await setupVault('pw', 'RECOVERY', ITERATIONS);
    const key = await unlockWithPassword('pw', vault.salt, vault.verifier, vault.wrappedMasterKey, ITERATIONS);

    const snippet = await saveAttachment('secure', new Blob(['secret pixels']), 'secret.png', key!);
    const id = snippet.slice(snippet.indexOf(ATTACHMENT_PREFIX) + ATTACHMENT_PREFIX.length, -1);

    const row = await db.attachments.get(id);
    expect(row?.blob).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain('secret pixels');
    expect(await readAttachment(id, null)).toBeNull();

    const decrypted = await readAttachment(id, key!);
    expect(await decrypted?.blob.text()).toBe('secret pixels');
  });

  it('deletes every attachment of a note', async () => {
    await saveAttachment('n2', new Blob(['a']), 'a.png');
    await saveAttachment('n2', new Blob(['b']), 'b.png');
    await saveAttachment('n3', new Blob(['c']), 'c.png');

    await deleteAttachmentsForNote('n2');

    expect(await db.attachments.where('noteId').equals('n2').count()).toBe(0);
    expect(await db.attachments.where('noteId').equals('n3').count()).toBe(1);
  });
});
