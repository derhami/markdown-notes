/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { 
  Plus, FileUp, Settings, Clock, Pin, FileText, ArrowUpRight, 
  Sparkles, Activity, PlusCircle, Search, CloudLightning, Command, Folder
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDemoData } from './db/database';
import { useWorkspaceStore } from './stores/useWorkspaceStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { useToastStore } from './stores/useToastStore';
import { useVaultStore } from './stores/useVaultStore';
import { 
  parseFrontmatter, calculateWordCount, calculateCharacterCount, 
  calculateReadingTime, extractFirstHeading 
} from './utils/notesHelper';
import { generateId } from './utils/id';

// Components
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import ToastContainer from './components/ToastContainer';
import type { Note } from './types';

// Heavier panels are code-split to keep the initial bundle small
const MarkdownEditor = lazy(() => import('./components/MarkdownEditor'));
const SettingsPanel = lazy(() => import('./components/SettingsPanel'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const NoteActionManager = lazy(() => import('./components/NoteActionManager'));
const PersonalDashboard = lazy(() => import('./components/PersonalDashboard'));

const PanelFallback = () => (
  <div className="flex-1 h-full bg-[#F2F3F8] dark:bg-[#111214] flex flex-col items-center justify-center text-stone-400">
    <p className="animate-pulse text-[10px] tracking-widest font-bold uppercase">LOADING PANEL...</p>
  </div>
);

export default function App() {
  const { 
    activeNoteId, setActiveNoteId, activeCategory, setActiveCategory,
    focusMode, setFocusMode, zenMode, setZenMode, sidebarOpen, setSidebarOpen,
    setCommandPaletteOpen
  } = useWorkspaceStore();
  const { loadSettings, isLoaded, settings, updateSettings } = useSettingsStore();
  const { showToast } = useToastStore();

  const [dbReady, setDbReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Device-aware viewport states
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1024;
  const isDesktop = viewportWidth >= 1024;

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
    
    const startX = mouseDownEvent.clientX;
    const startWidth = settings.noteListWidth || 320;

    const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
      const deltaX = mouseMoveEvent.clientX - startX;
      const newWidth = Math.max(200, Math.min(480, startWidth + deltaX));
      updateSettings({ noteListWidth: newWidth });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Bootstrap Database and Settings
  useEffect(() => {
    const init = async () => {
      try {
        await initializeDemoData();
        await loadSettings();
        await useVaultStore.getState().initVaultState();
        setDbReady(true);
      } catch (err) {
        console.error('Failed to bootstrap local database:', err);
        setDbReady(true);
      }
    };
    init();
  }, []);

  // Sync HTML/Body class with active theme
  useEffect(() => {
    if (isLoaded && settings?.theme) {
      const root = document.documentElement;
      const body = document.body;
      root.classList.remove('light', 'dark');
      if (body) {
        body.classList.remove('light', 'dark');
      }
      
      let activeTheme = settings.theme;
      if (settings.theme === 'system') {
        activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      
      root.classList.add(activeTheme);
      if (body) {
        body.classList.add(activeTheme);
      }
      
      try {
        localStorage.setItem('theme', settings.theme);
      } catch (e) {}
    }
  }, [settings?.theme, isLoaded]);

  // Inactivity tracking listeners for Vault
  useEffect(() => {
    const handleActivity = () => {
      useVaultStore.getState().recordActivity();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      const isEditing = 
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement || 
        (e.target as HTMLElement).isContentEditable;

      // Ctrl + N (Create New Note)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        await handleCreateNote(null);
      }

      // Ctrl + Shift + S (Toggle Sidebar)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }

      // Ctrl + Shift + F (Toggle Focus Mode)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFocusMode(!focusMode);
        showToast(focusMode ? 'Normal View Restored' : 'Focus Mode Enabled', 'info');
      }

      // Ctrl + Shift + Z (Toggle Zen Mode)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setZenMode(!zenMode);
        showToast(zenMode ? 'Normal View Restored' : 'Zen Mode Enabled', 'info');
      }

      // Ctrl + P (Cycle Editor Preview Modes)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const modes: ('editor' | 'split' | 'preview')[] = ['editor', 'split', 'preview'];
        const nextIdx = (modes.indexOf(settings.editorMode) + 1) % modes.length;
        await updateSettings({ editorMode: modes[nextIdx] });
        showToast(`Layout changed: ${modes[nextIdx]}`, 'info');
      }

      // Delete key (Trash active note if not editing text fields)
      if (e.key === 'Delete' && activeNoteId && !isEditing && activeNoteId !== 'settings') {
        const activeNote = await db.notes.get(activeNoteId);
        if (activeNote && !activeNote.deletedAt) {
          await db.notes.update(activeNoteId, { deletedAt: Date.now() });
          setActiveNoteId(null);
          showToast('Document moved to Trash', 'info');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [sidebarOpen, focusMode, zenMode, activeNoteId, settings.editorMode]);

  // Listen to custom dashboard file importer routing
  useEffect(() => {
    const handleDashboardImport = async (e: Event) => {
      const customEvent = e as CustomEvent<File[]>;
      if (customEvent.detail) {
        await importFiles(customEvent.detail);
      }
    };
    window.addEventListener('importMarkdownFiles', handleDashboardImport);
    return () => window.removeEventListener('importMarkdownFiles', handleDashboardImport);
  }, [activeCategory]);

  // Live Query notes matching database
  const notes = useLiveQuery(() => db.notes.toArray()) || [];
  const folders = useLiveQuery(() => db.folders.toArray()) || [];

  const activeNotes = notes.filter(n => !n.deletedAt);
  const recentNotes = [...activeNotes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);
  const totalWords = activeNotes.reduce((acc, n) => acc + (n.wordCount || 0), 0);

  // File Importer logic
  const importFiles = async (files: File[]) => {
    const markdownFiles = files.filter(
      (f) => 
        f.name.endsWith('.md') || 
        f.name.endsWith('.txt') || 
        f.name.endsWith('.markdown') || 
        f.name.endsWith('.markdownnotes')
    );

    if (markdownFiles.length === 0) {
      showToast('No valid Markdown (.md) documents found.', 'error');
      return;
    }

    let importedCount = 0;
    let lastImportedId: string | null = null;

    for (const file of markdownFiles) {
      try {
        const text = await file.text();
        const now = Date.now();

        // Check if .markdownnotes archive (the serialized backup)
        if (file.name.endsWith('.markdownnotes')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.notes && parsed.folders && parsed.tags) {
              for (const f of parsed.folders) {
                await db.folders.put(f);
              }
              for (const tg of parsed.tags) {
                await db.tags.put(tg);
              }
              for (const nt of parsed.notes) {
                await db.notes.put(nt);
              }
              if (parsed.settings) {
                await updateSettings(parsed.settings);
              }
              showToast('Backup archive imported successfully', 'success');
              setTimeout(() => window.location.reload(), 800);
              return;
            }
          } catch (err) {
            // Fallback to read as simple file if parsing backup structure fails
          }
        }

        // Standard Markdown reader
        const { metadata, contentOnly } = parseFrontmatter(text);
        
        let title = metadata.title || '';
        if (!title) {
          title = extractFirstHeading(contentOnly, file.name.replace(/\.(md|txt|markdown)$/i, ''));
        }

        const folderId = activeCategory.startsWith('folder:') ? activeCategory.substring(7) : null;
        const fileTags: string[] = Array.isArray(metadata.tags) ? metadata.tags : [];

        // Parse hashtags out of text
        const hashtagRegex = /#([a-zA-Z\u0600-\u06FF\u200C0-9_-]+)/g;
        let match;
        while ((match = hashtagRegex.exec(contentOnly)) !== null) {
          const tagName = match[1].toLowerCase();
          if (!fileTags.includes(tagName) && tagName.length > 1) {
            fileTags.push(tagName);
            const existing = await db.tags.where('name').equalsIgnoreCase(tagName).first();
            if (!existing) {
              await db.tags.add({
                id: generateId(),
                name: tagName,
                color: '#1D2EA0',
                createdAt: now
              });
            }
          }
        }

        const wordCount = calculateWordCount(contentOnly);
        const charCount = calculateCharacterCount(contentOnly);
        const readingTime = calculateReadingTime(contentOnly);

        const noteId = generateId();
        const newNote: Note = {
          id: noteId,
          title: title,
          content: contentOnly,
          folderId,
          tags: fileTags,
          isFavorite: metadata.favorite === 'true' || !!metadata.isFavorite,
          isPinned: metadata.pinned === 'true' || !!metadata.isPinned,
          createdAt: metadata.createdAt ? Number(metadata.createdAt) : now,
          updatedAt: metadata.updatedAt ? Number(metadata.updatedAt) : now,
          wordCount,
          characterCount: charCount,
          readingTime,
          deletedAt: null
        };

        await db.notes.add(newNote);
        importedCount++;
        lastImportedId = noteId;
      } catch (err) {
        console.error('Failed to parse file:', err);
      }
    }

    if (importedCount > 0) {
      showToast(`Successfully imported ${importedCount} document(s)`, 'success');
      if (importedCount === 1 && lastImportedId) {
        setActiveNoteId(lastImportedId);
      }
    }
  };

  // Drag-and-drop Events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.relatedTarget === null) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    await importFiles(files);
  };

  // Select File manually
  const handleSelectFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    await importFiles(files);
  };

  // Create Note
  const handleCreateNote = async (folderId: string | null = null) => {
    const now = Date.now();
    const newNoteId = generateId();
    const newNote: Note = {
      id: newNoteId,
      title: '',
      content: '',
      folderId,
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

    try {
      await db.notes.add(newNote);
      setActiveNoteId(newNoteId);
      showToast('New document created', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  // Beautiful centered editorial writing desk empty state
  const EmptyDeskState = () => {
    const getGreeting = () => {
      const hr = new Date().getHours();
      if (hr < 12) return 'Good morning';
      if (hr < 18) return 'Good afternoon';
      return 'Good evening';
    };

    return (
      <div className="flex-1 h-full overflow-y-auto bg-[#F2F3F8] dark:bg-[#111214] px-6 py-16 md:px-16 flex flex-col justify-center items-center select-none animate-fade-in transition-colors duration-200">
        <div className="max-w-[520px] w-full text-center flex flex-col items-center gap-8">
          
          {/* Subtle localized greeting & Typographic Heading Pair */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.2em] block leading-none">
              {getGreeting()}
            </span>
            <h1 className="text-3xl font-normal font-serif text-stone-900 dark:text-stone-100 tracking-tight leading-tight">
              A quiet room for your thoughts.
            </h1>
            <p className="text-xs text-stone-400 dark:text-stone-500 max-w-sm mx-auto leading-relaxed">
              Write, structure, and refine your ideas in raw markdown. All data resides safely inside your local database.
            </p>
          </div>

          {/* Minimal quick links (No card blocks, pure whitespace and typography) */}
          <div className="flex items-center gap-6 text-xs font-semibold text-stone-500 dark:text-stone-400 my-1">
            <button
              type="button"
              id="btn-desk-create"
              onClick={() => handleCreateNote(null)}
              className="hover:text-[#1D2EA0] dark:hover:text-[#A3B5F5] transition-colors flex items-center gap-1.5 cursor-pointer py-1"
            >
              <Plus className="w-4 h-4" />
              <span>Create Document</span>
            </button>
            <span className="text-stone-200 dark:text-[#2E3039]">|</span>
            <label className="hover:text-[#1D2EA0] dark:hover:text-[#A3B5F5] transition-colors flex items-center gap-1.5 cursor-pointer py-1">
              <FileUp className="w-4 h-4" />
              <span>Import Markdown</span>
              <input
                type="file"
                id="input-desk-importer-desk"
                accept=".md,.txt,.markdown"
                multiple
                onChange={handleSelectFileInput}
                className="hidden"
              />
            </label>
          </div>

          {/* Continue Writing prominence */}
          {recentNotes.length > 0 && (
            <div className="w-full flex flex-col gap-3 mt-4 text-left border-t border-stone-200/50 dark:border-[#2E3039] pt-6 select-none">
              <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest block mb-1 text-center">
                Continue writing
              </span>
              <button
                type="button"
                id={`btn-continue-note-${recentNotes[0].id}`}
                onClick={() => setActiveNoteId(recentNotes[0].id)}
                className="group flex flex-col gap-1.5 w-full text-left py-4 px-5 rounded-sm border border-stone-200/40 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] hover:border-[#1D2EA0] dark:hover:border-[#A3B5F5] transition-all cursor-pointer shadow-[0_1px_6px_rgba(0,0,0,0.01)] dark:shadow-none"
              >
                <span className="text-base font-serif font-semibold text-stone-800 dark:text-stone-200 group-hover:text-[#1D2EA0] dark:group-hover:text-[#A3B5F5] transition-colors">
                  {recentNotes[0].title || 'Untitled Document'}
                </span>
                <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium flex items-center gap-2">
                  <span>Edited {new Date(recentNotes[0].updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span>·</span>
                  <span>{recentNotes[0].wordCount || 0} words</span>
                </span>
              </button>

              {/* Smaller list of secondary recent files */}
              {recentNotes.length > 1 && (
                <div className="flex flex-col gap-1 mt-2">
                  {recentNotes.slice(1).map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      id={`btn-resume-note-${note.id}`}
                      onClick={() => setActiveNoteId(note.id)}
                      className="flex items-center justify-between w-full py-2 px-3 rounded-sm text-xs text-stone-500 hover:bg-stone-100/50 dark:hover:bg-stone-900 hover:text-stone-900 dark:hover:text-stone-100 transition-colors cursor-pointer text-left font-medium"
                    >
                      <span className="truncate max-w-[220px] font-semibold">{note.title || 'Untitled Document'}</span>
                      <span className="text-[10px] text-stone-400 font-normal shrink-0">
                        {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Minimal metrics text footer */}
          <div className="text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mt-6 select-none border-t border-stone-200/30 dark:border-[#2E3039]/50 pt-4 w-full">
            {activeNotes.length} documents · {totalWords.toLocaleString()} words written
          </div>

        </div>
      </div>
    );
  };

  if (!dbReady || !isLoaded) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F2F3F8] dark:bg-[#111214] text-stone-400">
        <p className="animate-pulse text-[10px] tracking-[0.2em] font-bold uppercase">BOOTSTRAPPING PERSONAL STUDIO...</p>
      </div>
    );
  }

  // Determine what panels to show based on device width classes
  const showMobileFocusedNote = isMobile && activeNoteId !== null;
  const showLeftRail = !zenMode && !focusMode && (isDesktop || (isTablet && activeNoteId === null));
  const showMiddleColumn = !focusMode && sidebarOpen && activeNoteId !== 'settings' && (!isMobile || activeNoteId === null);

  return (
    <div 
      className="h-screen w-screen flex overflow-hidden bg-[#F2F3F8] dark:bg-[#111214] text-stone-800 dark:text-[#E2E8F0] transition-colors duration-200 select-none relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Global Drag & Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-[#1D2EA0]/10 dark:bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center p-8 pointer-events-none select-none">
          <div className="p-8 bg-white dark:bg-[#1A1B1E] rounded-sm border border-[#D1D4DC] dark:border-[#2E3039] shadow-2xl flex flex-col items-center gap-3 text-center max-w-sm">
            <div className="p-3 bg-[#F2F3F8] dark:bg-[#222328] text-[#1D2EA0] dark:text-[#A3B5F5] rounded-sm">
              <FileUp className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-serif">Drop Documents to Import</h3>
              <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 max-w-xs leading-relaxed font-semibold">
                Drop your Markdown (.md) or text files to load them instantly into your workspace folders.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1. Zone 1: Left Navigation Rail (Only shown on Desktop, or on Tablet when note list is active) */}
      {showLeftRail && <Sidebar />}

      {/* 2. Zone 2: Middle Document Browser Panel (Hidden on Mobile if note is open) */}
      {showMiddleColumn && (
        <>
          <div 
            style={{ width: isMobile ? '100%' : `${settings.noteListWidth || 320}px` }}
            className="border-e border-[#D1D4DC] dark:border-[#2E3039] shrink-0 h-full overflow-hidden flex flex-col relative bg-white dark:bg-[#1A1B1E] transition-colors duration-200"
          >
            <NoteList />
          </div>
          
          {/* Hidden, ultra-thin drag-to-resize handle (only desktop/tablet) */}
          {!isMobile && (
            <div 
              onMouseDown={startResizing}
              className={`w-1 -mx-[2px] h-full cursor-col-resize relative z-30 transition-all shrink-0 select-none group
                bg-transparent hover:bg-[#1D2EA0]/20 dark:hover:bg-[#A3B5F5]/20`}
              title="Drag to resize"
            >
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1.5px] bg-transparent group-hover:bg-[#1D2EA0] dark:group-hover:bg-[#A3B5F5] transition-colors" />
            </div>
          )}
        </>
      )}

      {/* 3. Zone 3: Main Action Canvas Panel (Hidden on Mobile if we are browsing the list) */}
      {(!isMobile || activeNoteId !== null) && (
        <div className="flex-1 h-full flex flex-col overflow-hidden relative">
          <Suspense fallback={<PanelFallback />}>
            {activeNoteId === 'settings' ? (
              <SettingsPanel />
            ) : activeNoteId ? (
              <MarkdownEditor noteId={activeNoteId} />
            ) : (
              <PersonalDashboard />
            )}
          </Suspense>
        </div>
      )}

      {/* Responsive Bottom Navigation Rail (Only visible on mobile and only when in browsing mode) */}
      {isMobile && activeNoteId === null && (
        <div className="fixed bottom-0 inset-x-0 h-14 border-t border-[#D1D4DC] dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] flex items-center justify-around z-30 select-none transition-colors duration-200">
          <button
            type="button"
            onClick={() => {
              setActiveCategory('all');
              setActiveNoteId(null);
            }}
            className={`flex flex-col items-center justify-center w-14 h-full cursor-pointer
              ${activeCategory === 'all' ? 'text-[#1D2EA0] dark:text-[#A3B5F5]' : 'text-stone-400 dark:text-stone-500'}`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[9px] font-bold mt-1 uppercase">Notes</span>
          </button>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex flex-col items-center justify-center w-14 h-full text-stone-400 dark:text-stone-500 cursor-pointer"
          >
            <Search className="w-5 h-5" />
            <span className="text-[9px] font-bold mt-1 uppercase">Search</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('folders');
              setActiveNoteId(null);
            }}
            className={`flex flex-col items-center justify-center w-14 h-full cursor-pointer
              ${activeCategory === 'folders' ? 'text-[#1D2EA0] dark:text-[#A3B5F5]' : 'text-stone-400 dark:text-stone-500'}`}
          >
            <Folder className="w-5 h-5" />
            <span className="text-[9px] font-bold mt-1 uppercase">Folders</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNoteId('settings')}
            className={`flex flex-col items-center justify-center w-14 h-full cursor-pointer
              ${activeNoteId === 'settings' ? 'text-[#1D2EA0] dark:text-[#A3B5F5]' : 'text-stone-400 dark:text-stone-500'}`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[9px] font-bold mt-1 uppercase">Settings</span>
          </button>
        </div>
      )}

      {/* Search Command Palette overlay menu */}
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>

      {/* Note actions bottom sheets and modals */}
      <Suspense fallback={null}>
        <NoteActionManager />
      </Suspense>

      {/* Global System toast notifications bar */}
      <ToastContainer />
    </div>
  );
}
