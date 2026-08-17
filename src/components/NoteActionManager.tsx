/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Folder, Tag, Star, Pin, Trash2, Edit3, Copy, Download, Share2, 
  Info, Archive, AlertTriangle, FileText, Check, X, Clipboard,
  Plus, Undo, FolderClosed
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useNoteActionsStore } from '../stores/useNoteActionsStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useToastStore } from '../stores/useToastStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import {
  calculateWordCount, calculateCharacterCount, calculateReadingTime, 
  stringifyFrontmatter, sanitizeFileName 
} from '../utils/notesHelper';
import { generateId } from '../utils/id';
import Modal from './Modal';
import type { Note, Folder as FolderType, Tag as TagType } from '../types';

export default function NoteActionManager() {
  const { 
    actionNoteId, isOpenBottomSheet, isOpenRenameModal, isOpenSaveAsModal,
    isOpenMoveModal, isOpenTagsModal, isOpenDeleteConfirmModal, isOpenInfoModal,
    closeAll, setOpenRenameModal, setOpenSaveAsModal, setOpenMoveModal,
    setOpenTagsModal, setOpenDeleteConfirmModal, setOpenInfoModal
  } = useNoteActionsStore();

  const { activeNoteId, setActiveNoteId, setActiveCategory } = useWorkspaceStore();
  const { showToast } = useToastStore();
  const { settings } = useSettingsStore();

  // Load the selected note dynamically
  const note = useLiveQuery(
    () => (actionNoteId ? db.notes.get(actionNoteId) : Promise.resolve(undefined)),
    [actionNoteId]
  );

  // Load all folders and tags
  const folders = useLiveQuery(() => db.folders.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];

  // Local state for modals
  const [renameTitle, setRenameTitle] = useState('');
  const [saveAsTitle, setSaveAsTitle] = useState('');
  const [tagInput, setTagInput] = useState('');

  // Sync modal states
  useEffect(() => {
    if (note) {
      setRenameTitle(note.title || '');
      setSaveAsTitle(note.title ? `${note.title} (Copy)` : 'Copy of Document');
    }
  }, [note?.id]);

  if (!note) return null;

  // Master Note Actions implementation
  const handleToggleFavorite = async () => {
    try {
      await db.notes.update(note.id, { isFavorite: !note.isFavorite });
      showToast(note.isFavorite ? 'Removed from favorites' : 'Added to favorites', 'success');
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePin = async () => {
    try {
      await db.notes.update(note.id, { isPinned: !note.isPinned });
      showToast(note.isPinned ? 'Unpinned document' : 'Pinned document to top', 'success');
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleArchive = async () => {
    try {
      const nextArchiveState = !note.isArchived;
      await db.notes.update(note.id, { isArchived: nextArchiveState });
      showToast(nextArchiveState ? 'Document archived' : 'Document restored from archive', 'success');
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTrash = async () => {
    try {
      if (note.deletedAt) {
        // Restore from Trash
        await db.notes.update(note.id, { deletedAt: null });
        showToast('Document restored', 'success');
      } else {
        // Move to Trash
        await db.notes.update(note.id, { deletedAt: Date.now() });
        showToast('Document moved to Trash', 'info');
        if (activeNoteId === note.id) {
          setActiveNoteId(null);
        }
      }
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicate = async () => {
    try {
      const now = Date.now();
      const duplicateId = generateId();
      const duplicatedNote: Note = {
        ...note,
        id: duplicateId,
        title: note.title ? `${note.title} (Duplicate)` : 'Untitled Duplicate',
        createdAt: now,
        updatedAt: now,
        isPinned: false
      };
      await db.notes.add(duplicatedNote);
      showToast('Document duplicated', 'success');
      setActiveNoteId(duplicateId);
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = renameTitle.trim();
    try {
      await db.notes.update(note.id, { 
        title: finalTitle || 'Untitled Document',
        updatedAt: Date.now()
      });
      showToast('Document renamed', 'success');
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = saveAsTitle.trim();
    try {
      const now = Date.now();
      const saveAsId = generateId();
      const savedAsNote: Note = {
        ...note,
        id: saveAsId,
        title: finalTitle || 'Untitled Document',
        createdAt: now,
        updatedAt: now,
        isPinned: false,
        isFavorite: false
      };
      await db.notes.add(savedAsNote);
      showToast(`Saved as "${finalTitle || 'Untitled'}"`, 'success');
      setActiveNoteId(saveAsId);
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMoveToFolder = async (folderId: string | null) => {
    try {
      await db.notes.update(note.id, { folderId, updatedAt: Date.now() });
      const folderName = folderId ? folders.find(f => f.id === folderId)?.name : 'Root';
      showToast(`Moved to ${folderName}`, 'success');
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTag = tagInput.trim().toLowerCase().replace(/#/g, '');
    if (!cleanTag) return;

    try {
      // Add tag to the database tags dictionary if it does not exist
      const existingTag = await db.tags.where('name').equalsIgnoreCase(cleanTag).first();
      if (!existingTag) {
        await db.tags.add({
          id: generateId(),
          name: cleanTag,
          color: '#3E5A80',
          createdAt: Date.now()
        });
      }

      // Append tag to note
      const currentTags = note.tags || [];
      if (!currentTags.includes(cleanTag)) {
        const updatedTags = [...currentTags, cleanTag];
        await db.notes.update(note.id, { tags: updatedTags, updatedAt: Date.now() });
        showToast(`Tag #${cleanTag} added`, 'success');
      } else {
        showToast('Tag already exists on this note', 'info');
      }
      setTagInput('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveTag = async (tagName: string) => {
    try {
      const updatedTags = (note.tags || []).filter(t => t !== tagName);
      await db.notes.update(note.id, { tags: updatedTags, updatedAt: Date.now() });
      showToast(`Removed tag #${tagName}`, 'info');
    } catch (err) {
      console.error(err);
    }
  };

  const handlePermanentDelete = async () => {
    try {
      await db.notes.delete(note.id);
      showToast('Document permanently deleted', 'success');
      if (activeNoteId === note.id) {
        setActiveNoteId(null);
      }
      closeAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyMarkdown = async () => {
    const rawContent = note.content || '';
    const success = await copyToClipboard(rawContent);
    if (success) {
      showToast('Markdown content copied to clipboard', 'success');
    } else {
      showToast('Failed to copy to clipboard', 'error');
    }
    closeAll();
  };

  const handleExportMarkdownFile = () => {
    const metadata = {
      title: note.title || 'Untitled Document',
      tags: note.tags || [],
      created: new Date(note.createdAt).toISOString(),
      updated: new Date(note.updatedAt).toISOString()
    };
    const fileContent = stringifyFrontmatter(note.content || '', metadata);
    const fileName = `${sanitizeFileName(note.title || 'Untitled Document')}.md`;
    const blob = new Blob([fileContent], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    showToast('Markdown downloaded', 'success');
    closeAll();
  };

  const handleShareNote = async () => {
    const shareUrl = `${window.location.origin}/?note=${note.id}`;
    
    // Check for standard Web Share API support
    if (navigator.share) {
      try {
        await navigator.share({
          title: note.title || 'Untitled Document',
          text: `Check out this markdown note: ${note.title || 'Untitled'}`,
          url: shareUrl
        });
        showToast('Shared successfully', 'success');
        closeAll();
        return;
      } catch (err) {
        // Fallback to clipboard if share cancelled/errored
      }
    }

    const copied = await copyToClipboard(shareUrl);
    if (copied) {
      showToast('Note share link copied to clipboard', 'success');
    }
    closeAll();
  };

  // Helper copy fallback
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  // Human-readable formatted dates
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Stats
  const wordCount = calculateWordCount(note.content || '');
  const charCount = calculateCharacterCount(note.content || '');
  const readingTime = calculateReadingTime(note.content || '');

  return (
    <>
      {/* 1. Mobile Action Sheet (Bottom Sheet overlay) */}
      {isOpenBottomSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center select-none animate-fade-in">
          {/* Backdrop */}
          <div 
            onClick={closeAll}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
          />

          {/* Action sheet card sliding up from bottom */}
          <div className="relative w-full max-w-md bg-white dark:bg-[#141519] border-t border-[#E5E4DF] dark:border-[#20222B] rounded-t-lg shadow-2xl flex flex-col z-10 animate-slide-up">
            
            {/* Header / Info Handle */}
            <div className="w-full flex flex-col items-center pt-2.5 pb-3 border-b border-stone-100 dark:border-[#20222B] shrink-0">
              <div className="w-10 h-1 bg-stone-200 dark:bg-stone-800 rounded-full mb-2.5 shrink-0" />
              <div className="px-6 text-center max-w-xs">
                <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-serif truncate">
                  {note.title || 'Untitled Document'}
                </h4>
                <p className="text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-1">
                  {wordCount} words · {charCount} chars · {readingTime} min read
                </p>
              </div>
            </div>

            {/* Compact Grid of Quick Status Toggles (Pin, Favorite, Archive, Trash) */}
            <div className="grid grid-cols-4 gap-1.5 px-4 py-2 bg-stone-50/50 dark:bg-[#1C1D24]/40 border-b border-stone-100 dark:border-[#20222B] shrink-0 text-[10px] font-bold">
              <button
                type="button"
                onClick={handleTogglePin}
                className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded transition-all cursor-pointer ${
                  note.isPinned 
                    ? 'bg-[#3E5A80]/10 dark:bg-[#5A89C7]/10 text-[#3E5A80] dark:text-[#5A89C7]' 
                    : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100/50 dark:hover:bg-stone-850/50'
                }`}
              >
                <Pin className={`w-3.5 h-3.5 ${note.isPinned ? 'fill-current' : ''}`} />
                <span>{note.isPinned ? 'Pinned' : 'Pin'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFavorite}
                className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded transition-all cursor-pointer ${
                  note.isFavorite 
                    ? 'bg-amber-500/10 dark:bg-amber-500/10 text-amber-500' 
                    : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100/50 dark:hover:bg-stone-850/50'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${note.isFavorite ? 'fill-current' : ''}`} />
                <span>{note.isFavorite ? 'Starred' : 'Favorite'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleArchive}
                className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded transition-all cursor-pointer ${
                  note.isArchived 
                    ? 'bg-emerald-500/10 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                    : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100/50 dark:hover:bg-stone-850/50'
                }`}
              >
                <Archive className={`w-3.5 h-3.5 ${note.isArchived ? 'fill-current' : ''}`} />
                <span>{note.isArchived ? 'Archived' : 'Archive'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleTrash}
                className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded transition-all cursor-pointer text-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/10`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{note.deletedAt ? 'Restore' : 'Trash'}</span>
              </button>
            </div>

            {/* List of scrollable primary action items */}
            <div className="overflow-y-auto px-3 py-1.5 flex flex-col gap-0.5 text-xs font-semibold max-h-[45vh]">
              
              {activeNoteId !== note.id && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveNoteId(note.id);
                    closeAll();
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded hover:bg-stone-50 dark:hover:bg-[#1E2127]/30 text-stone-700 dark:text-stone-300 transition-colors text-left cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                  <span>Open & Edit Note</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  closeAll();
                  setOpenRenameModal(true);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-stone-50 dark:hover:bg-[#1E2127]/30 text-stone-700 dark:text-stone-300 transition-colors text-left cursor-pointer"
              >
                <Edit3 className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Rename Document</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeAll();
                  setOpenMoveModal(true);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-stone-50 dark:hover:bg-[#1E2127]/30 text-stone-700 dark:text-stone-300 transition-colors text-left cursor-pointer"
              >
                <Folder className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Move to Folder...</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeAll();
                  setOpenTagsModal(true);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-stone-50 dark:hover:bg-[#1E2127]/30 text-stone-700 dark:text-stone-300 transition-colors text-left cursor-pointer"
              >
                <Tag className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Manage Tags...</span>
              </button>

              <button
                type="button"
                onClick={handleDuplicate}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-stone-50 dark:hover:bg-[#1E2127]/30 text-stone-700 dark:text-stone-300 transition-colors text-left cursor-pointer"
              >
                <Copy className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Duplicate Document</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeAll();
                  setOpenSaveAsModal(true);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-stone-50 dark:hover:bg-[#1E2127]/30 text-stone-700 dark:text-stone-300 transition-colors text-left cursor-pointer"
              >
                <Clipboard className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Save Copy As...</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeAll();
                  setOpenInfoModal(true);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-stone-50 dark:hover:bg-[#1E2127]/30 text-stone-700 dark:text-stone-300 transition-colors text-left cursor-pointer"
              >
                <Info className="w-4 h-4 text-stone-400 shrink-0" />
                <span>Detailed File Info</span>
              </button>

              {note.deletedAt && (
                <button
                  type="button"
                  onClick={() => {
                    closeAll();
                    setOpenDeleteConfirmModal(true);
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded bg-rose-50/50 hover:bg-rose-100 dark:bg-rose-950/10 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 transition-colors text-left cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Permanently Delete</span>
                </button>
              )}

            </div>

            {/* Share & Export compact grid */}
            <div className="grid grid-cols-3 gap-1 px-4 py-2 bg-stone-50/50 dark:bg-[#1C1D24]/20 border-t border-stone-100 dark:border-[#20222B] shrink-0 text-[10px] font-bold text-center">
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="flex flex-col items-center justify-center gap-1 py-1 text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100 rounded hover:bg-stone-100/40 dark:hover:bg-[#1E2127]/40 transition-all cursor-pointer"
              >
                <Clipboard className="w-4 h-4 text-stone-400" />
                <span>Copy Raw</span>
              </button>

              <button
                type="button"
                onClick={handleExportMarkdownFile}
                className="flex flex-col items-center justify-center gap-1 py-1 text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100 rounded hover:bg-stone-100/40 dark:hover:bg-[#1E2127]/40 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-stone-400" />
                <span>Download</span>
              </button>

              <button
                type="button"
                onClick={handleShareNote}
                className="flex flex-col items-center justify-center gap-1 py-1 text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100 rounded hover:bg-stone-100/40 dark:hover:bg-[#1E2127]/40 transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-stone-400" />
                <span>Share Link</span>
              </button>
            </div>

            {/* Cancel Bottom Sheet Area */}
            <div className="p-3 border-t border-stone-100 dark:border-[#20222B] flex items-center justify-center shrink-0">
              <button
                type="button"
                onClick={closeAll}
                className="text-[10px] font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 uppercase tracking-widest cursor-pointer py-1"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 2. Rename Note Modal */}
      <Modal
        isOpen={isOpenRenameModal}
        onClose={closeAll}
        title="Rename Document"
      >
        <form onSubmit={handleRenameSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Note Title</label>
            <input
              type="text"
              id="input-rename-title"
              required
              autoFocus
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#3E5A80] dark:focus:ring-[#5A89C7] text-stone-900 dark:text-stone-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              type="button"
              id="btn-rename-cancel"
              onClick={closeAll}
              className="px-3 py-1.5 rounded-sm text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-rename-submit"
              className="px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest text-white bg-[#3E5A80] hover:bg-[#324B6B] dark:bg-[#5A89C7] dark:hover:bg-[#4873AA] cursor-pointer"
            >
              Rename
            </button>
          </div>
        </form>
      </Modal>

      {/* 3. Save Copy As Modal */}
      <Modal
        isOpen={isOpenSaveAsModal}
        onClose={closeAll}
        title="Save Copy As"
      >
        <form onSubmit={handleSaveAsSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">New File Name</label>
            <input
              type="text"
              id="input-save-as-title"
              required
              autoFocus
              value={saveAsTitle}
              onChange={(e) => setSaveAsTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#3E5A80] dark:focus:ring-[#5A89C7] text-stone-900 dark:text-stone-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              type="button"
              id="btn-save-as-cancel"
              onClick={closeAll}
              className="px-3 py-1.5 rounded-sm text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-save-as-submit"
              className="px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest text-white bg-[#3E5A80] hover:bg-[#324B6B] dark:bg-[#5A89C7] dark:hover:bg-[#4873AA] cursor-pointer"
            >
              Save As
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Move Note to Folder Modal */}
      <Modal
        isOpen={isOpenMoveModal}
        onClose={closeAll}
        title="Move to Folder"
      >
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
            Choose Destination
          </span>

          <button
            type="button"
            onClick={() => handleMoveToFolder(null)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-semibold text-left transition-colors cursor-pointer
              ${note.folderId === null 
                ? 'bg-[#3E5A80]/10 text-[#3E5A80] dark:bg-[#5A89C7]/15 dark:text-[#5A89C7]' 
                : 'hover:bg-stone-100 dark:hover:bg-stone-900 text-stone-700 dark:text-stone-300'}`}
          >
            <FolderClosed className="w-4 h-4" />
            <span>Root (No Folder)</span>
          </button>

          {folders.map((fold) => {
            const isNoteFolder = note.folderId === fold.id;
            return (
              <button
                key={fold.id}
                type="button"
                onClick={() => handleMoveToFolder(fold.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-semibold text-left transition-colors cursor-pointer
                  ${isNoteFolder 
                    ? 'bg-[#3E5A80]/10 text-[#3E5A80] dark:bg-[#5A89C7]/15 dark:text-[#5A89C7]' 
                    : 'hover:bg-stone-100 dark:hover:bg-stone-900 text-stone-700 dark:text-stone-300'}`}
              >
                <Folder className="w-4 h-4 shrink-0" />
                <span className="truncate">{fold.name}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* 5. Add / Edit Tags Modal */}
      <Modal
        isOpen={isOpenTagsModal}
        onClose={closeAll}
        title="Manage Tags"
      >
        <div className="flex flex-col gap-4">
          
          {/* Create New Tag */}
          <form onSubmit={handleAddTagSubmit} className="flex gap-2 items-end">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">New Tag Name</label>
              <input
                type="text"
                required
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-sm focus:outline-none focus:ring-1 focus:ring-[#3E5A80] dark:focus:ring-[#5A89C7] text-stone-900 dark:text-stone-100"
                placeholder="tag-name"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-sm text-xs font-bold uppercase text-white bg-[#3E5A80] hover:bg-[#324B6B] shrink-0 cursor-pointer h-8"
            >
              Add
            </button>
          </form>

          {/* Active Tags */}
          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Active Tags on Document</span>
            {(!note.tags || note.tags.length === 0) ? (
              <span className="text-xs text-stone-400 dark:text-stone-500 italic block py-2">
                No tags associated with this document.
              </span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {note.tags.map((tg, idx) => (
                  <span 
                    key={idx} 
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[#3E5A80]/10 border border-stone-200 dark:border-stone-800 text-[10px] text-[#3E5A80] dark:text-[#5A89C7] font-semibold"
                  >
                    <span>#{tg}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tg)}
                      className="hover:bg-[#3E5A80]/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Recommended Available Tags */}
          {tags.length > 0 && (
            <div className="flex flex-col gap-2 mt-2 border-t border-stone-100 dark:border-stone-850 pt-4">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Library Tags</span>
              <div className="flex flex-wrap gap-1.5">
                {tags
                  .filter(t => !note.tags?.includes(t.name))
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={async () => {
                        const currentTags = note.tags || [];
                        const updated = [...currentTags, t.name];
                        await db.notes.update(note.id, { tags: updated, updatedAt: Date.now() });
                        showToast(`Tag #${t.name} added`, 'success');
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-sm bg-stone-100 hover:bg-stone-200 dark:bg-stone-900 dark:hover:bg-stone-850 border border-stone-200/50 dark:border-stone-800 text-[10px] text-stone-500 dark:text-stone-400 font-semibold cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3 text-stone-400" />
                      <span>#{t.name}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-4 border-t border-stone-100 dark:border-stone-850 pt-3">
            <button
              type="button"
              onClick={closeAll}
              className="px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest text-white bg-[#3E5A80] hover:bg-[#324B6B] cursor-pointer"
            >
              Done
            </button>
          </div>

        </div>
      </Modal>

      {/* 6. Delete Confirmation Modal */}
      <Modal
        isOpen={isOpenDeleteConfirmModal}
        onClose={closeAll}
        title="Permanently Delete Document?"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3 rounded bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-950/20 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs font-semibold leading-relaxed">
              <p className="font-bold mb-1">This operation is permanent and cannot be undone.</p>
              <p>The file content, tags, metadata, and history for "{note.title || 'Untitled Document'}" will be deleted completely from your IndexedDB local database storage.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              type="button"
              id="btn-delete-confirm-cancel"
              onClick={closeAll}
              className="px-3 py-1.5 rounded-sm text-xs font-semibold text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="btn-delete-confirm-submit"
              onClick={handlePermanentDelete}
              className="px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest text-white bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700 cursor-pointer"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>

      {/* 7. Detailed File Info / Metadata Modal */}
      <Modal
        isOpen={isOpenInfoModal}
        onClose={closeAll}
        title="Document Metadata & History"
      >
        <div className="flex flex-col gap-4 text-xs font-semibold">
          
          <div className="flex flex-col gap-2.5 bg-stone-50 dark:bg-stone-900/40 p-4 rounded-sm border border-stone-200/50 dark:border-stone-850">
            <div className="flex justify-between items-center py-1 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-400">Document ID</span>
              <span className="font-mono text-[11px] text-stone-600 dark:text-stone-400 select-all">{note.id}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-400">Document Name</span>
              <span className="text-stone-800 dark:text-stone-200 truncate max-w-[200px]">{note.title || 'Untitled'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-400">Folder Path</span>
              <span className="text-stone-800 dark:text-stone-200">
                {note.folderId ? (folders.find(f => f.id === note.folderId)?.name || 'Folder Path') : 'Root (Unorganized)'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-400">Creation Date</span>
              <span className="text-stone-500">{formatDate(note.createdAt)}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-stone-400">Last Modified</span>
              <span className="text-stone-500">{formatDate(note.updatedAt)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 bg-stone-50 dark:bg-stone-900/40 p-4 rounded-sm border border-stone-200/50 dark:border-stone-850">
            <div className="flex justify-between items-center py-1 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-400">Word Count</span>
              <span className="font-mono font-bold text-stone-800 dark:text-stone-200">{wordCount}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-stone-100 dark:border-stone-800">
              <span className="text-stone-400">Character Count</span>
              <span className="font-mono font-bold text-[#3E5A80] dark:text-[#5A89C7]">{charCount}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-stone-400">Reading Speed</span>
              <span className="text-stone-800 dark:text-stone-200">~{readingTime} minutes read</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={closeAll}
              className="px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest text-white bg-[#3E5A80] hover:bg-[#324B6B] cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>
      </Modal>
    </>
  );
}
