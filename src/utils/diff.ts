/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** A single line in a unified-ish diff. */
export type DiffLine =
  | { type: 'context'; text: string }
  | { type: 'added'; text: string }
  | { type: 'removed'; text: string };

/**
 * Compute a simple line-based diff between two texts using longest common
 * subsequence (LCS). Suitable for short note snapshots.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split(/\n/);
  const newLines = newText.split(/\n/);

  const m = oldLines.length;
  const n = newLines.length;

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'context', text: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: oldLines[i] });
      i++;
    } else {
      result.push({ type: 'added', text: newLines[j] });
      j++;
    }
  }
  while (i < m) {
    result.push({ type: 'removed', text: oldLines[i] });
    i++;
  }
  while (j < n) {
    result.push({ type: 'added', text: newLines[j] });
    j++;
  }
  return result;
}

/** Count added/removed lines. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'added') added++;
    else if (line.type === 'removed') removed++;
  }
  return { added, removed };
}