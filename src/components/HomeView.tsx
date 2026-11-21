/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ArrowRight, ChevronRight, FileText, FileUp, FolderSync, Folder,
  Loader2, Lock, Plus, Search, Shield, Sparkles
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useVaultStore } from '../stores/useVaultStore';
import { useSyncStore } from '../stores/useSyncStore';
import { getTextDirection } from '../utils/notesHelper';
import type { Note } from '../types';

interface HomeViewProps {
  onCreateNote: () => void;
  onBrowse: (category: 'all' | 'folders') => void;
}

function relativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return 'not yet';
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function plainSnippet(markdown: string): string {
  return (markdown || '')
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function HomeView({ onCreateNote, onBrowse }: HomeViewProps) {
  const { setActiveNoteId, setCommandPaletteOpen } = useWorkspaceStore();
  const { vaultPasswordExists, isLocked, decryptedNotes } = useVaultStore();
  const { connected, lastSyncAt, status, syncNow } = useSyncStore();

  const notes = useLiveQuery(() => db.notes.toArray()) || [];
  const folders = useLiveQuery(() => db.folders.toArray()) || [];

  const active = notes.filter((note) => !note.deletedAt && !note.isArchived);
  const visible = active.filter((note) => !note.isHidden);

  const display = (note: Note) => {
    if (note.isEncrypted) {
      const decrypted = isLocked ? undefined : decryptedNotes[note.id];
      return {
        title: decrypted?.title || (isLocked ? 'Locked note' : 'Secure note'),
        content: decrypted?.content || ''
      };
    }
    return { title: note.title || 'Untitled note', content: note.content || '' };
  };

  const sorted = [...visible].sort((a, b) => b.updatedAt - a.updatedAt);
  const continueNote = sorted[0];
  const recent = sorted.slice(1, 5);
  const totalWords = visible.reduce((sum, note) => {
    if (note.isEncrypted) {
      const content = isLocked ? '' : decryptedNotes[note.id]?.content || '';
      return sum + (content ? content.trim().split(/\s+/).filter(Boolean).length : 0);
    }
    return sum + (note.wordCount || 0);
  }, 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  const continueDisplay = continueNote ? display(continueNote) : null;

  const importFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length > 0) {
      window.dispatchEvent(new CustomEvent('importMarkdownFiles', { detail: files }));
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F4F5F9] dark:bg-[#111214] animate-screen-in">
      <div className="px-5 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] max-w-lg mx-auto flex flex-col gap-5">

        {/* App header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="w-9 h-9 rounded-xl shadow-sm" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500 leading-none">
                Markdown Notes
              </span>
              <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mt-1">
                {today}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveNoteId('settings')}
            aria-label="Open settings"
            className="w-9 h-9 rounded-full border border-stone-200 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] text-stone-500 dark:text-stone-400 flex items-center justify-center active:scale-95 transition-transform"
          >
            <span className="text-xs font-bold text-[#1D2EA0] dark:text-[#A3B5F5]">M</span>
          </button>
        </div>

        {/* Greeting */}
        <div className="flex flex-col gap-1 mt-1">
          <h1 className="text-[26px] leading-tight font-serif font-semibold text-stone-900 dark:text-stone-100">
            {greeting}.
          </h1>
          <p className="text-xs text-stone-400 dark:text-stone-500 font-medium">
            {visible.length === 0
              ? 'A blank page is waiting for its first thought.'
              : `${visible.length} note${visible.length === 1 ? '' : 's'} · ${totalWords.toLocaleString()} words kept safe on this device.`}
          </p>
        </div>

        {/* Sync status pill */}
        <button
          type="button"
          onClick={() => (connected ? void syncNow('manual') : setActiveNoteId('settings'))}
          className="self-start inline-flex items-center gap-2 rounded-full border border-stone-200/80 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] px-3 py-1.5 text-[10px] font-bold text-stone-500 dark:text-stone-400 active:scale-[0.98] transition-transform"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === 'syncing'
                ? 'bg-amber-500 animate-pulse'
                : connected
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
            }`}
          />
          {status === 'syncing'
            ? 'Syncing folder…'
            : connected
              ? `Folder synced ${relativeTime(lastSyncAt)}`
              : 'Set up folder sync'}
          {status === 'syncing' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : connected ? (
            <FolderSync className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>

        {/* Continue writing */}
        {continueNote && continueDisplay && (
          <button
            type="button"
            onClick={() => setActiveNoteId(continueNote.id)}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1D2EA0] via-[#2638B7] to-[#4A5CDC] p-5 text-start text-white shadow-lg shadow-[#1D2EA0]/20 active:scale-[0.99] transition-transform"
          >
            <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 left-4 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/60">
              Continue writing
            </span>
            <h2
              dir={getTextDirection(continueDisplay.title)}
              className="mt-2 text-[22px] leading-snug font-serif font-semibold line-clamp-2"
            >
              {continueDisplay.title}
            </h2>
            <p className="mt-1.5 text-[11px] text-white/70 leading-relaxed line-clamp-2">
              {plainSnippet(continueDisplay.content) || 'No content yet — tap to start writing.'}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-white/60">
                {relativeTime(continueNote.updatedAt)}
                {continueNote.wordCount ? ` · ${continueNote.wordCount} words` : ''}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </button>
        )}

        {!continueNote && (
          <button
            type="button"
            onClick={onCreateNote}
            className="rounded-3xl border border-dashed border-stone-300 dark:border-[#2E3039] bg-white/60 dark:bg-[#1A1B1E] px-5 py-8 flex flex-col items-center gap-2 text-center active:scale-[0.99] transition-transform"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF0FB] dark:bg-[#222328] text-[#1D2EA0] dark:text-[#A3B5F5]">
              <Sparkles className="w-5 h-5" />
            </span>
            <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">
              Write your first note
            </span>
            <span className="text-[11px] text-stone-400 dark:text-stone-500">
              Markdown, images, wiki links and folder sync included.
            </span>
          </button>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onCreateNote}
            className="flex items-center gap-2.5 rounded-2xl border border-stone-200/70 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] px-3.5 py-3.5 text-start active:scale-[0.98] transition-transform"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FB] dark:bg-[#222328] text-[#1D2EA0] dark:text-[#A3B5F5]">
              <Plus className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-stone-700 dark:text-stone-200">New note</span>
          </button>

          <label className="flex items-center gap-2.5 rounded-2xl border border-stone-200/70 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] px-3.5 py-3.5 cursor-pointer active:scale-[0.98] transition-transform">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FB] dark:bg-[#222328] text-[#1D2EA0] dark:text-[#A3B5F5]">
              <FileUp className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-stone-700 dark:text-stone-200">Import</span>
            <input
              type="file"
              accept=".md,.markdown,.txt"
              multiple
              onChange={importFiles}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-2.5 rounded-2xl border border-stone-200/70 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] px-3.5 py-3.5 text-start active:scale-[0.98] transition-transform"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FB] dark:bg-[#222328] text-[#1D2EA0] dark:text-[#A3B5F5]">
              <Search className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-stone-700 dark:text-stone-200">Search</span>
          </button>

          <button
            type="button"
            onClick={() => onBrowse('folders')}
            className="flex items-center gap-2.5 rounded-2xl border border-stone-200/70 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] px-3.5 py-3.5 text-start active:scale-[0.98] transition-transform"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FB] dark:bg-[#222328] text-[#1D2EA0] dark:text-[#A3B5F5]">
              <Folder className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-stone-700 dark:text-stone-200">Folders</span>
          </button>
        </div>

        {/* Numbers */}
        <div className="rounded-2xl border border-stone-200/70 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] grid grid-cols-3 divide-x divide-stone-100 dark:divide-[#2E3039]">
          {[
            { label: 'Notes', value: visible.length.toLocaleString() },
            { label: 'Words', value: totalWords.toLocaleString() },
            { label: 'Folders', value: folders.length.toLocaleString() }
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-0.5 py-3.5">
              <span className="text-lg font-serif font-semibold text-stone-800 dark:text-stone-100 leading-none">
                {stat.value}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* Recent notes */}
        {recent.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
                Recently edited
              </h3>
              <button
                type="button"
                onClick={() => onBrowse('all')}
                className="text-[10px] font-bold text-[#1D2EA0] dark:text-[#A3B5F5]"
              >
                See all
              </button>
            </div>
            <div className="rounded-2xl border border-stone-200/70 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] overflow-hidden divide-y divide-stone-100 dark:divide-[#2E3039]">
              {recent.map((note) => {
                const info = display(note);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setActiveNoteId(note.id)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 text-start active:bg-stone-50 dark:active:bg-[#222328]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 dark:bg-[#222328] text-stone-400 dark:text-stone-500">
                      {note.isEncrypted ? <Lock className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span
                        dir={getTextDirection(info.title)}
                        className="text-[13px] font-semibold text-stone-700 dark:text-stone-200 truncate"
                      >
                        {info.title}
                      </span>
                      <span className="text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                        {relativeTime(note.updatedAt)}
                        {note.wordCount ? ` · ${note.wordCount} words` : ''}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-stone-300 dark:text-stone-600" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Vault */}
        <button
          type="button"
          onClick={() => setActiveNoteId('settings')}
          className="rounded-2xl border border-stone-200/70 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] px-4 py-3.5 flex items-center gap-3 text-start active:scale-[0.99] transition-transform"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 dark:bg-[#222328] text-stone-500 dark:text-stone-400">
            <Shield className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-xs font-bold text-stone-700 dark:text-stone-200">Secure vault</span>
            <span className="text-[10px] text-stone-400 dark:text-stone-500 font-medium">
              {vaultPasswordExists
                ? isLocked
                  ? 'Locked · tap to unlock in settings'
                  : 'Unlocked · AES-256 encrypted notes'
                : 'Not set up yet · protect sensitive notes'}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-stone-300 dark:text-stone-600" />
        </button>

      </div>
    </div>
  );
}
