import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { cleanObsidianBody, importMarkdownFolder, isImportablePath, planImport } from '../importer';

const files = [
  {
    path: 'Projects/Vault/Design.md',
    content: '---\ntitle: Vault Design\ntags: [security, design]\n---\nBody with [[Encryption Notes|notes]] and %%private comment%%.\n'
  },
  { path: 'Journal/2024-05-01.md', content: 'Today I wrote about [[Vault Design]].\n' },
  { path: 'Inbox.md', content: 'Quick capture ![[diagram.png]]\n' },
  { path: '.obsidian/app.json', content: '{}' },
  { path: 'Projects/photo.png', content: 'binary' }
];

describe('import path rules', () => {
  it('accepts nested markdown and rejects hidden/non-markdown files', () => {
    expect(isImportablePath('Projects/Vault/Design.md')).toBe(true);
    expect(isImportablePath('Inbox.markdown')).toBe(true);
    expect(isImportablePath('.obsidian/app.json')).toBe(false);
    expect(isImportablePath('.trash/Old.md')).toBe(false);
    expect(isImportablePath('__MACOSX/._Note.md')).toBe(false);
    expect(isImportablePath('assets/photo.png')).toBe(false);
  });
});

describe('planImport', () => {
  it('keeps folder structure, frontmatter metadata and wiki links', () => {
    const plan = planImport(files);

    expect(plan.folders).toEqual(['Projects', 'Journal', 'Projects/Vault']);
    expect(plan.skipped).toBe(2);

    const design = plan.notes.find((note) => note.title === 'Vault Design');
    expect(design?.folderPath).toBe('Projects/Vault');
    expect(design?.tags).toEqual(['security', 'design']);
    expect(design?.content).toContain('[[Encryption Notes|notes]]');
    expect(design?.content).not.toContain('title:');
    expect(design?.content).not.toContain('private comment');

    expect(plan.notes.find((note) => note.title === 'Inbox')?.folderPath).toBeNull();
  });

  it('translates Obsidian embeds and callouts', () => {
    expect(cleanObsidianBody('![[diagram.png]]')).toBe('*[attachment: diagram.png]*');
    expect(cleanObsidianBody('> [!note] Title')).toBe('> Title');
  });
});

describe('importMarkdownFolder', () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.folders.clear();
    await db.tags.clear();
  });

  it('creates folders, notes and tags once', async () => {
    const first = await importMarkdownFolder(files);
    expect(first.notes).toBe(3);
    expect(first.folders).toBe(3);
    expect(first.duplicates).toBe(0);

    const vaultFolder = await db.folders.filter((folder) => folder.name === 'Vault').first();
    const design = await db.notes.filter((note) => note.title === 'Vault Design').first();
    expect(design?.folderId).toBe(vaultFolder?.id);
    expect(design?.tags).toEqual(['security', 'design']);
    expect(await db.tags.where('name').equals('security').count()).toBe(1);

    const second = await importMarkdownFolder(files);
    expect(second.notes).toBe(0);
    expect(second.duplicates).toBe(3);
    expect(await db.notes.count()).toBe(3);
    expect(await db.folders.count()).toBe(3);
  });

  it('reuses existing folders instead of duplicating them', async () => {
    await db.folders.add({
      id: 'existing-projects',
      name: 'Projects',
      parentId: null,
      createdAt: 1,
      updatedAt: 1
    });

    await importMarkdownFolder(files);

    expect(await db.folders.where('name').equals('Projects').count()).toBe(1);
    expect(await db.folders.count()).toBe(3);
  });
});
