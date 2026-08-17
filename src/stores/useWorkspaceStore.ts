/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';

export type SidebarCategory = 
  | 'all' 
  | 'recent' 
  | 'favorites' 
  | 'pinned' 
  | 'trash' 
  | 'archive'
  | 'folders'
  | 'tags'
  | `folder:${string}` 
  | `tag:${string}`;

interface WorkspaceState {
  activeNoteId: string | null;
  activeCategory: SidebarCategory;
  searchQuery: string;
  commandPaletteOpen: boolean;
  focusMode: boolean;
  zenMode: boolean;
  sidebarOpen: boolean;
  tocOpen: boolean; // Table of Contents panel in desktop
  
  // Navigation Guard / Dirty State Properties
  isEditorDirty: boolean;
  pendingNoteId: string | null;
  pendingCategory: SidebarCategory | null;
  showUnsavedModal: boolean;

  // Actions
  setActiveNoteId: (id: string | null) => void;
  forceSetActiveNoteId: (id: string | null) => void;
  setActiveCategory: (category: SidebarCategory) => void;
  forceSetActiveCategory: (category: SidebarCategory) => void;
  setSearchQuery: (query: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setFocusMode: (active: boolean) => void;
  setZenMode: (active: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setTocOpen: (open: boolean) => void;
  setIsEditorDirty: (dirty: boolean) => void;
  
  // Guard handlers
  confirmNavigation: (save: boolean, onSaveCallback?: () => Promise<void>) => Promise<void>;
  cancelNavigation: () => void;
  
  // Navigation utility
  resetWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeNoteId: null,
  activeCategory: 'all',
  searchQuery: '',
  commandPaletteOpen: false,
  focusMode: false,
  zenMode: false,
  sidebarOpen: true,
  tocOpen: false,

  // Guard initial states
  isEditorDirty: false,
  pendingNoteId: null,
  pendingCategory: null,
  showUnsavedModal: false,

  setActiveNoteId: (id) => {
    const state = useWorkspaceStore.getState();
    if (state.isEditorDirty && id !== state.activeNoteId) {
      set({ pendingNoteId: id, pendingCategory: null, showUnsavedModal: true });
    } else {
      set({ activeNoteId: id });
    }
  },

  forceSetActiveNoteId: (id) => set({ 
    activeNoteId: id,
    isEditorDirty: false,
    pendingNoteId: null,
    pendingCategory: null,
    showUnsavedModal: false
  }),

  setActiveCategory: (category) => {
    const state = useWorkspaceStore.getState();
    if (state.isEditorDirty) {
      set({ pendingCategory: category, pendingNoteId: null, showUnsavedModal: true });
    } else {
      set({ 
        activeCategory: category,
        activeNoteId: null,
        searchQuery: '' 
      });
    }
  },

  forceSetActiveCategory: (category) => set({
    activeCategory: category,
    activeNoteId: null,
    searchQuery: '',
    isEditorDirty: false,
    pendingNoteId: null,
    pendingCategory: null,
    showUnsavedModal: false
  }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setFocusMode: (active) => set((state) => ({ 
    focusMode: active,
    zenMode: active ? state.zenMode : false 
  })),
  setZenMode: (active) => set((state) => ({ 
    zenMode: active,
    focusMode: active ? true : state.focusMode
  })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setTocOpen: (open) => set({ tocOpen: open }),
  setIsEditorDirty: (dirty) => set({ isEditorDirty: dirty }),

  confirmNavigation: async (save, onSaveCallback) => {
    const state = useWorkspaceStore.getState();
    if (save && onSaveCallback) {
      try {
        await onSaveCallback();
      } catch (err) {
        console.error('Failed to save during navigation guard:', err);
        return; // Halt navigation if save fails
      }
    }
    
    // Process transition
    if (state.pendingNoteId !== null) {
      set({
        activeNoteId: state.pendingNoteId,
        isEditorDirty: false,
        pendingNoteId: null,
        pendingCategory: null,
        showUnsavedModal: false
      });
    } else if (state.pendingCategory !== null) {
      set({
        activeCategory: state.pendingCategory,
        activeNoteId: null,
        searchQuery: '',
        isEditorDirty: false,
        pendingNoteId: null,
        pendingCategory: null,
        showUnsavedModal: false
      });
    } else {
      set({
        isEditorDirty: false,
        pendingNoteId: null,
        pendingCategory: null,
        showUnsavedModal: false
      });
    }
  },

  cancelNavigation: () => set({
    pendingNoteId: null,
    pendingCategory: null,
    showUnsavedModal: false
  }),
  
  resetWorkspace: () => set({
    activeNoteId: null,
    activeCategory: 'all',
    searchQuery: '',
    focusMode: false,
    zenMode: false,
    tocOpen: false,
    isEditorDirty: false,
    pendingNoteId: null,
    pendingCategory: null,
    showUnsavedModal: false
  })
}));
