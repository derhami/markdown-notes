/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileText, Star, Trash2, Folder as FolderIcon, Settings, Plus,
  Search, Moon, Sun, Monitor, PenTool, Archive
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useWorkspaceStore, SidebarCategory } from '../stores/useWorkspaceStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useToastStore } from '../stores/useToastStore';
import { generateId } from '../utils/id';
import Modal from './Modal';
import type { Folder, Tag, Note } from '../types';

export default function Sidebar() {
  const { 
    activeCategory, setActiveCategory, activeNoteId, setActiveNoteId, setCommandPaletteOpen 
  } = useWorkspaceStore();
  const { settings, updateSettings } = useSettingsStore();
  const { showToast } = useToastStore();
  
  // Storage size estimation
  const notes = useLiveQuery(() => db.notes.toArray()) || [];
  const folders = useLiveQuery(() => db.folders.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];
  
  const sizeEstimateKb = Math.round(
    (JSON.stringify(notes).length + JSON.stringify(folders).length + JSON.stringify(tags).length) / 1024
  );

  // Folder modal state (preserved for functional correctness)
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);

  // Triggering new note creation immediately
  const handleCreateNote = async () => {
    const now = Date.now();
    const folderId = activeCategory.startsWith('folder:') ? activeCategory.substring(7) : null;
    const initialTags = activeCategory.startsWith('tag:') ? [activeCategory.substring(4)] : [];
    
    const newNoteId = generateId();
    const newNote: Note = {
      id: newNoteId,
      title: '', // starts empty, auto-saves to untitled or extracted heading
      content: '',
      folderId,
      tags: initialTags,
      isFavorite: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      wordCount: 0,
      characterCount: 0,
      readingTime: 0,
      deletedAt: null
    };

    try {
      await db.notes.add(newNote);
      setActiveNoteId(newNoteId);
      showToast('New note created', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    try {
      const now = Date.now();
      const newFolder: Folder = {
        id: generateId(),
        name: folderName.trim(),
        parentId: parentFolderId,
        createdAt: now,
        updatedAt: now
      };
      await db.folders.add(newFolder);
      showToast('Folder created', 'success');
      setIsFolderModalOpen(false);
      setFolderName('');
    } catch (err) {
      console.error(err);
    }
  };

  const isFoldersTabActive = activeCategory === 'folders' || activeCategory.startsWith('folder:');

  return (
    <div className="w-[52px] md:w-[56px] h-full shrink-0 bg-[#E8E9EE] dark:bg-[#222328] border-e border-[#D1D4DC] dark:border-[#2E3039] flex flex-col items-center py-4 justify-between select-none z-20">
      
      {/* Top Action Slots */}
      <div className="flex flex-col gap-5 items-center w-full">
        {/* Logo Icon */}
        <div 
          className="p-2 text-[#1D2EA0] dark:text-[#A3B5F5] hover:scale-105 transition-transform"
          title="Markdown Notes"
        >
          <PenTool className="w-5 h-5" />
        </div>

        {/* Create Note Trigger */}
        <button
          type="button"
          id="btn-rail-new-note"
          onClick={handleCreateNote}
          className="w-8 h-8 rounded-md bg-[#1D2EA0] hover:bg-[#18298B] dark:bg-[#A3B5F5] dark:hover:bg-[#94A5F0] text-white flex items-center justify-center transition-colors cursor-pointer shadow-sm"
          title="Create New Note (Ctrl+N)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Middle Navigation Icons */}
      <div className="flex flex-col gap-2.5 items-center w-full">
        {/* Search */}
        <button
          type="button"
          id="btn-rail-search"
          onClick={() => setCommandPaletteOpen(true)}
          className="w-8.5 h-8.5 rounded-md flex items-center justify-center text-stone-500 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/60 hover:text-stone-900 dark:hover:text-stone-100 transition-all cursor-pointer"
          title="Search / Command Palette (Ctrl+K)"
        >
          <Search className="w-4.5 h-4.5" />
        </button>

        {/* All Notes list */}
        <button
          type="button"
          id="btn-rail-notes-all"
          onClick={() => {
            setActiveCategory('all');
            setActiveNoteId(null);
          }}
          className={`w-8.5 h-8.5 rounded-md flex items-center justify-center transition-all cursor-pointer
            ${activeCategory === 'all' && activeNoteId !== 'settings'
              ? 'bg-[#D1D4DC] dark:bg-[#2E3039] text-stone-900 dark:text-stone-100 font-semibold' 
              : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-850/40 hover:text-stone-900 dark:hover:text-stone-100'}`}
          title="All Documents"
        >
          <FileText className="w-4.5 h-4.5" />
        </button>

        {/* Folders List toggle */}
        <button
          type="button"
          id="btn-rail-folders"
          onClick={() => {
            setActiveCategory('folders');
            setActiveNoteId(null);
          }}
          className={`w-8.5 h-8.5 rounded-md flex items-center justify-center transition-all cursor-pointer
            ${isFoldersTabActive && activeNoteId !== 'settings'
              ? 'bg-[#D1D4DC] dark:bg-[#2E3039] text-stone-900 dark:text-stone-100 font-semibold' 
              : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-850/40 hover:text-stone-900 dark:hover:text-stone-100'}`}
          title="Folder Explorer"
        >
          <FolderIcon className="w-4.5 h-4.5" />
        </button>

        {/* Favorites list */}
        <button
          type="button"
          id="btn-rail-favorites"
          onClick={() => {
            setActiveCategory('favorites');
            setActiveNoteId(null);
          }}
          className={`w-8.5 h-8.5 rounded-md flex items-center justify-center transition-all cursor-pointer
            ${activeCategory === 'favorites' && activeNoteId !== 'settings'
              ? 'bg-[#D1D4DC] dark:bg-[#2E3039] text-stone-900 dark:text-stone-100 font-semibold' 
              : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-850/40 hover:text-stone-900 dark:hover:text-stone-100'}`}
          title="Favorites"
        >
          <Star className="w-4.5 h-4.5" />
        </button>

        {/* Archive List */}
        <button
          type="button"
          id="btn-rail-archive"
          onClick={() => {
            setActiveCategory('archive');
            setActiveNoteId(null);
          }}
          className={`w-8.5 h-8.5 rounded-md flex items-center justify-center transition-all cursor-pointer
            ${activeCategory === 'archive' && activeNoteId !== 'settings'
              ? 'bg-[#D1D4DC] dark:bg-[#2E3039] text-stone-900 dark:text-stone-100 font-semibold' 
              : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-850/40 hover:text-stone-900 dark:hover:text-stone-100'}`}
          title="Archived Documents"
        >
          <Archive className="w-4.5 h-4.5" />
        </button>

        {/* Trash bin */}
        <button
          type="button"
          id="btn-rail-trash"
          onClick={() => {
            setActiveCategory('trash');
            setActiveNoteId(null);
          }}
          className={`w-8.5 h-8.5 rounded-md flex items-center justify-center transition-all cursor-pointer
            ${activeCategory === 'trash' && activeNoteId !== 'settings'
              ? 'bg-[#D1D4DC] dark:bg-[#2E3039] text-stone-900 dark:text-stone-100 font-semibold' 
              : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-850/40 hover:text-stone-900 dark:hover:text-stone-100'}`}
          title="Trash Bin"
        >
          <Trash2 className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Bottom Icons */}
      <div className="flex flex-col gap-3 items-center w-full">
        {/* Theme Cycle */}
        <button
          type="button"
          id="btn-rail-theme-cycle"
          onClick={() => {
            const modes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
            const nextIndex = (modes.indexOf(settings.theme) + 1) % modes.length;
            updateSettings({ theme: modes[nextIndex] });
          }}
          className="w-8.5 h-8.5 rounded-md flex items-center justify-center text-stone-500 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-800/40 hover:text-stone-900 dark:hover:text-stone-100 transition-colors cursor-pointer"
          title="Switch Theme"
        >
          {settings.theme === 'light' && <Sun className="w-4.5 h-4.5" />}
          {settings.theme === 'dark' && <Moon className="w-4.5 h-4.5" />}
          {settings.theme === 'system' && <Monitor className="w-4.5 h-4.5" />}
        </button>

        {/* Settings Trigger */}
        <button
          type="button"
          id="btn-rail-settings"
          onClick={() => {
            setActiveNoteId('settings');
          }}
          className={`w-8.5 h-8.5 rounded-md flex items-center justify-center transition-all cursor-pointer
            ${activeNoteId === 'settings' 
              ? 'bg-[#D1D4DC] dark:bg-[#2E3039] text-stone-900 dark:text-stone-100' 
              : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-800/40 hover:text-stone-900 dark:hover:text-stone-100'}`}
          title="Settings / Preferences"
        >
          <Settings className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Preserved Modal structure so no functional features are lost */}
      <Modal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title="Create New Folder"
      >
        <form onSubmit={handleSaveFolder} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-stone-500 dark:text-stone-400">
              Folder Name
            </label>
            <input
              type="text"
              id="input-rail-folder-name"
              required
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#111214] text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-[#1D2EA0] transition-all text-sm"
              placeholder="Untitled Folder"
            />
          </div>

          <div className="flex items-center gap-2 mt-2 justify-end">
            <button
              type="button"
              id="btn-rail-folder-modal-cancel"
              onClick={() => setIsFolderModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-rail-folder-modal-submit"
              className="px-4 py-1.5 rounded text-xs font-semibold text-white bg-[#1D2EA0] hover:bg-[#18298B] transition-all cursor-pointer"
            >
              Create
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
