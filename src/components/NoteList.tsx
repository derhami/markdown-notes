/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Search, Star, Pin, FileText, ArrowUpDown, Trash2, 
  ChevronRight, Folder, FolderPlus, Plus, MoreVertical,
  Lock, Unlock, Shield
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useToastStore } from '../stores/useToastStore';
import { useNoteActionsStore } from '../stores/useNoteActionsStore';
import { useVaultStore } from '../stores/useVaultStore';
import { generateId } from '../utils/id';
import FolderTree from './FolderTree';
import Modal from './Modal';
import type { Note, Folder as FolderType } from '../types';

export default function NoteList() {
  const { 
    activeCategory, setActiveCategory, activeNoteId, setActiveNoteId, searchQuery, setSearchQuery 
  } = useWorkspaceStore();
  const { settings } = useSettingsStore();
  const { showToast } = useToastStore();
  const { isLocked, showHidden, decryptedNotes } = useVaultStore();

  // Folder & subfolder modal states
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);

  // Sorting state
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'alpha' | 'wordCount'>('updated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Query notes
  const rawNotes = useLiveQuery(() => db.notes.toArray()) || [];
  const folders = useLiveQuery(() => db.folders.toArray()) || [];

  // Filter notes based on active Category
  let filteredNotes = rawNotes.filter((note) => {
    // Exclude hidden notes globally unless explicitly allowed in security settings
    if (note.isHidden && !showHidden) {
      return false;
    }

    if (activeCategory === 'trash') {
      return note.deletedAt !== null;
    }
    if (note.deletedAt !== null) return false;

    // Filter by Archive state
    if (activeCategory === 'archive') {
      return !!note.isArchived;
    }
    if (note.isArchived) return false;

    if (activeCategory === 'all' || activeCategory === 'folders' || activeCategory === 'recent') {
      return true;
    } else if (activeCategory === 'favorites') {
      return note.isFavorite;
    } else if (activeCategory === 'pinned') {
      return note.isPinned;
    } else if (activeCategory.startsWith('folder:')) {
      const folderId = activeCategory.substring(7);
      return note.folderId === folderId;
    } else if (activeCategory.startsWith('tag:')) {
      const tagName = activeCategory.substring(4);
      return note.tags.includes(tagName);
    }
    return true;
  });

  // Search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filteredNotes = filteredNotes.filter((note) => {
      // Secure note masking under search
      let noteTitle = note.title || '';
      let noteContent = note.content || '';

      if (note.isEncrypted) {
        if (isLocked) {
          noteTitle = 'Locked Note';
          noteContent = '';
        } else {
          const dec = decryptedNotes[note.id];
          noteTitle = dec?.title || 'Untitled Secure Note';
          noteContent = dec?.content || '';
        }
      }

      const titleMatch = noteTitle.toLowerCase().includes(query);
      const contentMatch = noteContent.toLowerCase().includes(query);
      return titleMatch || contentMatch;
    });
  }

  // Sort notes
  filteredNotes.sort((a, b) => {
    let valA: any = a.updatedAt;
    let valB: any = b.updatedAt;

    if (sortBy === 'created') {
      valA = a.createdAt;
      valB = b.createdAt;
    } else if (sortBy === 'alpha') {
      valA = (a.title || 'Untitled Note').toLowerCase();
      valB = (b.title || 'Untitled Note').toLowerCase();
    } else if (sortBy === 'wordCount') {
      valA = a.wordCount || 0;
      valB = b.wordCount || 0;
    }

    if (valA < valB) return sortOrder === 'desc' ? 1 : -1;
    if (valA > valB) return sortOrder === 'desc' ? -1 : 1;
    return 0;
  });

  // Float pinned notes to top
  if (activeCategory !== 'trash' && activeCategory !== 'pinned') {
    const pinned = filteredNotes.filter(n => n.isPinned);
    const unpinned = filteredNotes.filter(n => !n.isPinned);
    filteredNotes = [...pinned, ...unpinned];
  }

  // Dynamic note actions
  const { openActions } = useNoteActionsStore();

  const handleToggleFavorite = async (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    try {
      await db.notes.update(note.id, { isFavorite: !note.isFavorite });
      showToast(note.isFavorite ? 'Removed from favorites' : 'Added to favorites', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePin = async (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    try {
      await db.notes.update(note.id, { isPinned: !note.isPinned });
      showToast(note.isPinned ? 'Note unpinned' : 'Note pinned to top', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmptyTrash = async () => {
    if (window.confirm('Empty Trash? All notes inside will be permanently deleted.')) {
      try {
        const trashed = rawNotes.filter(n => n.deletedAt !== null);
        for (const note of trashed) {
          await db.notes.delete(note.id);
        }
        showToast('Trash emptied', 'success');
        setActiveNoteId(null);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Folder Actions inside Document Browser
  const handleOpenFolderModal = (parentId: string | null = null) => {
    setEditingFolder(null);
    setFolderName('');
    setParentFolderId(parentId);
    setIsFolderModalOpen(true);
  };

  const handleOpenRenameFolderModal = (folder: FolderType) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setParentFolderId(folder.parentId);
    setIsFolderModalOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    try {
      const now = Date.now();
      if (editingFolder) {
        await db.folders.update(editingFolder.id, {
          name: folderName.trim(),
          updatedAt: now
        });
        showToast('Folder renamed', 'success');
      } else {
        const newFolder: FolderType = {
          id: generateId(),
          name: folderName.trim(),
          parentId: parentFolderId,
          createdAt: now,
          updatedAt: now
        };
        await db.folders.add(newFolder);
        showToast('Folder created', 'success');
      }
      setIsFolderModalOpen(false);
      setFolderName('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this folder? Notes inside will be moved to Trash.')) {
      try {
        const now = Date.now();
        const notesToTrash = rawNotes.filter(n => n.folderId === id && !n.deletedAt);
        for (const note of notesToTrash) {
          await db.notes.update(note.id, { deletedAt: now });
        }
        await db.folders.delete(id);
        showToast('Folder deleted', 'success');
        setActiveCategory('all');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Check if Folders sidebar should be displayed
  const showFoldersTree = activeCategory === 'folders' || activeCategory.startsWith('folder:');

  return (
    <div className="w-full h-full bg-white dark:bg-[#1A1B1E] flex flex-col overflow-hidden select-none">
      
      {/* Search Header */}
      <div className="p-4 flex flex-col gap-3 shrink-0 border-b border-stone-100 dark:border-[#2E3039]">
        {/* Sleek Search bar */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            id="input-browser-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes... (Ctrl+K)"
            className="w-full py-1.5 pl-9 pr-3 bg-stone-50 dark:bg-[#111214] border border-[#D1D4DC] dark:border-[#2E3039] rounded text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-[#1D2EA0] transition-all"
          />
        </div>

        {/* Browser Sorting & Filter indicators */}
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-stone-400">
          <button
            type="button"
            id="btn-sort-cycle"
            onClick={() => {
              const sorts: ('updated' | 'created' | 'alpha' | 'wordCount')[] = ['updated', 'created', 'alpha', 'wordCount'];
              const nextIdx = (sorts.indexOf(sortBy) + 1) % sorts.length;
              setSortBy(sorts[nextIdx]);
            }}
            className="flex items-center gap-1 hover:text-stone-700 dark:hover:text-stone-200 transition-colors py-0.5 rounded cursor-pointer"
          >
            <ArrowUpDown className="w-3 h-3" />
            <span>Sort: {sortBy}</span>
          </button>

          <button
            type="button"
            id="btn-sort-order-toggle"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
          >
            {sortOrder}
          </button>
        </div>

        {activeCategory === 'trash' && filteredNotes.length > 0 && (
          <button
            type="button"
            id="btn-empty-trash"
            onClick={handleEmptyTrash}
            className="flex items-center justify-center gap-1 w-full py-1.5 text-[11px] font-bold border border-rose-100 dark:border-rose-950/40 hover:bg-rose-50 dark:hover:bg-rose-950/10 text-rose-600 dark:text-rose-400 rounded transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Empty Trash Bin</span>
          </button>
        )}
      </div>

      {/* Dynamic Browser List scroll area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        
        {/* Folders Explorer (Visible in Folders view) */}
        {showFoldersTree && (
          <div className="px-3 pt-3 border-b border-stone-100 dark:border-[#2E3039]/60 pb-3 flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
              <span>Directory Tree</span>
              <button
                type="button"
                id="btn-create-root-folder"
                onClick={() => handleOpenFolderModal(null)}
                className="hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer flex items-center gap-0.5"
                title="Create Root Folder"
              >
                <Plus className="w-3 h-3" />
                <span>Add Folder</span>
              </button>
            </div>
            
            <FolderTree 
              onRenameFolder={handleOpenRenameFolderModal}
              onDeleteFolder={handleDeleteFolder}
              onCreateSubfolder={handleOpenFolderModal}
            />
          </div>
        )}

        {/* Notes list label header */}
        <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
          {activeCategory === 'trash' ? 'Trash Documents' : 'Documents'}
        </div>

        {/* Note list elements */}
        {filteredNotes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-stone-400 italic">
            <span className="text-xs">No documents found.</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredNotes.map((note) => {
              const isSelected = activeNoteId === note.id;
              
              let displayTitle = note.title || 'Untitled Document';
              let displayWordCount = note.wordCount || 0;
              let isSecure = !!note.isEncrypted;

              if (isSecure) {
                if (isLocked) {
                  displayTitle = 'Locked Note';
                  displayWordCount = 0;
                } else {
                  const dec = decryptedNotes[note.id];
                  displayTitle = dec?.title || 'Untitled Secure Note';
                  displayWordCount = dec?.content ? dec.content.trim().split(/\s+/).filter(Boolean).length : 0;
                }
              }

              // Simple text direction checker for note title
              const isTitleRtl = /[\u0600-\u06FF]/.test(displayTitle);

              return (
                <div
                  key={note.id}
                  id={`browser-note-${note.id}`}
                  onClick={() => setActiveNoteId(note.id)}
                  className={`group relative flex flex-col gap-1 py-3 px-4 border-b border-stone-100/40 dark:border-[#2E3039]/30 transition-all cursor-pointer select-none
                    ${isTitleRtl ? 'text-right' : 'text-left'}
                    ${isSelected 
                      ? 'bg-[#F2F3F8] dark:bg-[#222328]' 
                      : 'hover:bg-stone-50/50 dark:hover:bg-[#2E3039]/20'}`}
                >
                  {/* Note Row Heading */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {isSecure && (
                        isLocked ? (
                          <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                        ) : (
                          <Unlock className="w-3 h-3 text-emerald-500 shrink-0" />
                        )
                      )}
                      <h3 className={`text-xs font-semibold leading-snug truncate flex-1
                        ${isSelected ? 'text-stone-900 dark:text-stone-100' : 'text-stone-700 dark:text-stone-300'}
                        ${(!note.title && !isSecure) ? 'italic text-stone-400' : ''}`}
                        style={{ fontFamily: isTitleRtl ? "'Vazirmatn', sans-serif" : 'inherit' }}
                      >
                        {displayTitle}
                      </h3>
                    </div>

                    {/* pin/favorite/more triggers visible on row hover and always on mobile */}
                    <div className="opacity-100 md:opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                      {activeCategory !== 'trash' && (
                        <>
                          <button
                            type="button"
                            id={`btn-browse-pin-${note.id}`}
                            onClick={(e) => handleTogglePin(e, note)}
                            className={`p-0.5 rounded hover:bg-stone-250 dark:hover:bg-stone-750 transition-colors cursor-pointer
                              ${note.isPinned ? 'text-[#1D2EA0] dark:text-[#A3B5F5]' : 'text-stone-300 dark:text-stone-700'}`}
                          >
                            <Pin className="w-3 h-3 fill-current" />
                          </button>
                          <button
                            type="button"
                            id={`btn-browse-fav-${note.id}`}
                            onClick={(e) => handleToggleFavorite(e, note)}
                            className={`p-0.5 rounded hover:bg-stone-250 dark:hover:bg-stone-750 transition-colors cursor-pointer
                              ${note.isFavorite ? 'text-amber-500' : 'text-stone-300 dark:text-stone-700'}`}
                          >
                            <Star className="w-3 h-3 fill-current" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        id={`btn-browse-more-${note.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const isMobile = window.innerWidth < 768;
                          openActions(note.id, isMobile);
                        }}
                        className="p-0.5 rounded hover:bg-stone-250 dark:hover:bg-stone-750 transition-colors cursor-pointer text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200"
                        title="Document Actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Note Metadata row */}
                  <div className="flex items-center justify-between text-[9px] text-stone-400 font-medium">
                    <span>
                      {formatDate(note.updatedAt)}
                    </span>
                    <span>
                      {displayWordCount} words
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Folders modal (retained for folder creation inside NoteList) */}
      <Modal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title={editingFolder ? 'Rename Folder' : 'Create Folder'}
      >
        <form onSubmit={handleSaveFolder} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-stone-500">Folder Name</label>
            <input
              type="text"
              id="input-notelist-folder-name"
              required
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full px-3 py-2 rounded border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#111214] text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-[#1D2EA0] text-sm"
              placeholder="e.g. My Projects"
            />
          </div>
          <div className="flex items-center gap-2 mt-2 justify-end">
            <button
              type="button"
              id="btn-notelist-folder-cancel"
              onClick={() => setIsFolderModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-stone-500 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-notelist-folder-submit"
              className="px-4 py-1.5 rounded text-xs text-white bg-[#1D2EA0] hover:bg-[#18298B]"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
