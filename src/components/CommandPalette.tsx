/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, FileText, FolderPlus, Trash2, Moon, Sun, Monitor, 
  Settings, CloudLightning, Maximize2, Sparkles, HelpCircle 
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useToastStore } from '../stores/useToastStore';
import { translations } from '../utils/i18n';
import { generateId } from '../utils/id';
import type { Note } from '../types';

interface PaletteItem {
  id: string;
  label: string;
  icon: any;
  action: () => void | Promise<void>;
  subtitle?: string;
}

export default function CommandPalette() {
  const { 
    commandPaletteOpen, setCommandPaletteOpen, setActiveNoteId, 
    focusMode, setFocusMode, zenMode, setZenMode, sidebarOpen, setSidebarOpen 
  } = useWorkspaceStore();
  const { settings, updateSettings } = useSettingsStore();
  const { showToast } = useToastStore();
  
  const t = translations[settings.language];
  const isRtl = settings.language === 'fa';

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch all active notes for query
  const notes = useLiveQuery(() => db.notes.toArray()) || [];
  const activeNotes = notes.filter((n) => !n.deletedAt);

  // Define commands list
  const commands: PaletteItem[] = [
    { 
      id: 'new-note', 
      label: t.newNote, 
      icon: FileText, 
      action: async () => {
        const now = Date.now();
        const newNoteId = generateId();
        const newNote: Note = {
          id: newNoteId,
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
        await db.notes.add(newNote);
        setActiveNoteId(newNoteId);
        showToast(t.noteCreated, 'success');
      }
    },
    { 
      id: 'focus-toggle', 
      label: focusMode ? `${t.focusMode}: ${t.unpin}` : t.focusMode, 
      icon: CloudLightning, 
      action: () => {
        setFocusMode(!focusMode);
        showToast(t.focusMode, 'info');
      }
    },
    { 
      id: 'zen-toggle', 
      label: zenMode ? `${t.zenMode}: ${t.unpin}` : t.zenMode, 
      icon: Maximize2, 
      action: () => {
        setZenMode(!zenMode);
        showToast(t.zenMode, 'info');
      }
    },
    { 
      id: 'sidebar-toggle', 
      label: sidebarOpen ? `${t.scSidebar}: Off` : t.scSidebar, 
      icon: Monitor, 
      action: () => setSidebarOpen(!sidebarOpen) 
    },
    { 
      id: 'theme-light', 
      label: `${t.themeLabel}: ${t.themeLight}`, 
      icon: Sun, 
      action: () => {
        updateSettings({ theme: 'light' });
        showToast(t.themeLight, 'success');
      }
    },
    { 
      id: 'theme-dark', 
      label: `${t.themeLabel}: ${t.themeDark}`, 
      icon: Moon, 
      action: () => {
        updateSettings({ theme: 'dark' });
        showToast(t.themeDark, 'success');
      }
    },
    { 
      id: 'settings-modal', 
      label: t.settings, 
      icon: Settings, 
      action: () => setActiveNoteId('settings' as any) 
    },
  ];

  // Intercept Global hotkeys (Ctrl+K, Esc, ArrowUpDown, Enter)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        setQuery('');
        setSelectedIndex(0);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [commandPaletteOpen]);

  // Handle local navigation inside palette
  useEffect(() => {
    if (!commandPaletteOpen) return;
    inputRef.current?.focus();

    const handlePaletteKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCommandPaletteOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredResults.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % filteredResults.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          handleExecute(filteredResults[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handlePaletteKeyDown);
    return () => window.removeEventListener('keydown', handlePaletteKeyDown);
  }, [commandPaletteOpen, query, selectedIndex]);

  if (!commandPaletteOpen) return null;

  // Search filter both Notes and Static Commands
  const filteredNotes = activeNotes.filter((n) => {
    const q = query.toLowerCase().trim();
    return q ? (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q) : false;
  }).map((n) => ({
    id: `note-${n.id}`,
    label: n.title || t.untitled,
    icon: FileText,
    action: () => {
      setActiveNoteId(n.id);
    },
    subtitle: n.content ? n.content.substring(0, 50) : ''
  }));

  const filteredCommands = commands.filter((c) => {
    const q = query.toLowerCase().trim();
    return q ? c.label.toLowerCase().includes(q) : true;
  });

  const filteredResults: PaletteItem[] = [...filteredCommands, ...filteredNotes];

  const handleExecute = (item: any) => {
    item.action();
    setCommandPaletteOpen(false);
    setQuery('');
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center pt-[15vh] px-4"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div 
        ref={containerRef}
        className="w-full max-w-xl bg-white dark:bg-[#16171B] border border-stone-200 dark:border-stone-800 rounded shadow-2xl overflow-hidden flex flex-col h-fit max-h-[50vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className={`p-4 border-b border-stone-100 dark:border-stone-800 flex items-center gap-3
          ${isRtl ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <Search className="w-5 h-5 text-stone-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            id="input-palette-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t.commandPlaceholder}
            className={`w-full bg-transparent border-none text-stone-900 dark:text-stone-100 focus:outline-none text-sm
              ${isRtl ? 'text-right' : 'text-left'}`}
          />
          <kbd className="text-[10px] bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded px-1.5 py-0.5 text-stone-400 font-bold shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto max-h-[35vh] p-2 flex flex-col gap-0.5">
          {filteredResults.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-sm italic">
              {t.noResults}
            </div>
          ) : (
            filteredResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;

              return (
                <div
                  key={item.id}
                  id={`palette-item-${item.id}`}
                  onClick={() => handleExecute(item)}
                  className={`flex items-center justify-between p-2.5 rounded transition-all cursor-pointer select-none
                    ${isRtl ? 'flex-row-reverse' : 'flex-row'}
                    ${isSelected 
                      ? 'bg-[#F2F3F8] dark:bg-[#222328] text-[#1D2EA0] dark:text-[#A3B5F5] font-semibold border-stone-200' 
                      : 'text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-850/40'}`}
                >
                  <div className={`flex items-center gap-3 min-w-0
                    ${isRtl ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#1D2EA0] dark:text-[#A3B5F5]' : 'text-stone-400 dark:text-stone-500'}`} />
                    <div className={`flex flex-col min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
                      <span className="text-xs truncate">{item.label}</span>
                      {'subtitle' in item && item.subtitle && (
                        <span className="text-[10px] text-stone-400 truncate leading-relaxed">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <span className="text-[10px] text-[#1D2EA0] dark:text-[#A3B5F5] font-bold uppercase shrink-0">
                      ENTER
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
