/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeText } from './notesHelper';

export interface LinkableNote {
  id: string;
  title: string;
  content: string;
}

const WIKI_LINK = /\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g;
const CODE_BLOCK = /```[\s\S]*?```|`[^`\n]*`/g;
export const NOTE_LINK_PREFIX = 'notelink:';

/** Titles referenced with [[double brackets]] in a document. */
export function extractWikiLinks(content: string): string[] {
  if (!content) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const stripped = content.replace(CODE_BLOCK, ' ');
  for (const match of stripped.matchAll(WIKI_LINK)) {
    const title = match[1].trim();
    const key = normalizeText(title);
    if (!title || seen.has(key)) continue;
    seen.add(key);
    found.push(title);
  }
  return found;
}

/**
 * Rewrites wiki links into normal Markdown links with a private `notelink:`
 * scheme so the preview can intercept them. Code blocks and inline code are
 * left untouched.
 */
export function wikiLinkToMarkdown(content: string): string {
  if (!content || !content.includes('[[')) return content;

  return content
    .split(/(```[\s\S]*?```)/g)
    .map((chunk, index) => {
      // Odd indexes are fenced code blocks.
      if (index % 2 === 1) return chunk;
      return chunk
        .split(/(`[^`\n]*`)/g)
        .map((part, partIndex) => {
          if (partIndex % 2 === 1) return part;
          return part.replace(WIKI_LINK, (_match, rawTitle: string, rawAlias?: string) => {
            const title = rawTitle.trim();
            const label = (rawAlias || title).trim();
            return `[${label}](${NOTE_LINK_PREFIX}${encodeURIComponent(title)})`;
          });
        })
        .join('');
    })
    .join('');
}

/** Decodes a `notelink:` href back into a note title. */
export function titleFromHref(href: string): string | null {
  if (!href.startsWith(NOTE_LINK_PREFIX)) return null;
  try {
    return decodeURIComponent(href.slice(NOTE_LINK_PREFIX.length));
  } catch {
    return null;
  }
}

/** Notes that explicitly link to the given title. */
export function findBacklinks(documents: LinkableNote[], targetTitle: string): LinkableNote[] {
  const target = normalizeText(targetTitle);
  if (!target) return [];

  return documents.filter((document) =>
    extractWikiLinks(document.content).some((title) => normalizeText(title) === target)
  );
}

/**
 * Notes that mention the title in prose but never link to it. These are the
 * connections the user probably meant to make.
 */
export function findUnlinkedMentions(
  documents: LinkableNote[],
  target: LinkableNote,
  limit = 5
): LinkableNote[] {
  const title = normalizeText(target.title);
  if (!title || title.length < 4) return [];

  return documents
    .filter((document) => document.id !== target.id)
    .filter((document) => {
      const body = normalizeText(document.content);
      if (!body.includes(title)) return false;
      const linked = extractWikiLinks(document.content).some(
        (candidate) => normalizeText(candidate) === title
      );
      return !linked;
    })
    .slice(0, limit);
}
