import { describe, expect, it } from 'vitest';
import {
  calculateCharacterCount,
  calculateReadingTime,
  calculateWordCount,
  extractFirstHeading,
  normalizeText,
  parseFrontmatter,
  sanitizeFileName,
  splitSentences,
  stripMarkdown
} from '../notesHelper';

describe('normalizeText', () => {
  it('folds Arabic letter variants and half-spaces for search', () => {
    expect(normalizeText('مارک‌داون')).toBe(normalizeText('مارکداون'));
    expect(normalizeText('كتاب')).toBe(normalizeText('کتاب'));
    expect(normalizeText('  Hello   WORLD ')).toBe('hello world');
  });
});

describe('stripMarkdown', () => {
  it('keeps list items on their own lines so summaries do not merge them', () => {
    const prose = stripMarkdown('- first point\n- second point');
    expect(prose.split('\n').map((line) => line.trim()).filter(Boolean)).toEqual([
      'first point',
      'second point'
    ]);
  });

  it('removes code fences, emphasis and link syntax', () => {
    const prose = stripMarkdown('# Title\n\n**bold** and [link](https://example.com)\n\n```\ncode\n```');
    expect(prose).toContain('Title');
    expect(prose).toContain('bold');
    expect(prose).toContain('link');
    expect(prose).not.toContain('```');
    expect(prose).not.toContain('https://example.com');
  });
});

describe('counts', () => {
  it('counts words, characters and reading time', () => {
    const text = 'one two three four five';
    expect(calculateWordCount(text)).toBe(5);
    expect(calculateCharacterCount(text)).toBe(text.replace(/\s/g, '').length);
    expect(calculateReadingTime(text)).toBe(1);
  });

  it('returns at least one minute for short notes', () => {
    expect(calculateReadingTime('')).toBe(1);
  });
});

describe('titles and filenames', () => {
  it('extracts the first heading', () => {
    expect(extractFirstHeading('intro\n\n## My Heading\nbody', 'Fallback')).toBe('My Heading');
    expect(extractFirstHeading('plain body', 'Fallback')).toBe('Fallback');
  });

  it('sanitizes file names for exports', () => {
    expect(sanitizeFileName('a/b:c*?')).not.toMatch(/[/:*?]/);
  });
});

describe('sentences and frontmatter', () => {
  it('splits sentences on latin and Persian punctuation', () => {
    expect(splitSentences('One. Two! سه؟ چهار').length).toBeGreaterThanOrEqual(3);
  });

  it('parses frontmatter keys and keeps the body', () => {
    const parsed = parseFrontmatter('---\ntags: [a, b]\ntitle: Hello\n---\nBody text');
    expect(parsed.contentOnly.trim()).toBe('Body text');
    expect(parsed.metadata.title).toBe('Hello');
  });
});
