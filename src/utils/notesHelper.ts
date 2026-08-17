/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Calculates words in a text, supporting English, Persian, and mixed scripts correctly.
 */
export function calculateWordCount(text: string): number {
  if (!text) return 0;
  // Match English words, Persian/Arabic words, and numbers
  const words = text.trim().match(/[\w\d\u0600-\u06FF]+/g);
  return words ? words.length : 0;
}

/**
 * Calculates non-whitespace character count.
 */
export function calculateCharacterCount(text: string): number {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
}

/**
 * Calculates estimated reading time in minutes (assuming ~180-200 words/min).
 */
export function calculateReadingTime(text: string): number {
  const wordCount = calculateWordCount(text);
  const time = Math.ceil(wordCount / 180);
  return time < 1 ? 1 : time;
}

/**
 * Scans the markdown text and extracts the very first heading (# Heading)
 * to propose as a title. Strips out the leading Markdown symbols.
 */
export function extractFirstHeading(content: string, fallback: string = 'Untitled Note'): string {
  if (!content) return fallback;
  
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.replace(/^#\s+/, '').trim().slice(0, 80);
    } else if (trimmed.startsWith('## ')) {
      return trimmed.replace(/^##\s+/, '').trim().slice(0, 80);
    } else if (trimmed.startsWith('### ')) {
      return trimmed.replace(/^###\s+/, '').trim().slice(0, 80);
    }
  }
  
  return fallback;
}

/**
 * Prepares a safe filename from a note title by stripping invalid characters.
 */
export function sanitizeFileName(title: string): string {
  if (!title) return 'untitled_note';
  return title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_') // Replace illegal file characters
    .replace(/\s+/g, ' ')          // Collapse double spaces
    .slice(0, 100);                // Max filename length
}

/**
 * Simple parser to extract YAML frontmatter metadata from Markdown files.
 */
export function parseFrontmatter(markdown: string): {
  metadata: Record<string, any>;
  contentOnly: string;
} {
  const metadata: Record<string, any> = {};
  let contentOnly = markdown;

  // Match: ^---\n([\s\S]*?)\n---(\n|$)
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  
  if (match) {
    const yamlBlock = match[1];
    contentOnly = match[2];

    const lines = yamlBlock.split('\n');
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(':').trim();

        // Check if array (YAML sequence starting with - or comma-separated)
        if (val.startsWith('[') && val.endsWith(']')) {
          metadata[key] = val
            .slice(1, -1)
            .split(',')
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
        } else if (val.startsWith('-')) {
          // Handled as simple string lists for standard tags
          if (!metadata[key]) metadata[key] = [];
          metadata[key].push(val.slice(1).trim().replace(/^['"]|['"]$/g, ''));
        } else {
          metadata[key] = val.replace(/^['"]|['"]$/g, '');
        }
      }
    }
  }

  return { metadata, contentOnly };
}

/**
 * Exports a markdown string with frontmatter metadata
 */
export function stringifyFrontmatter(content: string, metadata: Record<string, any>): string {
  if (Object.keys(metadata).length === 0) return content;
  
  let frontmatter = '---\n';
  for (const [key, val] of Object.entries(metadata)) {
    if (Array.isArray(val)) {
      frontmatter += `${key}: [${val.join(', ')}]\n`;
    } else {
      frontmatter += `${key}: ${val}\n`;
    }
  }
  frontmatter += '---\n';
  return frontmatter + content;
}
