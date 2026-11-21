/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * On-device intelligence for Markdown Notes.
 *
 * Everything here is deterministic, synchronous and local: no network calls,
 * no API keys, and no note content ever leaves the browser. The algorithms are
 * deliberately lightweight (TF-IDF ranking, frequency-based extractive
 * summaries and heuristics) so they run instantly on phones too.
 */

import { normalizeText, stripMarkdown, splitSentences, calculateWordCount } from './notesHelper';

const STOPWORDS = new Set(
  `
  a an and are as at be been being but by can could did do does doing for from had has have
  having he her here hers herself him himself his how i if in into is it its itself just me
  more most my myself no nor not now of off on once only or other our ours ourselves out over
  own same she should so some such than that the their theirs them themselves then there these
  they this those through to too under until up very was we were what when where which while
  who whom why will with would you your yours yourself yourselves about above after again
  against all am any because before below between both during each few further off once same
  then once also may might must shall should using used use via per etc
  از به با بی بر در را که و یا این آن او ما شما آنها ایشان برای درباره درون بیرون روی زیر بالا
  است هست بود شد شود می‌شود می شود می‌کند می کند کرد کار دارد داره دارند داشت داشتن یکی
  ها های هایی هایم هایت هایش هایمان هایتان هایشان آن‌ها آنها این‌ها اینها همان همان‌ها
  که را رو هم نیز نه بله اگر تا چون چرا چه کجا کی چگونه وقتی هر همه هیچ برخی دیگر
  من تو او ما شما ایشان خود خویش خویشتن من‌را تر ترین ترین‌ها یک دو سه چهار پنج شش هفت هشت نه ده
  اما ولی لیکن پس بنابراین همچنین بنابراین زیرا چون اگرچه هرچند بلکه
  کرد کردن کرده می‌کنند شدن شده باشد باشند بودم بودی بودیم بودید بودند
  دارد دارند داشت داشتم داشتی داشتیم داشتید داشتند خواهد خواهند خواست
  این‌که اینکه آن‌که آنکه می‌توان می توان بتوان
  `
    .split(/\s+/)
    .filter(Boolean)
);

export interface NoteDocument {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  updatedAt?: number;
  createdAt?: number;
  isEncrypted?: boolean;
  isLocked?: boolean;
}

export interface SearchHit {
  id: string;
  title: string;
  score: number;
  snippet: string;
}

export interface TagSuggestion {
  tag: string;
  count: number;
  isExisting: boolean;
}

export interface Insight {
  tone: 'good' | 'warn' | 'info';
  title: string;
  detail: string;
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  // Unlike search normalization, tokens must keep Persian compound words
  // together: ZWNJ joins "مارک‌داون" instead of splitting it in two.
  const normalized = stripMarkdown(text)
    .normalize('NFKC')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .toLowerCase();

  const tokens = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-\u200C]*/gu);
  if (!tokens) return [];
  return tokens
    .map((token) => token.replace(/\u200C/g, ''))
    .filter((token) => token.length > 1);
}

function contentTokens(text: string): string[] {
  return tokenize(text).filter(
    (token) => !STOPWORDS.has(token) && !/^\d+$/.test(token)
  );
}

function termFrequency(tokens: string[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  return frequency;
}

/** Most distinctive terms in a piece of text. */
export function extractKeywords(text: string, limit = 8): string[] {
  const frequency = termFrequency(contentTokens(text));
  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

/**
 * Extractive summary: score sentences by the weight of their content words,
 * then keep the best ones in their original reading order.
 */
export function summarize(text: string, maxSentences = 5): string[] {
  const prose = stripMarkdown(text);
  if (!prose) return [];

  const sentences = splitSentences(prose).filter((sentence) => sentence.length > 24);
  if (sentences.length === 0) return prose.length > 320 ? [`${prose.slice(0, 317)}…`] : [prose];
  if (sentences.length <= maxSentences) return sentences;

  const globalFrequency = termFrequency(contentTokens(prose));
  const scored = sentences.map((sentence, index) => {
    const tokens = contentTokens(sentence);
    const weight = tokens.reduce(
      (sum, token) => sum + (globalFrequency.get(token) ?? 0),
      0
    );
    // Normalize by length and reward early sentences slightly.
    const lengthPenalty = Math.sqrt(Math.max(tokens.length, 1));
    const positionBonus = index < 3 ? 1.35 : index < 8 ? 1.1 : 1;
    return { sentence, index, score: (weight / lengthPenalty) * positionBonus };
  });

  const chosen = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);

  return chosen;
}

/**
 * Rank notes against a free-text query using TF-IDF over title, body and tags.
 */
export function searchNotes(
  query: string,
  documents: NoteDocument[],
  limit = 6
): SearchHit[] {
  const queryTokens = [...new Set(contentTokens(query))];
  if (queryTokens.length === 0) return [];

  const prepared = documents.map((document) => {
    const tokens = tokenize(
      `${document.title} ${document.title} ${document.content} ${(document.tags ?? []).join(' ')}`
    );
    const prose = stripMarkdown(document.content);
    return {
      document,
      frequency: termFrequency(tokens),
      length: Math.max(tokens.length, 1),
      normalizedTitle: normalizeText(document.title),
      prose
    };
  });

  const documentCount = Math.max(prepared.length, 1);
  const documentFrequency = new Map<string, number>();
  for (const token of queryTokens) {
    documentFrequency.set(
      token,
      prepared.reduce((count, entry) => count + (entry.frequency.has(token) ? 1 : 0), 0)
    );
  }

  const hits: SearchHit[] = [];
  for (const entry of prepared) {
    let score = 0;
    for (const token of queryTokens) {
      const tf = entry.frequency.get(token) ?? 0;
      if (tf === 0) {
        // Partial prefix match keeps Persian morphology and English stems usable.
        const prefix = [...entry.frequency.keys()].find(
          (candidate) => candidate.startsWith(token) || token.startsWith(candidate)
        );
        if (prefix) score += 0.6;
        continue;
      }
      const df = documentFrequency.get(token) ?? 1;
      const idf = Math.log(1 + documentCount / df);
      score += (1 + Math.log(tf)) * idf;
      if (entry.normalizedTitle.includes(token)) score += 3.5;
    }
    if (score <= 0) continue;

    // Long documents should not win just by being long.
    score = score / (1 + Math.log(1 + entry.length / 120));

    const snippet = bestSnippet(entry.prose, queryTokens);
    hits.push({
      id: entry.document.id,
      title: entry.document.title,
      score,
      snippet
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function bestSnippet(prose: string, queryTokens: string[]): string {
  if (!prose) return '';
  const sentences = splitSentences(prose);
  let best = '';
  let bestScore = -1;

  for (const sentence of sentences) {
    const normalized = normalizeText(sentence);
    let score = 0;
    for (const token of queryTokens) {
      if (normalized.includes(token)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }

  const source = best || prose;
  return source.length > 200 ? `${source.slice(0, 197).trim()}…` : source;
}

/** Related notes for the active document, excluding itself. */
export function findRelatedNotes(
  active: NoteDocument,
  documents: NoteDocument[],
  limit = 5
): SearchHit[] {
  const query = [
    active.title,
    (active.tags ?? []).join(' '),
    stripMarkdown(active.content).slice(0, 900)
  ]
    .filter(Boolean)
    .join(' ');

  if (!query.trim()) return [];
  return searchNotes(
    query,
    documents.filter((document) => document.id !== active.id),
    limit
  );
}

/** Suggest tags from frequent, distinctive words; existing tags rank first. */
export function suggestTags(
  text: string,
  existingTags: string[] = [],
  limit = 6
): TagSuggestion[] {
  const frequency = termFrequency(contentTokens(text));
  if (frequency.size === 0) return [];

  const existing = new Set(existingTags.map((tag) => normalizeText(tag)));
  const suggestions: TagSuggestion[] = [];

  for (const [tag, count] of frequency.entries()) {
    if (tag.length < 3 || /^\d+$/.test(tag)) continue;
    const isExisting = existing.has(tag);
    suggestions.push({
      tag,
      count: isExisting ? count + 100 : count,
      isExisting
    });
  }

  return suggestions
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/** Human-readable writing hints for a note. */
export function noteInsights(
  note: NoteDocument,
  allNotes: NoteDocument[] = [],
  now = Date.now()
): Insight[] {
  const prose = stripMarkdown(note.content);
  const words = calculateWordCount(note.content);
  const sentences = splitSentences(prose);
  const averageSentence = sentences.length ? words / sentences.length : 0;
  const insights: Insight[] = [];

  if (words === 0) {
    insights.push({
      tone: 'info',
      title: 'Empty canvas',
      detail: 'Start with a single sentence or paste an outline; structure can come later.'
    });
    return insights;
  }

  if (words < 60) {
    insights.push({
      tone: 'info',
      title: 'Short note',
      detail: `${words} words so far. A little more context will make this easier to revisit.`
    });
  } else if (words > 1200) {
    insights.push({
      tone: 'warn',
      title: 'Long document',
      detail: 'Consider splitting this into linked notes so each idea stays focused.'
    });
  }

  if (averageSentence > 30) {
    insights.push({
      tone: 'warn',
      title: 'Long sentences',
      detail: `Average sentence is ${Math.round(averageSentence)} words. Shortening a few will improve flow.`
    });
  } else if (averageSentence > 0 && averageSentence < 9) {
    insights.push({
      tone: 'info',
      title: 'Very short sentences',
      detail: 'The rhythm is choppy; joining related clauses may read more naturally.'
    });
  }

  if (!(note.tags && note.tags.length > 0)) {
    insights.push({
      tone: 'info',
      title: 'No tags yet',
      detail: 'Tags make the note discoverable from the tag index and search.'
    });
  }

  if (!/^\s{0,3}#{1,6}\s+/m.test(note.content)) {
    insights.push({
      tone: 'info',
      title: 'No headings',
      detail: 'Adding one or two headings creates a scannable outline automatically.'
    });
  }

  if (note.updatedAt) {
    const days = Math.floor((now - note.updatedAt) / 86_400_000);
    if (days >= 30) {
      insights.push({
        tone: 'warn',
        title: 'Quiet for a while',
        detail: `Last edited ${days} days ago. Revisit it or archive it to keep the workspace fresh.`
      });
    }
  }

  const normalizedTitle = normalizeText(note.title);
  const duplicate = allNotes.find(
    (candidate) =>
      candidate.id !== note.id &&
      normalizedTitle.length > 2 &&
      normalizeText(candidate.title) === normalizedTitle
  );
  if (duplicate) {
    insights.push({
      tone: 'warn',
      title: 'Possible duplicate',
      detail: `Another note is also called “${duplicate.title}”. Consider merging them.`
    });
  }

  if (insights.length === 0) {
    insights.push({
      tone: 'good',
      title: 'Looks healthy',
      detail: 'Structure, length and freshness are all in a good place.'
    });
  }

  return insights.slice(0, 5);
}

/** Titles that appear more than once, useful for a library cleanup pass. */
export function findDuplicateTitles(documents: NoteDocument[]): Map<string, string[]> {
  const byTitle = new Map<string, string[]>();
  for (const document of documents) {
    const key = normalizeText(document.title).trim();
    if (!key) continue;
    const ids = byTitle.get(key) ?? [];
    ids.push(document.id);
    byTitle.set(key, ids);
  }
  return new Map([...byTitle.entries()].filter(([, ids]) => ids.length > 1));
}
