/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUpRight, CornerDownRight, Link2, Sparkles, X } from 'lucide-react';
import { db } from '../db/database';
import { useVaultStore } from '../stores/useVaultStore';
import { extractWikiLinks, findBacklinks, findUnlinkedMentions, type LinkableNote } from '../utils/links';
import { normalizeText } from '../utils/notesHelper';

interface LinksPanelProps {
  noteId: string;
  title: string;
  content: string;
  onOpenTitle: (title: string) => void;
  onClose: () => void;
}

export default function LinksPanel({ noteId, title, content, onOpenTitle, onClose }: LinksPanelProps) {
  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? [];
  const { decryptedNotes, isLocked } = useVaultStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const documents: LinkableNote[] = useMemo(
    () =>
      notes
        .filter((note) => !note.deletedAt)
        .map((note) => ({
          id: note.id,
          title: decryptedNotes[note.id]?.title || note.title,
          content: note.isEncrypted
            ? decryptedNotes[note.id]?.content || ''
            : note.content
        })),
    [notes, decryptedNotes]
  );

  const current: LinkableNote = { id: noteId, title, content };
  const outgoing = extractWikiLinks(content);
  const backlinks = useMemo(() => findBacklinks(documents, title), [documents, title]);
  const unlinked = useMemo(() => findUnlinkedMentions(documents, current), [documents, title, content]);

  const exists = (linkTitle: string) =>
    documents.some((document) => normalizeText(document.title) === normalizeText(linkTitle));

  const matched = (linkTitle: string) =>
    documents.find((document) => normalizeText(document.title) === normalizeText(linkTitle));

  const sections = [
    {
      id: 'outgoing',
      label: 'Links in this note',
      icon: Link2,
      items: outgoing.map((linkTitle) => ({
        key: `out-${linkTitle}`,
        label: linkTitle,
        hint: exists(linkTitle) ? 'Open note' : 'No matching note yet',
        onOpen: () => onOpenTitle(linkTitle)
      }))
    },
    {
      id: 'backlinks',
      label: 'Linked from',
      icon: CornerDownRight,
      items: backlinks.map((note) => ({
        key: `back-${note.id}`,
        label: note.title,
        hint: 'Backlink',
        onOpen: () => matched(note.title) && onOpenTitle(note.title)
      }))
    },
    {
      id: 'unlinked',
      label: 'Mentioned but not linked',
      icon: Sparkles,
      items: unlinked.map((note) => ({
        key: `unlinked-${note.id}`,
        label: note.title,
        hint: 'Add [[…]] to connect',
        onOpen: () => onOpenTitle(note.title)
      }))
    }
  ].filter((section) => section.items.length > 0);

  const visibleSections = query.trim()
    ? sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            normalizeText(item.label).includes(normalizeText(query))
          )
        }))
        .filter((section) => section.items.length > 0)
    : sections;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-xs select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Links"
    >
      <div
        className="w-full md:max-w-lg max-h-[85vh] bg-white dark:bg-[#1A1B1E] border border-[#D1D4DC] dark:border-[#2E3039] rounded-t-2xl md:rounded-md shadow-2xl flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D1D4DC]/60 dark:border-[#2E3039] shrink-0">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#1D2EA0] dark:text-[#A3B5F5]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-600 dark:text-stone-300">
              Connections
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close links panel"
            className="p-2 -me-2 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 shrink-0">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter connections"
            className="w-full px-3 py-2 text-xs rounded border border-stone-200 dark:border-stone-800 bg-transparent text-stone-700 dark:text-stone-200 focus:outline-none focus:border-[#1D2EA0] dark:focus:border-[#A3B5F5]"
          />
          {isLocked && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">
              Unlock the vault to include encrypted notes in connections.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {visibleSections.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs font-semibold text-stone-500 dark:text-stone-300">No connections yet</p>
              <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                Type <span className="font-mono">[[Note title]]</span> in a note to link it.
              </p>
            </div>
          ) : (
            visibleSections.map((section) => (
              <section key={section.id}>
                <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                  <section.icon className="w-3 h-3" />
                  {section.label}
                </h3>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={item.onOpen}
                        className="w-full flex items-center justify-between gap-3 text-start px-2.5 py-2 rounded hover:bg-[#F2F3F8] dark:hover:bg-[#222328] transition-colors cursor-pointer"
                      >
                        <span className="text-xs text-stone-700 dark:text-stone-200 truncate">{item.label || 'Untitled'}</span>
                        <span className="flex items-center gap-1 text-[10px] text-stone-400 shrink-0">
                          {item.hint}
                          <ArrowUpRight className="w-3 h-3" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
