/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Sparkles, Copy, Search, Link2, Lightbulb, Tag, ArrowRight,
  ShieldCheck, Lock, FileText, Wand2, CircleCheck, TriangleAlert, Info
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useVaultStore } from '../stores/useVaultStore';
import { useToastStore } from '../stores/useToastStore';
import {
  summarize,
  suggestTags,
  findRelatedNotes,
  searchNotes,
  noteInsights,
  extractKeywords,
  type NoteDocument
} from '../utils/intelligence';
import {
  calculateWordCount,
  calculateCharacterCount,
  calculateReadingTime
} from '../utils/notesHelper';
import type { Note } from '../types';

type Tab = 'overview' | 'related' | 'ask';

const TONE_STYLES: Record<string, string> = {
  good: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  warn: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  info: 'text-[#1D2EA0] dark:text-[#A3B5F5] bg-[#1D2EA0]/10'
};

const TONE_ICONS: Record<string, React.ElementType> = {
  good: CircleCheck,
  warn: TriangleAlert,
  info: Info
};

export default function SmartAssistant() {
  const {
    smartPanelOpen,
    setSmartPanelOpen,
    activeNoteId,
    setActiveNoteId,
    setActiveCategory
  } = useWorkspaceStore();
  const { decryptedNotes, showHidden, updateSecureNoteContent } = useVaultStore();
  const { showToast } = useToastStore();

  const notes = useLiveQuery(() => db.notes.toArray()) || [];
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!smartPanelOpen) return;
    setTab('overview');
    setQuery('');
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [smartPanelOpen]);

  useEffect(() => {
    if (!smartPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSmartPanelOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [smartPanelOpen, setSmartPanelOpen]);

  const documents = useMemo<NoteDocument[]>(() => {
    return notes
      .filter((note: Note) => !note.deletedAt && !note.isArchived && (!note.isHidden || showHidden))
      .map((note: Note) => {
        if (note.isEncrypted) {
          const plain = decryptedNotes[note.id];
          return {
            id: note.id,
            title: plain?.title || 'Locked Note',
            content: plain?.content || '',
            tags: plain?.tags || [],
            updatedAt: note.updatedAt,
            createdAt: note.createdAt,
            isEncrypted: true,
            isLocked: !plain
          };
        }
        return {
          id: note.id,
          title: note.title || 'Untitled Document',
          content: note.content || '',
          tags: note.tags || [],
          updatedAt: note.updatedAt,
          createdAt: note.createdAt
        };
      });
  }, [notes, decryptedNotes, showHidden]);

  const activeDoc = documents.find((document) => document.id === activeNoteId);
  const activeLocked = !!activeDoc?.isLocked;

  const summary = useMemo(
    () => (activeDoc && !activeLocked ? summarize(activeDoc.content, 5) : []),
    [activeDoc?.id, activeDoc?.content, activeLocked]
  );
  const keywords = useMemo(
    () => (activeDoc && !activeLocked ? extractKeywords(activeDoc.content, 8) : []),
    [activeDoc?.id, activeDoc?.content, activeLocked]
  );
  const tagSuggestions = useMemo(
    () =>
      activeDoc && !activeLocked
        ? suggestTags(activeDoc.content, activeDoc.tags ?? [], 6)
        : [],
    [activeDoc?.id, activeDoc?.content, activeDoc?.tags?.join('|'), activeLocked]
  );
  const insights = useMemo(
    () => (activeDoc && !activeLocked ? noteInsights(activeDoc, documents) : []),
    [activeDoc?.id, activeDoc?.content, activeDoc?.updatedAt, documents]
  );
  const related = useMemo(
    () => (activeDoc && !activeLocked ? findRelatedNotes(activeDoc, documents, 5) : []),
    [activeDoc?.id, activeDoc?.content, activeLocked, documents]
  );
  const askResults = useMemo(
    () => (deferredQuery.trim() ? searchNotes(deferredQuery, documents, 8) : []),
    [deferredQuery, documents]
  );

  if (!smartPanelOpen) return null;

  const close = () => setSmartPanelOpen(false);

  const openNote = (noteId: string) => {
    setActiveNoteId(noteId);
    close();
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message, 'success');
    } catch {
      showToast('Clipboard access was blocked by the browser', 'error');
    }
  };

  const openTag = (tag: string) => {
    setActiveCategory(`tag:${tag}` as any);
    setActiveNoteId(null);
    close();
  };

  // Existing tags filter the library; new suggestions are one tap away from
  // becoming a real tag on the open note.
  const handleTagSuggestion = async (tag: string, isExisting: boolean) => {
    if (!activeDoc || activeLocked) return;
    if (isExisting) {
      openTag(tag);
      return;
    }

    const nextTags = [...(activeDoc.tags ?? []), tag];
    try {
      if (activeDoc.isEncrypted) {
        await updateSecureNoteContent(
          activeDoc.id,
          activeDoc.title,
          activeDoc.content,
          nextTags
        );
      } else {
        await db.notes.update(activeDoc.id, { tags: nextTags, updatedAt: Date.now() });
      }
      showToast(`Tag #${tag} added`, 'success');
    } catch (error) {
      console.error(error);
      showToast('Could not add the tag', 'error');
    }
  };

  const wordCount = activeDoc ? calculateWordCount(activeDoc.content) : 0;
  const charCount = activeDoc ? calculateCharacterCount(activeDoc.content) : 0;
  const readingTime = activeDoc ? calculateReadingTime(activeDoc.content) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Smart Assistant"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-3xl h-[92dvh] sm:h-auto sm:max-h-[88dvh] bg-white dark:bg-[#16171B] border border-stone-200 dark:border-[#2E3039] rounded-t-xl sm:rounded-md shadow-2xl flex flex-col overflow-hidden animate-fade-in pb-[env(safe-area-inset-bottom)]"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-stone-100 dark:border-[#2E3039] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-sm bg-[#1D2EA0]/10 dark:bg-[#A3B5F5]/10 text-[#1D2EA0] dark:text-[#A3B5F5] shrink-0">
              <Wand2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                Smart Assistant
                <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-xs">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  On-device
                </span>
              </h2>
              <p className="text-[10px] text-stone-400 dark:text-stone-500 font-medium truncate">
                {activeDoc ? activeDoc.title : 'Workspace-wide search and writing insight'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close Smart Assistant"
            className="p-2 -me-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-100 dark:border-[#2E3039] px-2 shrink-0">
          {([
            { id: 'overview', label: 'Overview', icon: Sparkles },
            { id: 'related', label: 'Related', icon: Link2 },
            { id: 'ask', label: 'Ask notes', icon: Search }
          ] as { id: Tab; label: string; icon: React.ElementType }[]).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex-1 sm:flex-none sm:px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer
                  ${tab === item.id
                    ? 'text-[#1D2EA0] dark:text-[#A3B5F5] border-[#1D2EA0] dark:border-[#A3B5F5]'
                    : 'text-stone-400 dark:text-stone-500 border-transparent hover:text-stone-600 dark:hover:text-stone-300'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 select-text">
          {tab === 'overview' && (
            <div className="flex flex-col gap-5">
              {!activeDoc && (
                <div className="p-5 rounded-sm border border-dashed border-stone-200 dark:border-[#2E3039] text-center">
                  <FileText className="w-5 h-5 mx-auto text-stone-300 dark:text-stone-600 mb-2" />
                  <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                    Open a note to see its summary, suggested tags and writing insights.
                  </p>
                  <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1">
                    “Ask notes” already works across your whole library.
                  </p>
                </div>
              )}

              {activeLocked && (
                <div className="p-4 rounded-sm border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
                  <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-stone-800 dark:text-stone-100">Secure note is locked</h3>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">
                      Unlock the vault to let the assistant read this note. Nothing is ever sent anywhere; the analysis runs in this tab.
                    </p>
                  </div>
                </div>
              )}

              {activeDoc && !activeLocked && (
                <>
                  {/* Summary */}
                  <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                        Key points
                      </h3>
                      {summary.length > 0 && (
                        <button
                          type="button"
                          onClick={() => copyText(summary.map((line) => `• ${line}`).join('\n'), 'Summary copied')}
                          className="flex items-center gap-1 text-[10px] font-bold text-stone-400 hover:text-[#1D2EA0] dark:hover:text-[#A3B5F5] transition-colors cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </button>
                      )}
                    </div>
                    {summary.length === 0 ? (
                      <p className="text-xs text-stone-400 italic py-3">Not enough prose to summarize yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {summary.map((sentence, index) => (
                          <li
                            key={index}
                            className="flex gap-2 text-xs leading-relaxed text-stone-700 dark:text-stone-300"
                          >
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-[#1D2EA0] dark:bg-[#A3B5F5] shrink-0" />
                            <span dir="auto">{sentence}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* Stats */}
                  <section className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Words', value: wordCount.toLocaleString() },
                      { label: 'Characters', value: charCount.toLocaleString() },
                      { label: 'Read time', value: `${readingTime} min` }
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="p-2.5 border border-stone-200/60 dark:border-[#2E3039] rounded-sm bg-[#F2F3F8]/60 dark:bg-[#111214]/40 text-center"
                      >
                        <div className="text-sm font-serif font-bold text-stone-800 dark:text-stone-100">{stat.value}</div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-stone-400 mt-0.5">{stat.label}</div>
                      </div>
                    ))}
                  </section>

                  {/* Keywords + tags */}
                  {(keywords.length > 0 || tagSuggestions.length > 0) && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                        Suggested tags
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {tagSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.tag}
                            type="button"
                            onClick={() => handleTagSuggestion(suggestion.tag, suggestion.isExisting)}
                            title={suggestion.isExisting ? 'Filter by this tag' : 'Add this tag to the current note'}
                            className={`flex items-center gap-1 px-2 py-1 rounded-sm border text-[10px] font-semibold transition-colors cursor-pointer
                              ${suggestion.isExisting
                                ? 'border-[#1D2EA0]/30 dark:border-[#A3B5F5]/30 bg-[#1D2EA0]/10 dark:bg-[#A3B5F5]/10 text-[#1D2EA0] dark:text-[#A3B5F5]'
                                : 'border-stone-200 dark:border-[#2E3039] text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900/40'}`}
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {suggestion.tag}
                            <span className="opacity-50">{suggestion.count >= 100 ? '' : suggestion.count}</span>
                          </button>
                        ))}
                      </div>
                      {keywords.length > 0 && (
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-relaxed">
                          Frequent terms: {keywords.join(' · ')}
                        </p>
                      )}
                    </section>
                  )}

                  {/* Insights */}
                  {insights.length > 0 && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                        Writing insights
                      </h3>
                      <div className="flex flex-col gap-1.5">
                        {insights.map((insight) => {
                          const Icon = TONE_ICONS[insight.tone] ?? Lightbulb;
                          return (
                            <div
                              key={insight.title}
                              className="flex items-start gap-2.5 p-2.5 rounded-sm border border-stone-200/50 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E]"
                            >
                              <span className={`p-1 rounded-xs shrink-0 ${TONE_STYLES[insight.tone]}`}>
                                <Icon className="w-3 h-3" />
                              </span>
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-stone-700 dark:text-stone-200">{insight.title}</div>
                                <div className="text-[10px] text-stone-400 dark:text-stone-500 leading-relaxed">{insight.detail}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'related' && (
            <div className="flex flex-col gap-3">
              <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-relaxed">
                Ranked by shared vocabulary, tags and title similarity across your library.
              </p>
              {related.length === 0 ? (
                <p className="text-xs text-stone-400 italic py-6 text-center">
                  {activeDoc ? 'No strongly related notes yet. Keep writing and this list will fill in.' : 'Open a note to find related notes.'}
                </p>
              ) : (
                related.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => openNote(hit.id)}
                    className="group text-left p-3 rounded-sm border border-stone-200/60 dark:border-[#2E3039] hover:border-[#1D2EA0] dark:hover:border-[#A3B5F5] bg-white dark:bg-[#1A1B1E] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-serif font-bold text-stone-800 dark:text-stone-100 truncate group-hover:text-[#1D2EA0] dark:group-hover:text-[#A3B5F5]">
                        {hit.title || 'Untitled Document'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-stone-300 dark:text-stone-600 group-hover:text-[#1D2EA0] dark:group-hover:text-[#A3B5F5] shrink-0" />
                    </div>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 leading-relaxed line-clamp-2" dir="auto">
                      {hit.snippet}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === 'ask' && (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="What do my notes say about…?"
                  aria-label="Ask your notes"
                  className="w-full py-2.5 ps-9 pe-3 bg-stone-50 dark:bg-[#111214] border border-[#D1D4DC] dark:border-[#2E3039] rounded text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-[#1D2EA0] transition-all"
                />
              </div>
              <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-relaxed">
                Searches titles, bodies and tags locally. No query or note ever leaves this browser.
              </p>

              {deferredQuery.trim() && askResults.length === 0 && (
                <p className="text-xs text-stone-400 italic py-6 text-center">
                  Nothing matched. Try a shorter phrase or a tag name.
                </p>
              )}

              {askResults.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => openNote(hit.id)}
                  className="group text-left p-3 rounded-sm border border-stone-200/60 dark:border-[#2E3039] hover:border-[#1D2EA0] dark:hover:border-[#A3B5F5] bg-white dark:bg-[#1A1B1E] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-serif font-bold text-stone-800 dark:text-stone-100 truncate group-hover:text-[#1D2EA0] dark:group-hover:text-[#A3B5F5]">
                      {hit.title || 'Untitled Document'}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-stone-300 dark:text-stone-600 shrink-0">
                      Open
                    </span>
                  </div>
                  <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 leading-relaxed line-clamp-3" dir="auto">
                    {hit.snippet}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-2.5 border-t border-stone-100 dark:border-[#2E3039] flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 shrink-0">
          <ShieldCheck className="w-3 h-3 text-emerald-500" />
          Runs entirely on this device
          <span className="hidden sm:inline">· No cloud calls · No API key</span>
        </div>
      </div>
    </div>
  );
}
