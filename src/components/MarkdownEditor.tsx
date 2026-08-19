/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { 
  Heading, Bold, Italic, Link, Quote, List, ListOrdered, CheckSquare, 
  Code, Table, Image, Minus, Eye, EyeOff, LayoutGrid, 
  Maximize2, Minimize2, CloudLightning, HardDriveDownload, Sparkles,
  PanelLeft, ChevronLeft, BookOpen, Info, Calendar, Tag, FileText,
  RotateCcw, RotateCw, MoreVertical, Lock, Unlock, Shield, Edit3
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useToastStore } from '../stores/useToastStore';
import { useNoteActionsStore } from '../stores/useNoteActionsStore';
import { useVaultStore } from '../stores/useVaultStore';
import { 
  calculateWordCount, calculateCharacterCount, calculateReadingTime, 
  extractFirstHeading, sanitizeFileName, stringifyFrontmatter 
} from '../utils/notesHelper';
import MarkdownPreview from './MarkdownPreview';
import Modal from './Modal';
import type { Note, Folder } from '../types';

interface MarkdownEditorProps {
  noteId: string;
}

// Custom heading extractor helper for Table of Contents
const getHeadings = (text: string) => {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const list: { level: number; text: string; id: string }[] = [];
  let match;
  while ((match = headingRegex.exec(text)) !== null) {
    const level = match[1].length;
    const hText = match[2].trim();
    // Generate a clean HTML ID matching the markdown renderer structure
    const id = hText.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u0600-\u06FF-]/g, '');
    list.push({ level, text: hText, id });
  }
  return list;
};

export default function MarkdownEditor({ noteId }: MarkdownEditorProps) {
  const { settings, updateSettings } = useSettingsStore();
  const { 
    focusMode, setFocusMode, zenMode, setZenMode, activeCategory,
    tocOpen, setTocOpen, sidebarOpen, setSidebarOpen, setActiveNoteId,
    showUnsavedModal, confirmNavigation, cancelNavigation
  } = useWorkspaceStore();
  const { showToast } = useToastStore();
  const { openActions } = useNoteActionsStore();
  const { isLocked, decryptedNotes, unlock, updateSecureNoteContent } = useVaultStore();
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load active note via Dexie
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId]);

  // Load folder name if applicable
  const noteFolder = useLiveQuery(
    () => (note?.folderId ? db.folders.get(note.folderId) : Promise.resolve(undefined)),
    [note?.folderId]
  );

  // Local state for raw text and title
  const [localContent, setLocalContent] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'draft'>('saved');
  const [showSavedBriefly, setShowSavedBriefly] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'outline' | 'info'>('outline');

  // Online status tracking
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync isDirty state with useWorkspaceStore for navigation blocking
  const isDirty = localContent !== (note?.content || '') || localTitle !== (note?.title || '');
  useEffect(() => {
    useWorkspaceStore.setState({ isEditorDirty: isOnline && isDirty });
    return () => {
      useWorkspaceStore.setState({ isEditorDirty: false });
    };
  }, [isDirty, isOnline]);

  // Undo/Redo stack state
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUpdatingHistory = useRef(false);

  // Push to history with debounce
  useEffect(() => {
    if (!noteId) return;
    if (isUpdatingHistory.current) {
      isUpdatingHistory.current = false;
      return;
    }

    const handler = setTimeout(() => {
      setHistory(prev => {
        const sliced = prev.slice(0, historyIndex + 1);
        if (sliced[sliced.length - 1] === localContent) return prev;
        const nextHist = [...sliced, localContent];
        setHistoryIndex(nextHist.length - 1);
        return nextHist;
      });
    }, 400);

    return () => clearTimeout(handler);
  }, [localContent, noteId]);

  // Clear history on note change
  useEffect(() => {
    if (note) {
      setHistory([note.content || '']);
      setHistoryIndex(0);
    }
  }, [noteId]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      isUpdatingHistory.current = true;
      setHistoryIndex(prevIndex);
      setLocalContent(history[prevIndex]);
      showToast('Undo', 'info');
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      isUpdatingHistory.current = true;
      setHistoryIndex(nextIndex);
      setLocalContent(history[nextIndex]);
      showToast('Redo', 'info');
    }
  };

  // Tracking typing inactivity to auto-hide secondary Chrome controls
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Device-aware state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Selection Floating Toolbar state
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number; x: number; y: number } | null>(null);

  // Sync state on note transition
  useEffect(() => {
    if (note) {
      if (note.isEncrypted) {
        if (!isLocked) {
          const dec = decryptedNotes[noteId];
          setLocalContent(dec?.content || '');
          setLocalTitle(dec?.title || '');
          setSaveStatus('saved');
        } else {
          setLocalContent('');
          setLocalTitle('Locked Note');
          setSaveStatus('saved');
        }
      } else {
        setLocalContent(note.content || '');
        setLocalTitle(note.title || '');
        setSaveStatus('saved');
      }
    }
    setSelectionRange(null);
    setIsTyping(false);
  }, [noteId, !!note, isLocked, decryptedNotes]);

  // Auto-resize textarea in non-split mode to prevent nested scrollbars
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      if (settings.editorMode !== 'split') {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      } else {
        textarea.style.height = '';
      }
    }
  }, [localContent, settings.editorMode]);

  // Detect mouse move to un-fade controls immediately
  useEffect(() => {
    const handleMouseMove = () => {
      setIsTyping(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Saved brief indicator timeout
  useEffect(() => {
    if (saveStatus === 'saved') {
      setShowSavedBriefly(true);
      const timer = setTimeout(() => {
        setShowSavedBriefly(false);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setShowSavedBriefly(false);
    }
  }, [saveStatus]);

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        triggerImmediateSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowToolbar(prev => !prev);
      }
      if (e.key === 'Escape' && zenMode) {
        setZenMode(false);
        showToast('Exited Zen Mode', 'info');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localContent, localTitle, noteId, zenMode, historyIndex, history.length]);

  // Debounced auto-save engine
  useEffect(() => {
    if (!noteId || !note) return;

    let originalContent = note.content;
    let originalTitle = note.title;

    if (note.isEncrypted) {
      if (isLocked) return; // Cannot save while locked
      const dec = decryptedNotes[noteId];
      originalContent = dec?.content || '';
      originalTitle = dec?.title || '';
    }
    
    if (localContent === originalContent && localTitle === originalTitle) {
      return;
    }

    setSaveStatus('saving');
    
    const timeout = setTimeout(async () => {
      try {
        const now = Date.now();
        let finalTitle = localTitle.trim();
        if (!finalTitle && localContent.trim()) {
          finalTitle = extractFirstHeading(localContent, 'Untitled Document');
        }

        const wordCount = calculateWordCount(localContent);
        const charCount = calculateCharacterCount(localContent);
        const readTime = calculateReadingTime(localContent);

        if (note.isEncrypted) {
          await updateSecureNoteContent(noteId, finalTitle, localContent, note.tags);
        } else {
          await db.notes.update(noteId, {
            title: finalTitle,
            content: localContent,
            wordCount,
            characterCount: charCount,
            readingTime: readTime,
            updatedAt: now
          });
        }

        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto save failed:', err);
        setSaveStatus('draft');
      }
    }, settings.autoSaveInterval);

    return () => clearTimeout(timeout);
  }, [localContent, localTitle, noteId, settings.autoSaveInterval, isLocked, decryptedNotes]);

  const triggerImmediateSave = async () => {
    if (!noteId || !note) return;
    setSaveStatus('saving');
    try {
      const now = Date.now();
      let finalTitle = localTitle.trim();
      if (!finalTitle && localContent.trim()) {
        finalTitle = extractFirstHeading(localContent, 'Untitled Document');
      }
      
      const wordCount = calculateWordCount(localContent);
      const charCount = calculateCharacterCount(localContent);
      const readTime = calculateReadingTime(localContent);

      if (note.isEncrypted) {
        if (isLocked) {
          showToast('Cannot save locked note', 'error');
          return;
        }
        await updateSecureNoteContent(noteId, finalTitle, localContent, note.tags);
      } else {
        await db.notes.update(noteId, {
          title: finalTitle,
          content: localContent,
          wordCount,
          characterCount: charCount,
          readingTime: readTime,
          updatedAt: now
        });
      }
      
      setSaveStatus('saved');
      showToast('Document saved', 'success');
    } catch (err) {
      console.error(err);
      setSaveStatus('draft');
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalContent(e.target.value);
    
    // Set typing state to fade secondary UI
    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 2500);
  };

  // Safe formatting insertions
  const insertFormat = (formatType: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const originalText = textarea.value;
    const selectedText = originalText.substring(startPos, endPos);

    let insertion = '';
    let cursorOffset = 0;

    switch (formatType) {
      case 'bold':
        insertion = `**${selectedText || 'bold_text'}**`;
        cursorOffset = selectedText ? insertion.length : 2;
        break;
      case 'italic':
        insertion = `*${selectedText || 'italic_text'}*`;
        cursorOffset = selectedText ? insertion.length : 1;
        break;
      case 'strike':
        insertion = `~~${selectedText || 'strike_text'}~~`;
        cursorOffset = selectedText ? insertion.length : 2;
        break;
      case 'quote':
        insertion = `\n> ${selectedText || 'Blockquote'}\n`;
        cursorOffset = insertion.length;
        break;
      case 'heading':
        insertion = `\n## ${selectedText || 'Heading'}\n`;
        cursorOffset = insertion.length;
        break;
      case 'codeBlock':
        insertion = `\n\`\`\`javascript\n${selectedText || '// Code'}\n\`\`\`\n`;
        cursorOffset = insertion.length;
        break;
      case 'link':
        insertion = `[${selectedText || 'Link Title'}](https://example.com)`;
        cursorOffset = insertion.length;
        break;
      case 'bulletList':
        insertion = `\n- ${selectedText || 'List item'}\n`;
        cursorOffset = insertion.length;
        break;
      case 'numberedList':
        insertion = `\n1. ${selectedText || 'List item'}\n`;
        cursorOffset = insertion.length;
        break;
      case 'checklist':
        insertion = `\n- [ ] ${selectedText || 'Task'}\n`;
        cursorOffset = insertion.length;
        break;
      case 'table':
        insertion = `\n| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n`;
        cursorOffset = insertion.length;
        break;
      case 'image':
        insertion = `![Alt text](https://images.unsplash.com/photo-1455390582262-044cdead277a?w=600)`;
        cursorOffset = insertion.length;
        break;
      case 'horizontalRule':
        insertion = `\n---\n`;
        cursorOffset = insertion.length;
        break;
      default:
        break;
    }

    const updatedContent = originalText.substring(0, startPos) + insertion + originalText.substring(endPos);
    setLocalContent(updatedContent);

    // Keep focus and reset selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(startPos + cursorOffset, startPos + cursorOffset);
    }, 0);
  };

  // Text selection tracker for the Floating Format overlay
  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end && end - start > 1) {
      const rect = textarea.getBoundingClientRect();
      const textLines = textarea.value.substring(0, start).split('\n');
      const estimatedLineHeight = parseFloat(settings.editorLineHeight) * settings.editorFontSize;
      const posY = Math.min(rect.bottom - 45, rect.top + (textLines.length * estimatedLineHeight) - textarea.scrollTop + 10);
      
      setSelectionRange({
        start,
        end,
        x: rect.left + Math.min(rect.width - 240, Math.max(20, rect.width / 2.5)),
        y: posY
      });
    } else {
      setSelectionRange(null);
    }
  };

  const handleExportNoteFile = () => {
    if (!note) return;
    const metadata = {
      title: localTitle || 'Untitled Document',
      tags: note.tags,
      created: new Date(note.createdAt).toISOString(),
      updated: new Date(note.updatedAt).toISOString()
    };
    const fileContent = stringifyFrontmatter(localContent, metadata);
    const fileName = `${sanitizeFileName(localTitle || 'Untitled Document')}.md`;
    const blob = new Blob([fileContent], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    showToast('File exported successfully', 'success');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!note) {
    return (
      <div className="flex-1 h-full bg-[#F2F3F8] dark:bg-[#111214] flex flex-col items-center justify-center text-stone-400">
        <p className="animate-pulse text-[10px] tracking-widest font-bold uppercase">LOADING DOCUMENT...</p>
      </div>
    );
  }

  // Secure locked document guard
  if (note.isEncrypted && isLocked) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-[#F2F3F8] dark:bg-[#111214] px-6 select-none animate-fade-in">
        <div className="max-w-xs w-full flex flex-col items-center text-center gap-4 py-8 px-6 bg-white dark:bg-[#1A1B1E] border border-stone-200/65 dark:border-[#2E3039] shadow-sm rounded-sm">
          <div className="p-3 bg-stone-50 dark:bg-[#222328] border border-stone-150 dark:border-[#2E3039] text-amber-500 rounded-sm">
            <Lock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 font-serif">Encrypted Document</h3>
            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-1 max-w-xs leading-relaxed font-semibold">
              This document is protected with client-side AES-256-GCM. Please enter your Vault password to decrypt and edit.
            </p>
          </div>
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const input = (e.target as any).elements.vault_editor_pass.value;
              const success = await unlock(input);
              if (success) {
                showToast('Document decrypted', 'success');
              } else {
                showToast('Incorrect password', 'error');
              }
            }}
            className="w-full flex flex-col gap-2.5 mt-2"
          >
            <input
              type="password"
              name="vault_editor_pass"
              placeholder="Vault Password"
              className="w-full py-2 px-3 border border-stone-200 dark:border-[#2E3039] bg-[#F2F3F8] dark:bg-[#111214] text-stone-850 dark:text-stone-100 rounded-sm text-xs outline-none focus:border-[#1D2EA0] dark:focus:border-[#A3B5F5]"
              autoFocus
            />
            <button
              type="submit"
              className="w-full py-2 bg-[#1D2EA0] dark:bg-[#A3B5F5] text-white font-bold text-xs rounded-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer text-center"
            >
              Decrypt & Edit
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isSplitMode = settings.editorMode === 'split';
  const isPreviewOnly = settings.editorMode === 'preview';
  const isEditorOnly = settings.editorMode === 'editor';

  // Get active layout class width based on user choice
  const getWidthClass = (widthChoice?: 'focused' | 'comfortable' | 'wide') => {
    if (widthChoice === 'focused') return 'max-w-[680px]';
    if (widthChoice === 'wide') return 'max-w-[900px]';
    return 'max-w-[760px]'; // comfortable
  };

  const toolbarButtons = [
    { id: 'undo', icon: RotateCcw, action: handleUndo, label: 'Undo (Ctrl+Z)', disabled: historyIndex <= 0 },
    { id: 'redo', icon: RotateCw, action: handleRedo, label: 'Redo (Ctrl+Y)', disabled: historyIndex >= history.length - 1 },
    { id: 'heading', icon: Heading, action: () => insertFormat('heading'), label: 'Heading' },
    { id: 'bold', icon: Bold, action: () => insertFormat('bold'), label: 'Bold' },
    { id: 'italic', icon: Italic, action: () => insertFormat('italic'), label: 'Italic' },
    { id: 'strike', icon: Minus, action: () => insertFormat('strike'), label: 'Strikethrough' },
    { id: 'quote', icon: Quote, action: () => insertFormat('quote'), label: 'Quote' },
    { id: 'bulletList', icon: List, action: () => insertFormat('bulletList'), label: 'Bullet List' },
    { id: 'numberedList', icon: ListOrdered, action: () => insertFormat('numberedList'), label: 'Numbered List' },
    { id: 'checklist', icon: CheckSquare, action: () => insertFormat('checklist'), label: 'Task List' },
    { id: 'code', icon: Code, action: () => insertFormat('codeBlock'), label: 'Code Block' },
    { id: 'table', icon: Table, action: () => insertFormat('table'), label: 'Table' },
    { id: 'image', icon: Image, action: () => insertFormat('image'), label: 'Image' },
    { id: 'link', icon: Link, action: () => insertFormat('link'), label: 'Link' },
  ];

  // Extracted headings list
  const docHeadings = getHeadings(localContent);

  return (
    <div 
      className={`flex-1 h-full flex flex-col overflow-hidden bg-[#F2F3F8] dark:bg-[#111214] transition-all relative
        ${zenMode ? 'z-40 fixed inset-0' : ''}`}
    >
      
      {/* Editor Control bar (Chrome Header) - Fades gracefully on active writing */}
      <div 
        className={`px-4 md:px-6 py-2 border-b border-stone-200/50 dark:border-[#2E3039] bg-[#F2F3F8]/90 dark:bg-[#111214]/90 backdrop-blur-md flex items-center justify-between shrink-0 select-none z-30 transition-opacity duration-700
          ${isTyping ? 'opacity-10 pointer-events-none hover:opacity-100' : 'opacity-100'}`}
      >
        <div className="flex items-center gap-1.5">
          {/* Mobile adaptive Back Button */}
          {isMobile ? (
            <button
              type="button"
              id="btn-mobile-back"
              onClick={() => setActiveNoteId(null)}
              className="flex items-center gap-0.5 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 text-xs font-semibold cursor-pointer py-1 pe-1.5 -ms-1 rounded hover:bg-stone-150/50 dark:hover:bg-stone-850/60"
            >
              <ChevronLeft className="w-4.5 h-4.5" />
              <span>Back</span>
            </button>
          ) : (
            /* Desktop/Tablet collapsible panel Toggle button */
            <button
              type="button"
              id="btn-sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
              className="p-1.5 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-850/60 transition-colors cursor-pointer"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          {/* Save status text */}
          <div className="flex items-center gap-1.5 h-5 text-[10px] font-bold uppercase tracking-widest select-none ms-1">
            {!isOnline ? (
              <span className="text-stone-400 dark:text-stone-500 flex items-center gap-1 bg-stone-100 dark:bg-stone-900 px-1.5 py-0.5 rounded-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-stone-500 animate-pulse" />
                {!isMobile && <span>Offline</span>}
              </span>
            ) : saveStatus === 'saving' ? (
              <span className="text-amber-500 dark:text-amber-400 flex items-center gap-1 bg-amber-50/50 dark:bg-amber-950/10 px-1.5 py-0.5 rounded-xs animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {!isMobile && <span>Saving...</span>}
              </span>
            ) : isDirty ? (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-50/50 dark:bg-amber-950/10 px-1.5 py-0.5 rounded-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                {!isMobile && <span>Unsaved</span>}
              </span>
            ) : (
              <span className={`text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/5 px-1.5 py-0.5 rounded-xs transition-all duration-500 ${showSavedBriefly ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-1 scale-95 pointer-events-none'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {!isMobile && <span>Saved</span>}
              </span>
            )}
          </div>
        </div>

        {/* View togglers and custom actions */}
        <div className="flex items-center gap-1">
          {/* Format guide helper toggle button */}
          <button
            type="button"
            id="btn-toggle-toolbar"
            onClick={() => setShowToolbar(!showToolbar)}
            title="Toggle Markdown Toolbar (Ctrl+/)"
            className={`p-1.5 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-850/60 transition-colors cursor-pointer
              ${showToolbar ? 'text-[#1D2EA0] dark:text-[#A3B5F5]' : ''}`}
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Width Cycle button (Focused -> Comfortable -> Wide) - Standard Editorial toggle */}
          {!isSplitMode && !isMobile && (
            <button
              type="button"
              id="btn-cycle-width"
              onClick={() => {
                const order: ('focused' | 'comfortable' | 'wide')[] = ['focused', 'comfortable', 'wide'];
                const currentIdx = order.indexOf(settings.editorWidth || 'comfortable');
                const nextWidth = order[(currentIdx + 1) % order.length];
                updateSettings({ editorWidth: nextWidth });
                showToast(`Layout changed to: ${nextWidth}`, 'info');
              }}
              title={`Cycle Document Width (${settings.editorWidth || 'comfortable'})`}
              className="p-1.5 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-850/60 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}

          {/* Export Note - Desktop only */}
          {!isMobile && (
            <button
              type="button"
              id="btn-editor-export"
              onClick={handleExportNoteFile}
              title="Export Note to Markdown File"
              className="p-1.5 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-850/60 transition-colors cursor-pointer"
            >
              <HardDriveDownload className="w-4 h-4" />
            </button>
          )}

          {/* Distraction-Free Focus mode - Desktop only */}
          {!isMobile && (
            <button
              type="button"
              id="btn-focus-mode"
              onClick={() => setFocusMode(!focusMode)}
              title="Focus Mode"
              className={`p-1.5 rounded transition-colors cursor-pointer
                ${focusMode 
                  ? 'text-[#1D2EA0] dark:text-[#A3B5F5] bg-[#E8E9EE] dark:bg-stone-850' 
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400'}`}
            >
              <CloudLightning className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen Zen Mode toggle - Desktop only */}
          {!isMobile && (
            <button
              type="button"
              id="btn-zen-mode"
              onClick={() => setZenMode(!zenMode)}
              title="Zen Mode (ESC to exit)"
              className={`p-1.5 rounded transition-colors cursor-pointer
                ${zenMode 
                  ? 'text-[#1D2EA0] dark:text-[#A3B5F5] bg-[#E8E9EE] dark:bg-stone-850' 
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400'}`}
            >
              {zenMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

          {/* Right Panel toggle (Outline & Stats) - Desktop only */}
          {!isMobile && (
            <button
              type="button"
              id="btn-toggle-toc"
              onClick={() => setTocOpen(!tocOpen)}
              title="Outline & Metadata Panel"
              className={`p-1.5 rounded transition-colors cursor-pointer
                ${tocOpen 
                  ? 'text-[#1D2EA0] dark:text-[#A3B5F5] bg-[#E8E9EE] dark:bg-stone-850' 
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400'}`}
            >
              <BookOpen className="w-4 h-4" />
            </button>
          )}

          {/* Single mobile toggle layout button OR Desktop multi-selectors */}
          {isMobile ? (
            <button
              type="button"
              id="btn-mobile-layout-toggle"
              onClick={() => {
                const nextMode = isPreviewOnly ? 'editor' : 'preview';
                updateSettings({ editorMode: nextMode });
              }}
              title={isPreviewOnly ? "Switch to Editor View" : "Switch to Preview Reader"}
              className="p-1.5 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-850/60 transition-colors cursor-pointer"
            >
              {isPreviewOnly ? (
                <Edit3 className="w-4.5 h-4.5 text-[#1D2EA0] dark:text-[#A3B5F5]" />
              ) : (
                <Eye className="w-4.5 h-4.5 text-[#1D2EA0] dark:text-[#A3B5F5]" />
              )}
            </button>
          ) : (
            <>
              <span className="w-px h-4 bg-stone-200 dark:bg-[#2E3039] mx-1" />
              
              {/* Layout Mode selectors */}
              <div className="flex items-center bg-stone-150/60 dark:bg-stone-900 p-0.5 rounded-sm">
                <button
                  type="button"
                  id="btn-layout-editor-only"
                  onClick={() => updateSettings({ editorMode: 'editor' })}
                  className={`p-1 rounded-sm text-xs cursor-pointer transition-colors
                    ${isEditorOnly ? 'bg-white dark:bg-[#1A1B1E] text-[#1D2EA0] dark:text-[#A3B5F5] font-semibold shadow-sm' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}
                  title="Editor View"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="btn-layout-split"
                  onClick={() => updateSettings({ editorMode: 'split' })}
                  className={`p-1 rounded-sm text-xs cursor-pointer transition-colors
                    ${isSplitMode ? 'bg-white dark:bg-[#1A1B1E] text-[#1D2EA0] dark:text-[#A3B5F5] font-semibold shadow-sm' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}
                  title="Split View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="btn-layout-preview-only"
                  onClick={() => updateSettings({ editorMode: 'preview' })}
                  className={`p-1 rounded-sm text-xs cursor-pointer transition-colors
                    ${isPreviewOnly ? 'bg-white dark:bg-[#1A1B1E] text-[#1D2EA0] dark:text-[#A3B5F5] font-semibold shadow-sm' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}
                  title="Reader View"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          <span className="w-px h-4 bg-stone-200 dark:bg-[#2E3039] mx-0.5" />

          {/* More Actions Trigger Button */}
          <button
            type="button"
            id="btn-editor-more-actions"
            onClick={() => {
              const isMobile = window.innerWidth < 768;
              openActions(note.id, isMobile);
            }}
            title="Document Menu"
            className="p-1.5 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-150/50 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-850/60 transition-colors cursor-pointer"
          >
            <MoreVertical className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Optional Formatting Toolbar (Hidden by default, clean!) */}
      {showToolbar && !isPreviewOnly && (
        <div className="px-6 py-1.5 bg-[#F2F3F8] dark:bg-[#111214] border-b border-stone-200/50 dark:border-[#2E3039] overflow-x-auto flex items-center gap-1 shrink-0 z-20 no-scrollbar">
          {toolbarButtons.map((btn) => (
            <button
              type="button"
              id={`btn-format-${btn.id}`}
              key={btn.id}
              onClick={btn.action}
              title={btn.label}
              disabled={btn.disabled}
              className={`p-1 rounded text-stone-500 transition-colors shrink-0
                ${btn.disabled 
                  ? 'opacity-30 cursor-not-allowed' 
                  : 'hover:bg-stone-150/60 dark:hover:bg-stone-850 hover:text-stone-950 dark:hover:text-stone-200 cursor-pointer'}`}
            >
              <btn.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      )}

      {/* Editor Content Area (Centered Sheet Layout Resting on our Spacious Calm Desk Background) */}
      <div className="flex-1 flex overflow-hidden relative max-w-full">
        
        {/* Primary raw text editing panel */}
        {!isPreviewOnly && (
          <div className="flex-1 h-full relative flex flex-col overflow-hidden max-w-full">
            <div className={`flex-1 ${
              isSplitMode 
                ? 'overflow-hidden bg-white dark:bg-[#1A1B1E]' 
                : `${isMobile ? 'p-0 bg-white dark:bg-[#1A1B1E]' : 'py-6 px-4 md:px-6 lg:px-8 bg-[#F2F3F8] dark:bg-[#111214] flex justify-center'} overflow-y-auto overflow-x-hidden`
            } transition-colors duration-200 scrollbar-thin`}>
              {/* The beautiful floating writing sheet */}
              <div className={`w-full flex flex-col ${
                isSplitMode 
                  ? 'h-full p-6 md:p-10 border-e border-stone-200/50 dark:border-[#2E3039] overflow-hidden' 
                  : `${isMobile ? 'p-5 bg-white dark:bg-[#1A1B1E] min-h-full border-none rounded-none shadow-none' : `bg-white dark:bg-[#1A1B1E] border border-[#D1D4DC] dark:border-[#2E3039] shadow-[0_2px_15px_rgba(0,0,0,0.015)] rounded-sm p-8 md:p-14 min-h-full ${getWidthClass(settings.editorWidth)}`}`
              }`}>
              
              {/* Note inline Title (sits naturally on the writing sheet) */}
              <div className="mb-6">
                <input
                  type="text"
                  id="sheet-title-input"
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  placeholder="Document Title"
                  dir="auto"
                  className="w-full bg-transparent text-2xl font-bold font-serif text-stone-900 dark:text-stone-100 focus:outline-none placeholder-stone-200 dark:placeholder-stone-800 border-b border-stone-100/50 dark:border-stone-900/30 pb-2 leading-tight"
                />
                
                {/* Note metadata inline tags */}
                <div className="flex items-center flex-wrap gap-2 text-[10px] text-stone-400 font-medium mt-2 leading-none select-none">
                  <span>Last modified {formatDate(note.updatedAt)}</span>
                  {note.tags && note.tags.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="italic">{note.tags.join(' · ')}</span>
                    </>
                  )}
                  {noteFolder && (
                    <>
                      <span>·</span>
                      <span className="font-semibold">{noteFolder.name}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Snap-aligned custom-spaced textarea */}
              <textarea
                ref={textareaRef}
                id="textarea-note-canvas"
                value={localContent}
                onChange={handleTextareaChange}
                onSelect={handleTextareaSelect}
                dir="auto"
                className={`w-full bg-transparent resize-none focus:outline-none text-stone-800 dark:text-stone-200 placeholder-stone-200 dark:placeholder-stone-800 leading-relaxed font-mono pb-40 ${
                  isSplitMode 
                    ? 'flex-1 h-full overflow-y-auto overflow-x-hidden scrollbar-thin' 
                    : 'h-auto overflow-hidden'
                }`}
                style={{
                  fontSize: `${isMobile ? Math.max(16, settings.editorFontSize) : settings.editorFontSize}px`,
                  lineHeight: settings.editorLineHeight,
                  whiteSpace: settings.editorWordWrap ? 'pre-wrap' : 'pre'
                }}
                placeholder="Start writing markdown content..."
              />
            </div>
          </div>
          
          {/* Persistent, minimal document info summary in the bottom-right corner */}
          <div className="absolute bottom-4 right-6 z-20 flex items-center gap-2.5 px-3 py-1.5 rounded-xs bg-[#F2F3F8]/90 dark:bg-[#111214]/90 backdrop-blur-md border border-stone-250/50 dark:border-[#2E3039] text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 select-none shadow-xs transition-all duration-300">
            <span className="flex items-center gap-1">
              <span className="text-[#1D2EA0] dark:text-[#A3B5F5] font-medium">Words:</span>
              <span className="text-stone-800 dark:text-stone-200">{calculateWordCount(localContent)}</span>
            </span>
            <span className="w-1 h-1 rounded-full bg-stone-300 dark:bg-stone-700" />
            <span className="flex items-center gap-1">
              <span className="text-[#1D2EA0] dark:text-[#A3B5F5] font-medium">Chars:</span>
              <span className="text-stone-800 dark:text-stone-200">{calculateCharacterCount(localContent)}</span>
            </span>
            <span className="w-1 h-1 rounded-full bg-stone-300 dark:bg-stone-700" />
            <span className="flex items-center gap-1">
              <span className="text-[#1D2EA0] dark:text-[#A3B5F5] font-medium">Reading:</span>
              <span className="text-stone-800 dark:text-stone-200">{calculateReadingTime(localContent)}m</span>
            </span>
          </div>
          </div>
        )}

        {/* Elegant Preview Reader View */}
        {!isEditorOnly && (
          <div className={`flex-1 ${
            isSplitMode 
              ? 'overflow-hidden bg-white dark:bg-[#1A1B1E]' 
              : isMobile 
                ? 'overflow-y-auto overflow-x-hidden p-0 bg-white dark:bg-[#1A1B1E]' 
                : 'overflow-hidden py-6 px-4 md:px-6 lg:px-8 bg-[#F2F3F8] dark:bg-[#111214] flex justify-center'
          } transition-colors duration-200 select-text`}>
            {/* The beautiful floating reader sheet (fixed-height canvas; text scrolls inside so the background stays put) */}
            <div className={`w-full flex flex-col ${
              isSplitMode 
                ? 'h-full p-6 md:p-10 border-e border-stone-200/50 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] overflow-y-auto overflow-x-hidden scrollbar-thin' 
                : isMobile 
                  ? 'p-5 bg-white dark:bg-[#1A1B1E] min-h-full border-none rounded-none shadow-none'
                  : `bg-white dark:bg-[#1A1B1E] border border-[#D1D4DC] dark:border-[#2E3039] shadow-[0_2px_15px_rgba(0,0,0,0.015)] rounded-sm h-full overflow-y-auto overflow-x-hidden scrollbar-thin p-8 md:p-14 ${getWidthClass(settings.editorWidth)}`
            }`}>
              {isPreviewOnly && (
                <div className="mb-8 border-b border-stone-100/60 dark:border-stone-900/40 pb-4 select-none">
                  <h1 className="text-3xl font-bold font-serif text-stone-900 dark:text-stone-100 leading-tight">
                    {localTitle || 'Untitled Document'}
                  </h1>
                  <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wider mt-2">
                    {formatDate(note.updatedAt)} {noteFolder ? `· ${noteFolder.name}` : ''}
                  </p>
                </div>
              )}
              <MarkdownPreview 
                content={localContent} 
                onContentChange={(updated) => setLocalContent(updated)}
              />
            </div>
          </div>
        )}

        {/* Floating Contextual formatting toolbar */}
        {selectionRange && !isPreviewOnly && (
          <div 
            id="floating-format-bar"
            className="absolute z-50 flex items-center bg-stone-950 text-white rounded-sm border border-white/10 shadow-lg px-1 py-1 gap-1.5 transition-all duration-150 text-[11px] select-none"
            style={{
              left: `${selectionRange.x}px`,
              top: `${selectionRange.y - 38}px`
            }}
          >
            <button
              type="button"
              id="btn-float-bold"
              onClick={() => {
                insertFormat('bold');
                setSelectionRange(null);
              }}
              className="px-1.5 py-0.5 rounded hover:bg-white/15 cursor-pointer font-bold"
            >
              B
            </button>
            <button
              type="button"
              id="btn-float-italic"
              onClick={() => {
                insertFormat('italic');
                setSelectionRange(null);
              }}
              className="px-1.5 py-0.5 rounded hover:bg-white/15 cursor-pointer italic"
            >
              I
            </button>
            <button
              type="button"
              id="btn-float-strike"
              onClick={() => {
                insertFormat('strike');
                setSelectionRange(null);
              }}
              className="px-1.5 py-0.5 rounded hover:bg-white/15 cursor-pointer line-through"
            >
              S
            </button>
            <span className="w-px h-3 bg-white/20" />
            <button
              type="button"
              id="btn-float-quote"
              onClick={() => {
                insertFormat('quote');
                setSelectionRange(null);
              }}
              className="px-1.5 py-0.5 rounded hover:bg-white/15 cursor-pointer"
            >
              Quote
            </button>
            <button
              type="button"
              id="btn-float-code"
              onClick={() => {
                insertFormat('codeBlock');
                setSelectionRange(null);
              }}
              className="px-1.5 py-0.5 rounded hover:bg-white/15 cursor-pointer font-mono"
            >
              Code
            </button>
          </div>
        )}

        {/* Temporary right-side utility panel (Outline / Document Info) */}
        {tocOpen && !isMobile && (
          <div className="w-[280px] h-full border-s border-stone-200/50 dark:border-[#2E3039] bg-[#E8E9EE] dark:bg-[#222328] flex flex-col shrink-0 animate-fade-in relative z-20">
            {/* Header with quiet textual tabs */}
            <div className="flex border-b border-stone-200/50 dark:border-[#2E3039] px-2 pt-2">
              <button
                type="button"
                onClick={() => setRightPanelTab('outline')}
                className={`flex-1 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer text-center
                  ${rightPanelTab === 'outline' 
                    ? 'text-[#1D2EA0] dark:text-[#A3B5F5] border-b-2 border-[#1D2EA0] dark:border-[#A3B5F5]' 
                    : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}
              >
                Outline
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab('info')}
                className={`flex-1 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer text-center
                  ${rightPanelTab === 'info' 
                    ? 'text-[#1D2EA0] dark:text-[#A3B5F5] border-b-2 border-[#1D2EA0] dark:border-[#A3B5F5]' 
                    : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}
              >
                Metadata
              </button>
            </div>

            {/* Panel Content Area */}
            <div className="flex-1 overflow-y-auto p-4 select-none">
              {rightPanelTab === 'outline' ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3 block">
                    Table of Contents
                  </span>
                  {docHeadings.length === 0 ? (
                    <span className="text-xs text-stone-400 dark:text-stone-500 italic block py-4 text-center">
                      No headings found.
                    </span>
                  ) : (
                    docHeadings.map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => scrollToHeading(h.id)}
                        className={`w-full text-start py-1 px-2 text-xs rounded-sm hover:bg-stone-150/50 dark:hover:bg-stone-900 text-stone-600 dark:text-stone-400 hover:text-[#1D2EA0] dark:hover:text-[#A3B5F5] transition-colors truncate cursor-pointer
                          ${h.level === 1 ? 'font-semibold' : h.level === 2 ? 'ps-4 text-[11px]' : 'ps-8 text-[10px]'}`}
                      >
                        {h.text}
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4 text-xs">
                  <div>
                    <span className="text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest block mb-2">
                      File Information
                    </span>
                    <div className="flex flex-col gap-2 bg-white/45 dark:bg-stone-900/20 p-3 rounded-sm border border-stone-200/30 dark:border-stone-850/40">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 text-[11px]">Title</span>
                        <span className="font-semibold text-stone-800 dark:text-stone-200 truncate max-w-[150px]">{note.title || 'Untitled'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 text-[11px]">Folder</span>
                        <span className="font-semibold text-stone-800 dark:text-stone-200">{noteFolder?.name || 'Root'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 text-[11px]">Created</span>
                        <span className="font-semibold text-stone-500 text-[11px]">{new Date(note.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 text-[11px]">Updated</span>
                        <span className="font-semibold text-stone-500 text-[11px]">{new Date(note.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest block mb-2">
                      Document Statistics
                    </span>
                    <div className="flex flex-col gap-2 bg-white/45 dark:bg-stone-900/20 p-3 rounded-sm border border-stone-200/30 dark:border-stone-850/40">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 text-[11px]">Words</span>
                        <span className="font-mono font-bold text-stone-800 dark:text-stone-200">{calculateWordCount(localContent)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 text-[11px]">Characters</span>
                        <span className="font-mono font-bold text-stone-800 dark:text-stone-200">{calculateCharacterCount(localContent)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400 text-[11px]">Reading Time</span>
                        <span className="font-semibold text-stone-800 dark:text-stone-200">{calculateReadingTime(localContent)} min</span>
                      </div>
                    </div>
                  </div>

                  {note.tags && note.tags.length > 0 && (
                    <div>
                      <span className="text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest block mb-2">
                        Tags
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {note.tags.map((tg, idx) => (
                          <span 
                            key={idx} 
                            className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-stone-150/60 dark:bg-stone-900 border border-stone-200/50 dark:border-stone-800 text-[10px] text-stone-600 dark:text-stone-400 font-semibold"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {tg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick footer helper */}
            <div className="p-3 border-t border-stone-200/50 dark:border-[#2E3039] text-center">
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                className="text-[9px] font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 uppercase tracking-widest cursor-pointer"
              >
                Close Panel
              </button>
            </div>
          </div>
        )}

        {/* Fullscreen Zen Mode helper alert */}
        {zenMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-stone-950/90 text-[10px] uppercase font-bold tracking-widest text-white shadow rounded-sm border border-white/5 pointer-events-none z-50 select-none">
            Zen Mode • Press ESC to exit
          </div>
        )}

        {/* Subtle Editorial Status Bar at the bottom right - gracefully fades out on typing */}
        {!isMobile && (
          <div 
            className={`absolute bottom-4 right-4 z-30 flex items-center gap-2.5 px-3 py-1 bg-[#F2F3F8]/90 dark:bg-[#111214]/90 backdrop-blur-md rounded-sm border border-stone-200/50 dark:border-stone-850/50 text-[9px] tracking-widest uppercase font-bold text-stone-400 dark:text-stone-500 select-none shadow-sm pointer-events-none transition-opacity duration-700
              ${isTyping ? 'opacity-10' : 'opacity-100'}`}
          >
            <span>{calculateWordCount(localContent)} words</span>
            <span className="text-stone-200 dark:text-stone-800">·</span>
            <span>{calculateCharacterCount(localContent)} chars</span>
            <span className="text-stone-200 dark:text-stone-800">·</span>
            <span>{calculateReadingTime(localContent)} min read</span>
          </div>
        )}
      </div>

      {/* Navigation Guard Confirmation Modal */}
      <Modal
        isOpen={showUnsavedModal}
        onClose={cancelNavigation}
        title="Unsaved Changes"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold text-stone-600 dark:text-stone-400 leading-relaxed">
            You have unsaved changes in "{localTitle || 'Untitled Document'}". Would you like to save them before leaving?
          </p>

          <div className="flex items-center justify-end gap-2 mt-2 text-xs font-semibold">
            <button
              type="button"
              id="btn-unsaved-cancel"
              onClick={cancelNavigation}
              className="px-3 py-1.5 rounded-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-850 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="btn-unsaved-discard"
              onClick={() => confirmNavigation(false)}
              className="px-3 py-1.5 rounded-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/10 cursor-pointer"
            >
              Discard Changes
            </button>
            <button
              type="button"
              id="btn-unsaved-save"
              onClick={() => confirmNavigation(true, triggerImmediateSave)}
              className="px-4 py-1.5 rounded-sm font-bold uppercase tracking-widest text-white bg-[#1D2EA0] hover:bg-[#18298B] dark:bg-[#A3B5F5] dark:hover:bg-[#94A5F0] cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
