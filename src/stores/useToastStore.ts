/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { generateId } from '../utils/id';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (
    message: string, 
    type?: 'success' | 'error' | 'info', 
    action?: { label: string; onClick: () => void }
  ) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  
  showToast: (message, type = 'success', action) => {
    const id = generateId();
    const newToast: ToastItem = { id, message, type, action };
    
    set((state) => ({ toasts: [...state.toasts, newToast] }));
    
    // Auto remove after 4 seconds (unless it has an action, maybe keep longer)
    const delay = action ? 6000 : 4000;
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, delay);
  },
  
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  }
}));
