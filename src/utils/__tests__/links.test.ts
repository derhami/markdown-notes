import { describe, expect, it } from 'vitest';
import {
  extractWikiLinks,
  findBacklinks,
  findUnlinkedMentions,
  titleFromHref,
  wikiLinkToMarkdown
} from '../links';

const notes = [
  { id: 'a', title: 'Vault design', content: 'See [[Encryption notes]] and [[Vault design|the design]].' },
  { id: 'b', title: 'Encryption notes', content: 'All about PBKDF2 and vault keys.' },
  { id: 'c', title: 'Journal', content: 'I should write more about encryption notes soon.' },
  { id: 'd', title: 'Code sample', content: '```\n[[Not a link]]\n```\nand `[[also not]]`' }
];

describe('wiki links', () => {
  it('extracts unique titles and ignores code', () => {
    expect(extractWikiLinks(notes[0].content)).toEqual(['Encryption notes', 'Vault design']);
    expect(extractWikiLinks(notes[3].content)).toEqual([]);
  });

  it('rewrites links with an alias into a notelink href', () => {
    const markdown = wikiLinkToMarkdown('See [[Encryption notes]] and [[Vault design|the design]].');
    expect(markdown).toContain('[Encryption notes](notelink:Encryption%20notes)');
    expect(markdown).toContain('[the design](notelink:Vault%20design)');
    expect(titleFromHref('notelink:Vault%20design')).toBe('Vault design');
    expect(titleFromHref('https://example.com')).toBeNull();
  });

  it('leaves fenced code untouched', () => {
    const markdown = wikiLinkToMarkdown('```\n[[Raw]]\n```');
    expect(markdown).toContain('[[Raw]]');
  });
});

describe('backlinks', () => {
  it('finds notes that link to a title, ignoring case and spacing', () => {
    expect(findBacklinks(notes, 'encryption   NOTES').map((note) => note.id)).toEqual(['a']);
  });

  it('suggests notes that mention a title without linking it', () => {
    const mentions = findUnlinkedMentions(notes, notes[1]);
    expect(mentions.map((note) => note.id)).toEqual(['c']);
  });
});
