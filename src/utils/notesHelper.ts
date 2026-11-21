/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A word starts with a letter/number and continues through letters, numbers,
 * combining marks, ZWNJ (Persian half-space) and apostrophes. Markdown
 * control characters can never become a word on their own.
 */
const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}\u200C\u200D'’\-]*/gu;

/**
 * Extracts prose from Markdown so fenced code, inline code, images and
 * syntax characters are not counted as written words.
 */
export function stripMarkdown(markdown: string): string {
  if (!markdown) return '';
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/^[-*_]{3,}$/gm, ' ')
    // Keep line breaks: they separate list items and hard-wrapped sentences,
    // which the summarizer relies on to avoid one giant run-on sentence.
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalizes Persian/Arabic variants so search matches what users type:
 * ی/ي, ک/ك, آ/ا, removes diacritics and tatweel, and drops ZWNJ so
 * "مارک‌داون" and "مارکداون" compare equal.
 */
export function normalizeText(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFKC')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\u200C/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_CHAR = /[A-Za-z\u00C0-\u02AF\u0370-\u058F\u0900-\u1FFF\u2C00-\uD7FF]/;

/**
 * Direction of a paragraph from its first strong character, following the
 * browser's own `dir="auto"` rule. Digits and punctuation are neutral, so
 * "2024 Report" stays LTR and "گزارش 2024" stays RTL.
 */
export function getTextDirection(text: string): 'rtl' | 'ltr' {
  if (!text) return 'ltr';
  for (const char of text) {
    if (RTL_CHAR.test(char)) return 'rtl';
    if (LTR_CHAR.test(char)) return 'ltr';
  }
  return 'ltr';
}

/**
 * Splits prose into sentences for summaries and readability checks.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…؟۔])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Calculates words in a text, supporting English, Persian, and mixed scripts correctly.
 */
export function calculateWordCount(text: string): number {
  if (!text) return 0;
  const words = stripMarkdown(text).match(WORD_PATTERN);
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
  // 180 wpm is a realistic pace for mixed English/Persian prose.
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
