import { describe, expect, it } from 'vitest';
import { diffLines, diffStats } from '../diff';

describe('diffLines', () => {
  it('returns context for identical text', () => {
    const lines = diffLines('a\nb', 'a\nb');
    expect(lines.every((l) => l.type === 'context')).toBe(true);
  });

  it('marks added and removed lines', () => {
    const lines = diffLines('a\nb', 'a\nc');
    expect(lines).toContainEqual({ type: 'removed', text: 'b' });
    expect(lines).toContainEqual({ type: 'added', text: 'c' });
  });

  it('stats counts changes', () => {
    const lines = diffLines('a\nb', 'a\nc\nd');
    const stats = diffStats(lines);
    expect(stats.added).toBe(2);
    expect(stats.removed).toBe(1);
  });
});