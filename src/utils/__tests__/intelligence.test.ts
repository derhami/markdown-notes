import { describe, expect, it } from 'vitest';
import {
  extractKeywords,
  findDuplicateTitles,
  findRelatedNotes,
  searchNotes,
  suggestTags,
  summarize,
  tokenize,
  type NoteDocument
} from '../intelligence';

const notes: NoteDocument[] = [
  {
    id: 'n1',
    title: 'Vault encryption design',
    content: 'AES-GCM master key wrapped with PBKDF2. The vault stores encrypted notes.',
    tags: ['security']
  },
  {
    id: 'n2',
    title: 'Grocery list',
    content: 'milk, bread, olives',
    tags: ['personal']
  },
  {
    id: 'n3',
    title: 'Encryption migration notes',
    content: 'Moving from 100k to 600k PBKDF2 iterations for the vault key.',
    tags: ['security', 'work']
  }
];

describe('tokenize', () => {
  it('keeps Persian compound words as a single token', () => {
    expect(tokenize('مارک‌داون')).toEqual(['مارکداون']);
  });

  it('drops markdown syntax and punctuation', () => {
    expect(tokenize('**bold** [text](url)')).toEqual(['bold', 'text']);
  });
});

describe('searchNotes', () => {
  it('ranks notes containing the query terms', () => {
    const hits = searchNotes('PBKDF2 vault', notes);
    expect(hits[0].id).toBe('n1');
    expect(hits.map((hit) => hit.id)).not.toContain('n2');
  });

  it('returns nothing for an empty query', () => {
    expect(searchNotes('   ', notes)).toEqual([]);
  });
});

describe('summarize and keywords', () => {
  it('keeps the best sentences in reading order', () => {
    const text = [
      'The first sentence explains the background of the migration in detail.',
      'The second sentence is filler that should probably not win the ranking.',
      'The third sentence mentions PBKDF2 iterations, vault keys and encryption repeatedly.'
    ].join(' ');
    const summary = summarize(text, 2);
    expect(summary.length).toBe(2);
    expect(summary[0]).toContain('first sentence');
  });

  it('extracts distinctive keywords', () => {
    expect(extractKeywords('vault encryption vault key', 2)).toContain('vault');
  });
});

describe('related notes and tags', () => {
  it('finds related notes but never the active one', () => {
    const related = findRelatedNotes(notes[0], notes, 5);
    expect(related.map((hit) => hit.id)).toContain('n3');
    expect(related.map((hit) => hit.id)).not.toContain('n1');
  });

  it('prefers existing tags in suggestions', () => {
    const suggestions = suggestTags('security security vault migration', ['security'], 3);
    expect(suggestions[0].tag).toBe('security');
    expect(suggestions[0].isExisting).toBe(true);
  });

  it('detects duplicate titles ignoring case and spacing', () => {
    const duplicates = findDuplicateTitles([
      { id: 'a', title: 'Daily Note', content: '' },
      { id: 'b', title: ' daily   note ', content: '' }
    ]);
    expect(duplicates.get('daily note')?.length).toBe(2);
  });
});
