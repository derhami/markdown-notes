import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import type { Note } from '../../types';
import {
  assignNotePaths,
  isSyncablePath,
  runFolderSync,
  type RemoteFile,
  type SyncAdapter
} from '../folderSync';

function createMemoryAdapter(initial: Record<string, { content: string; modifiedAt?: number }> = {}) {
  const store = new Map<string, { content: string; modifiedAt: number }>();
  for (const [path, file] of Object.entries(initial)) {
    store.set(path, { content: file.content, modifiedAt: file.modifiedAt ?? 1 });
  }

  const adapter: SyncAdapter = {
    kind: 'browser',
    label: 'Test Vault',
    async listFiles(): Promise<RemoteFile[]> {
      return [...store.entries()].map(([path, file]) => ({
        path,
        content: file.content,
        modifiedAt: file.modifiedAt
      }));
    },
    async writeFile(path, content) {
      store.set(path, { content, modifiedAt: Date.now() });
    },
    async removeFile(path) {
      store.delete(path);
    }
  };

  return { adapter, store };
}

function note(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: 'note-1',
    title: 'Design Notes',
    content: 'Hello world',
    folderId: null,
    tags: ['design'],
    isFavorite: false,
    isPinned: false,
    createdAt: now,
    updatedAt: now,
    wordCount: 2,
    characterCount: 11,
    readingTime: 1,
    deletedAt: null,
    ...overrides
  };
}

beforeEach(async () => {
  await Promise.all([
    db.notes.clear(),
    db.folders.clear(),
    db.tags.clear(),
    db.syncIndex.clear(),
    db.syncHandles.clear(),
    db.noteVersions.clear(),
    db.settings.clear()
  ]);
  await db.settings.put({ id: 'current' } as any);
});

describe('sync path rules', () => {
  it('skips hidden folders and non-markdown files', () => {
    expect(isSyncablePath('Projects/Design.md')).toBe(true);
    expect(isSyncablePath('.obsidian/workspace.md')).toBe(false);
    expect(isSyncablePath('.trash/Old.md')).toBe(false);
    expect(isSyncablePath('attachments/photo.png')).toBe(false);
  });

  it('mirrors the folder tree and disambiguates duplicate titles', () => {
    const folders = [
      { id: 'f1', name: 'Projects', parentId: null, createdAt: 1, updatedAt: 1 },
      { id: 'f2', name: 'Design', parentId: 'f1', createdAt: 1, updatedAt: 1 }
    ];
    const paths = assignNotePaths(
      [
        note({ id: 'a', title: 'Plan', folderId: 'f2' }),
        note({ id: 'b', title: 'Plan', folderId: 'f2' })
      ],
      folders
    );

    expect(paths.get('a')).toBe('Projects/Design/Plan.md');
    expect(paths.get('b')).toBe('Projects/Design/Plan (2).md');
  });
});

describe('runFolderSync', () => {
  it('writes notes as Markdown files with folder structure and metadata', async () => {
    await db.folders.add({ id: 'f1', name: 'Projects', parentId: null, createdAt: 1, updatedAt: 1 });
    await db.folders.add({ id: 'f2', name: 'Design', parentId: 'f1', createdAt: 1, updatedAt: 1 });
    await db.notes.add(note({ folderId: 'f2' }));

    const { adapter, store } = createMemoryAdapter();
    const report = await runFolderSync(adapter);

    expect(report.pushed).toBe(1);
    const file = store.get('Projects/Design/Design Notes.md');
    expect(file).toBeDefined();
    expect(file!.content).toContain('id: note-1');
    expect(file!.content).toContain('tags: [design]');
    expect(file!.content).toContain('Hello world');
    expect(await db.syncIndex.get('note-1')).toMatchObject({
      path: 'Projects/Design/Design Notes.md'
    });
  });

  it('never writes secure notes to disk', async () => {
    await db.notes.add(
      note({ id: 'secret', title: 'Secret', isEncrypted: true, content: '', encryptedContent: 'x' })
    );
    const { adapter, store } = createMemoryAdapter();

    const report = await runFolderSync(adapter);

    expect(report.skipped).toBe(1);
    expect(store.size).toBe(0);
  });

  it('imports unknown Markdown files into their folders', async () => {
    const { adapter } = createMemoryAdapter({
      'Journal/2024-05-01.md': {
        content: '---\ntitle: First Entry\ntags: [journal, life]\nupdated: 1714521600000\n---\nA quiet day.\n',
        modifiedAt: 1714521600000
      }
    });

    const report = await runFolderSync(adapter);

    expect(report.imported).toBe(1);
    const imported = await db.notes.filter((entry) => entry.title === 'First Entry').first();
    expect(imported?.content).toBe('A quiet day.\n');
    expect(imported?.tags).toEqual(['journal', 'life']);
    expect(imported?.updatedAt).toBe(1714521600000);

    const folder = await db.folders.filter((entry) => entry.name === 'Journal').first();
    expect(imported?.folderId).toBe(folder?.id);
    expect(await db.tags.where('name').equals('journal').count()).toBe(1);
  });

  it('pulls a newer remote edit without touching the local updatedAt clock backwards', async () => {
    const local = note({ updatedAt: Date.now() - 60_000 });
    await db.notes.add(local);
    const { adapter, store } = createMemoryAdapter();
    await runFolderSync(adapter);

    const future = Date.now() + 60_000;
    store.set('Design Notes.md', {
      content: `---\nid: ${local.id}\ntitle: Design Notes\ntags: [design]\nupdated: ${future}\n---\nEdited on the phone\n`,
      modifiedAt: future
    });

    const report = await runFolderSync(adapter);

    expect(report.pulled).toBe(1);
    const updated = await db.notes.get(local.id);
    expect(updated?.content).toBe('Edited on the phone\n');
    expect(updated?.updatedAt).toBe(future);
  });

  it('keeps the newest side on a conflict and snapshots the local draft', async () => {
    const local = note({ updatedAt: Date.now() - 60_000 });
    await db.notes.add(local);
    const { adapter, store } = createMemoryAdapter();
    await runFolderSync(adapter);

    const remoteWins = Date.now() + 120_000;
    store.set('Design Notes.md', {
      content: `---\nid: ${local.id}\ntitle: Design Notes\nupdated: ${remoteWins}\n---\nRemote text\n`,
      modifiedAt: remoteWins
    });
    await db.notes.update(local.id, {
      content: 'Local draft',
      updatedAt: Date.now() + 60_000
    });

    const report = await runFolderSync(adapter);

    expect(report.conflicts).toBe(1);
    expect(report.pulled).toBe(1);
    const updated = await db.notes.get(local.id);
    expect(updated?.content).toBe('Remote text\n');
    const versions = await db.noteVersions.where('noteId').equals(local.id).toArray();
    expect(versions.some((version) => version.content === 'Local draft')).toBe(true);
  });

  it('removes the file when a note goes to the trash', async () => {
    const local = note();
    await db.notes.add(local);
    const { adapter, store } = createMemoryAdapter();
    await runFolderSync(adapter);
    expect(store.has('Design Notes.md')).toBe(true);

    await db.notes.update(local.id, { deletedAt: Date.now() });
    const report = await runFolderSync(adapter);

    expect(report.removed).toBe(1);
    expect(store.has('Design Notes.md')).toBe(false);
    expect(await db.syncIndex.get(local.id)).toBeUndefined();
  });
});
