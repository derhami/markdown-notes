/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Plus, FileUp, Search, ShieldAlert, ShieldCheck, Lock, Unlock, 
  FileText, Star, Pin, Folder, Calendar, ChevronRight, Eye, EyeOff, Shield
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useVaultStore } from '../stores/useVaultStore';
import { useToastStore } from '../stores/useToastStore';
import { generateId } from '../utils/id';
import type { Note } from '../types';

export default function PersonalDashboard() {
  const { setActiveNoteId, setActiveCategory, setCommandPaletteOpen } = useWorkspaceStore();
  const { 
    isLocked, 
    vaultPasswordExists, 
    decryptedNotes, 
    showHidden, 
    unlock, 
    lock, 
    setShowHidden 
  } = useVaultStore();
  const { showToast } = useToastStore();

  const [passwordInput, setPasswordInput] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live Query notes and folders
  const allNotes = useLiveQuery(() => db.notes.toArray()) || [];
  const folders = useLiveQuery(() => db.folders.toArray()) || [];

  // Helper to get decrypted version of a note if unlocked
  const getNoteDisplay = (note: Note) => {
    if (note.isEncrypted) {
      if (isLocked) {
        return {
          title: 'Locked Note',
          content: '',
          tags: [],
          wordCount: 0,
          characterCount: 0,
          readingTime: 0
        };
      } else {
        const decrypted = decryptedNotes[note.id];
        return {
          title: decrypted?.title || 'Untitled Secure Note',
          content: decrypted?.content || '',
          tags: decrypted?.tags || [],
          wordCount: decrypted?.content ? decrypted.content.trim().split(/\s+/).filter(Boolean).length : 0,
          characterCount: decrypted?.content?.length || 0,
          readingTime: decrypted?.content ? Math.max(1, Math.round(decrypted.content.trim().split(/\s+/).filter(Boolean).length / 200)) : 0
        };
      }
    }
    return {
      title: note.title || 'Untitled Note',
      content: note.content || '',
      tags: note.tags || [],
      wordCount: note.wordCount || 0,
      characterCount: note.characterCount || 0,
      readingTime: note.readingTime || 0
    };
  };

  // Filter out deleted notes
  const activeNotes = allNotes.filter(n => n.deletedAt === null && !n.isArchived);

  // Exclude hidden notes unless showHidden is active
  const visibleNotes = activeNotes.filter(note => {
    if (note.isHidden && !showHidden) return false;
    return true;
  });

  // Split visible notes into normal and secure
  const secureNotesCount = allNotes.filter(n => n.deletedAt === null && !!n.isEncrypted).length;

  // Sorting helper for visible notes to get recent lists
  const sortedNotes = [...visibleNotes].sort((a, b) => b.updatedAt - a.updatedAt);

  // Continue Writing - most recently edited visible note
  const continueNote = sortedNotes[0];

  // Recently Edited - next 3 visible notes
  const recentNotes = sortedNotes.slice(1, 4);

  // Pinned Notes
  const pinnedNotes = visibleNotes.filter(n => n.isPinned).slice(0, 5);

  // Favorite Notes
  const favoriteNotes = visibleNotes.filter(n => n.isFavorite).slice(0, 5);

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const handleCreateNote = async (isSecure = false) => {
    const now = Date.now();
    const noteId = generateId();
    
    let noteData: Note = {
      id: noteId,
      title: '',
      content: '',
      folderId: null,
      tags: [],
      isFavorite: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      wordCount: 0,
      characterCount: 0,
      readingTime: 0,
      deletedAt: null
    };

    if (isSecure) {
      if (isLocked) {
        showToast('Please unlock your Secure Vault to create secure notes.', 'error');
        return;
      }
      noteData.isEncrypted = true;
      noteData.title = 'Locked Note';
    }

    try {
      await db.notes.add(noteData);
      if (isSecure) {
        await useVaultStore.getState().updateSecureNoteContent(noteId, 'Untitled Secure Note', '', []);
      }
      setActiveNoteId(noteId);
      showToast(isSecure ? 'New secure note created' : 'New document created', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlockVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setIsSubmitting(true);
    setUnlockError(false);

    try {
      const success = await unlock(passwordInput);
      if (success) {
        showToast('Secure Vault unlocked', 'success');
        setPasswordInput('');
      } else {
        setUnlockError(true);
        showToast('Incorrect password', 'error');
      }
    } catch (err) {
      setUnlockError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Simple statistics for Writing Activity
  const totalWords = visibleNotes.reduce((acc, n) => acc + getNoteDisplay(n).wordCount, 0);
  const totalNotesCount = visibleNotes.length;
  const activeFoldersCount = new Set(visibleNotes.map(n => n.folderId).filter(Boolean)).size;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F2F3F8] dark:bg-[#111214] px-6 py-12 md:px-16 lg:px-24 flex flex-col justify-start select-none animate-fade-in transition-colors duration-200">
      <div className="max-w-[840px] w-full mx-auto flex flex-col gap-10">
        
        {/* Header Greeting Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/40 dark:border-[#2E3039] pb-6">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.2em] block leading-none">
              {getGreeting()}, writer
            </span>
            <h1 className="text-3xl font-normal font-serif text-stone-900 dark:text-stone-100 tracking-tight leading-tight">
              Personal Writing Overview
            </h1>
          </div>
          
          {/* Subtle Security Status Indicator */}
          <div className="flex items-center gap-2 text-xs font-semibold self-start md:self-center px-3 py-1.5 rounded-sm border border-stone-200/60 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] text-stone-500 dark:text-stone-400">
            {vaultPasswordExists ? (
              isLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
                  <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500">Vault Locked</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Vault Unlocked</span>
                  <button 
                    onClick={lock}
                    className="ms-2 text-[10px] uppercase font-bold text-stone-400 dark:text-stone-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    Lock
                  </button>
                </>
              )
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500">Vault Inactive</span>
              </>
            )}
          </div>
        </div>

        {/* Workspace Empty State Fallback */}
        {totalNotesCount === 0 && (
          <div className="py-12 text-center flex flex-col items-center gap-4">
            <p className="text-sm text-stone-500 dark:text-stone-400 font-serif">
              Your workspace is completely ready. Create your first note or import a Markdown file to start.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleCreateNote(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1D2EA0] dark:bg-[#A3B5F5] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer rounded-sm"
              >
                New Note
              </button>
              <label className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-[#2E3039] hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors cursor-pointer rounded-sm">
                Import Markdown
                <input
                  type="file"
                  accept=".md,.txt,.markdown"
                  multiple
                  onChange={async (e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    if (files.length > 0) {
                      // Trigger main file importer via custom event or reload simulation
                      const fileEvent = new CustomEvent('importMarkdownFiles', { detail: files });
                      window.dispatchEvent(fileEvent);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {totalNotesCount > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Main Column - Left/Center (Span 2) */}
            <div className="lg:col-span-2 flex flex-col gap-8">
              
              {/* Continue Writing Prominence */}
              {continueNote && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest leading-none">
                    Continue Writing
                  </h3>
                  {(() => {
                    const disp = getNoteDisplay(continueNote);
                    return (
                      <button
                        type="button"
                        onClick={() => setActiveNoteId(continueNote.id)}
                        className="group flex flex-col gap-2 w-full text-left py-4 px-5 rounded-sm border border-stone-200/55 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] hover:border-[#1D2EA0] dark:hover:border-[#A3B5F5] transition-all cursor-pointer shadow-[0_1px_4px_rgba(0,0,0,0.01)] dark:shadow-none"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-lg font-serif font-semibold text-stone-800 dark:text-stone-200 group-hover:text-[#1D2EA0] dark:group-hover:text-[#A3B5F5] transition-colors line-clamp-1">
                            {disp.title}
                          </span>
                          {continueNote.isPinned && <Pin className="w-3.5 h-3.5 text-stone-400" />}
                        </div>
                        <p className="text-xs text-stone-400 dark:text-stone-500 line-clamp-2 leading-relaxed">
                          {disp.content ? disp.content.substring(0, 150).replace(/[#*`_~]/g, '') : 'No additional content...'}
                        </p>
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 font-medium flex items-center gap-2 mt-1 border-t border-stone-100 dark:border-[#2E3039]/40 pt-2.5 w-full">
                          <Calendar className="w-3 h-3 text-stone-400" />
                          <span>Edited {new Date(continueNote.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>·</span>
                          <span>{disp.wordCount} words</span>
                        </div>
                      </button>
                    );
                  })()}
                </div>
              )}

              {/* Recently Edited List */}
              {recentNotes.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest leading-none">
                    Recently Edited
                  </h3>
                  <div className="flex flex-col border border-stone-200/50 dark:border-[#2E3039] rounded-sm divide-y divide-stone-200/30 dark:divide-[#2E3039]/50 bg-white dark:bg-[#1A1B1E]">
                    {recentNotes.map((note) => {
                      const disp = getNoteDisplay(note);
                      const noteFolder = folders.find(f => f.id === note.folderId);
                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => setActiveNoteId(note.id)}
                          className="flex items-center justify-between w-full py-3 px-4 hover:bg-stone-50 dark:hover:bg-stone-900/40 text-stone-600 dark:text-stone-300 transition-colors cursor-pointer text-left"
                        >
                          <div className="flex flex-col gap-0.5 max-w-[70%]">
                            <span className="font-serif font-medium text-stone-800 dark:text-stone-200 truncate group-hover:text-[#1D2EA0] text-sm">
                              {disp.title}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                              {noteFolder && (
                                <span className="flex items-center gap-1">
                                  <Folder className="w-2.5 h-2.5" />
                                  <span>{noteFolder.name}</span>
                                  <span>·</span>
                                </span>
                              )}
                              <span>{disp.wordCount} words</span>
                            </div>
                          </div>
                          <span className="text-[10px] text-stone-400 font-normal shrink-0 flex items-center gap-1">
                            {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            <ChevronRight className="w-3 h-3 text-stone-300" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Writing Activity Statistics Grid */}
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest leading-none">
                  Writing Activity
                </h3>
                <div className="grid grid-cols-3 gap-4 border border-stone-200/50 dark:border-[#2E3039] p-4 rounded-sm bg-white dark:bg-[#1A1B1E]">
                  <div className="flex flex-col">
                    <span className="text-xl font-serif text-[#1D2EA0] dark:text-[#A3B5F5] font-medium leading-tight">
                      {totalNotesCount}
                    </span>
                    <span className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-1 font-bold">
                      Active Notes
                    </span>
                  </div>
                  <div className="flex flex-col border-s border-stone-200/50 dark:border-[#2E3039] ps-4">
                    <span className="text-xl font-serif text-[#1D2EA0] dark:text-[#A3B5F5] font-medium leading-tight">
                      {totalWords.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-1 font-bold">
                      Words Written
                    </span>
                  </div>
                  <div className="flex flex-col border-s border-stone-200/50 dark:border-[#2E3039] ps-4">
                    <span className="text-xl font-serif text-[#1D2EA0] dark:text-[#A3B5F5] font-medium leading-tight">
                      {activeFoldersCount}
                    </span>
                    <span className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-1 font-bold">
                      Active Folders
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Sidebar Column - Right (Span 1) */}
            <div className="lg:col-span-1 flex flex-col gap-8">
              
              {/* Quick Actions Panel */}
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest leading-none">
                  Quick Actions
                </h3>
                <div className="flex flex-col border border-stone-200/55 dark:border-[#2E3039] rounded-sm bg-white dark:bg-[#1A1B1E] divide-y divide-stone-100 dark:divide-[#2E3039]/50 overflow-hidden">
                  <button
                    onClick={() => handleCreateNote(false)}
                    className="flex items-center gap-3 w-full py-3 px-4 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/40 transition-colors text-left cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-stone-400" />
                    <span>New Document</span>
                  </button>
                  <button
                    onClick={() => {
                      if (!vaultPasswordExists) {
                        setActiveNoteId('settings');
                        showToast('Please set a Vault password in Security settings first.', 'info');
                      } else if (isLocked) {
                        showToast('Please unlock your Secure Vault to create secure notes.', 'info');
                      } else {
                        handleCreateNote(true);
                      }
                    }}
                    className="flex items-center gap-3 w-full py-3 px-4 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/40 transition-colors text-left cursor-pointer"
                  >
                    <Shield className="w-4 h-4 text-stone-400" />
                    <span>Create Secure Note</span>
                  </button>
                  <button
                    onClick={() => setCommandPaletteOpen(true)}
                    className="flex items-center gap-3 w-full py-3 px-4 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/40 transition-colors text-left cursor-pointer"
                  >
                    <Search className="w-4 h-4 text-stone-400" />
                    <span>Search Workspace</span>
                  </button>
                </div>
              </div>

              {/* Secure Vault Dashboard Area */}
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest leading-none">
                  Secure Vault
                </h3>
                <div className="border border-stone-200/55 dark:border-[#2E3039] rounded-sm p-4 bg-white dark:bg-[#1A1B1E] flex flex-col gap-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                      {secureNotesCount} Protected {secureNotesCount === 1 ? 'Note' : 'Notes'}
                    </span>
                    {vaultPasswordExists && (
                      isLocked ? (
                        <Lock className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Unlock className="w-4 h-4 text-emerald-500" />
                      )
                    )}
                  </div>

                  {!vaultPasswordExists ? (
                    <div className="flex flex-col gap-2.5">
                      <p className="text-[11px] text-stone-400 leading-relaxed font-medium">
                        Create a private, client-side encrypted vault to protect your sensitive journals or projects.
                      </p>
                      <button
                        onClick={() => setActiveNoteId('settings')}
                        className="w-full py-2 bg-[#1D2EA0] dark:bg-[#A3B5F5] text-white font-bold text-xs rounded-sm hover:opacity-90 transition-all cursor-pointer text-center"
                      >
                        Set Vault Password
                      </button>
                    </div>
                  ) : isLocked ? (
                    <form onSubmit={handleUnlockVault} className="flex flex-col gap-2.5">
                      <p className="text-[11px] text-stone-400 leading-relaxed font-medium">
                        Vault is securely locked. Unlock to decrypt titles, search content, or edit secure documents.
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <input
                          type="password"
                          placeholder="Vault Password"
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          className={`w-full py-2 px-3 border rounded-sm text-xs bg-[#F2F3F8] dark:bg-[#111214] text-stone-800 dark:text-stone-100 outline-none transition-colors
                            ${unlockError ? 'border-red-400 dark:border-red-500' : 'border-stone-200 dark:border-[#2E3039] focus:border-[#1D2EA0] dark:focus:border-[#A3B5F5]'}`}
                          disabled={isSubmitting}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-2 bg-[#1D2EA0] dark:bg-[#A3B5F5] text-white font-bold text-xs rounded-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer text-center disabled:opacity-50"
                      >
                        {isSubmitting ? 'Decrypting...' : 'Unlock Vault'}
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <p className="text-[11px] text-stone-400 leading-relaxed font-medium">
                        Vault is unlocked. Your sensitive notes are fully decrypted and active.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveCategory('all');
                            setActiveNoteId(null);
                            showToast('Browse all notes. Secure notes are now decrypted and fully visible.', 'info');
                          }}
                          className="flex-1 py-2 border border-[#1D2EA0] dark:border-[#A3B5F5] text-[#1D2EA0] dark:text-[#A3B5F5] font-semibold text-xs rounded-sm hover:bg-stone-50 dark:hover:bg-stone-900/50 transition-colors cursor-pointer text-center"
                        >
                          Open Secure Notes
                        </button>
                        <button
                          onClick={lock}
                          className="py-2 px-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 font-bold text-xs rounded-sm transition-all cursor-pointer text-center"
                        >
                          Lock Vault
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Pinned & Favorites Side Drawer View */}
              {pinnedNotes.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest leading-none">
                    Pinned Notes
                  </h3>
                  <div className="flex flex-col border border-stone-200/55 dark:border-[#2E3039] rounded-sm bg-white dark:bg-[#1A1B1E] divide-y divide-stone-100 dark:divide-[#2E3039]/40 overflow-hidden">
                    {pinnedNotes.map((note) => {
                      const disp = getNoteDisplay(note);
                      return (
                        <button
                          key={note.id}
                          onClick={() => setActiveNoteId(note.id)}
                          className="flex items-center justify-between py-2.5 px-3.5 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/30 transition-colors text-left cursor-pointer font-medium"
                        >
                          <span className="truncate max-w-[80%] font-serif">{disp.title}</span>
                          <Pin className="w-3 h-3 text-stone-400" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {favoriteNotes.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest leading-none">
                    Favorites
                  </h3>
                  <div className="flex flex-col border border-stone-200/55 dark:border-[#2E3039] rounded-sm bg-white dark:bg-[#1A1B1E] divide-y divide-stone-100 dark:divide-[#2E3039]/40 overflow-hidden">
                    {favoriteNotes.map((note) => {
                      const disp = getNoteDisplay(note);
                      return (
                        <button
                          key={note.id}
                          onClick={() => setActiveNoteId(note.id)}
                          className="flex items-center justify-between py-2.5 px-3.5 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/30 transition-colors text-left cursor-pointer font-medium"
                        >
                          <span className="truncate max-w-[80%] font-serif">{disp.title}</span>
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
