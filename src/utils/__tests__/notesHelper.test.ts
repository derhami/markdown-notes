import { describe, expect, it } from 'vitest';
import {
  getTextDirection,
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

describe('paragraph direction', () => {
  it('follows the first strong character', () => {
    expect(getTextDirection('این یک جمله فارسی با English داخل آن است')).toBe('rtl');
    expect(getTextDirection('This English sentence mentions فارسی inside it')).toBe('ltr');
  });

  it('ignores neutral punctuation, numbers and spaces', () => {
    expect(getTextDirection('  "2024" — گزارش سال')).toBe('rtl');
    expect(getTextDirection('» 42 — Annual report')).toBe('ltr');
    expect(getTextDirection('12345 !!!')).toBe('ltr');
  });

  it('keeps mixed paragraphs stable instead of flipping per word', () => {
    const persian = 'نکته: از کلید Ctrl + K استفاده کنید';
    const english = 'Tip: press Ctrl + K برای باز کردن پالت';
    expect(getTextDirection(persian)).toBe('rtl');
    expect(getTextDirection(english)).toBe('ltr');
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
