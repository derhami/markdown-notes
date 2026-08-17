/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';

interface NoteActionsState {
  actionNoteId: string | null;
  isOpenBottomSheet: boolean;
  isOpenRenameModal: boolean;
  isOpenSaveAsModal: boolean;
  isOpenMoveModal: boolean;
  isOpenTagsModal: boolean;
  isOpenDeleteConfirmModal: boolean;
  isOpenInfoModal: boolean;

  // Triggers
  openActions: (noteId: string, isMobileDevice: boolean) => void;
  closeAll: () => void;
  
  setOpenRenameModal: (open: boolean) => void;
  setOpenSaveAsModal: (open: boolean) => void;
  setOpenMoveModal: (open: boolean) => void;
  setOpenTagsModal: (open: boolean) => void;
  setOpenDeleteConfirmModal: (open: boolean) => void;
  setOpenInfoModal: (open: boolean) => void;
}

export const useNoteActionsStore = create<NoteActionsState>((set) => ({
  actionNoteId: null,
  isOpenBottomSheet: false,
  isOpenRenameModal: false,
  isOpenSaveAsModal: false,
  isOpenMoveModal: false,
  isOpenTagsModal: false,
  isOpenDeleteConfirmModal: false,
  isOpenInfoModal: false,

  openActions: (noteId, isMobileDevice) => {
    if (isMobileDevice) {
      set({ actionNoteId: noteId, isOpenBottomSheet: true });
    } else {
      // On desktop, we can show the bottom sheet or trigger modal/dropdown
      set({ actionNoteId: noteId, isOpenBottomSheet: true });
    }
  },

  closeAll: () => set({
    isOpenBottomSheet: false,
    isOpenRenameModal: false,
    isOpenSaveAsModal: false,
    isOpenMoveModal: false,
    isOpenTagsModal: false,
    isOpenDeleteConfirmModal: false,
    isOpenInfoModal: false,
  }),

  setOpenRenameModal: (open) => set({ isOpenRenameModal: open }),
  setOpenSaveAsModal: (open) => set({ isOpenSaveAsModal: open }),
  setOpenMoveModal: (open) => set({ isOpenMoveModal: open }),
  setOpenTagsModal: (open) => set({ isOpenTagsModal: open }),
  setOpenDeleteConfirmModal: (open) => set({ isOpenDeleteConfirmModal: open }),
  setOpenInfoModal: (open) => set({ isOpenInfoModal: open }),
}));
