/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const { settings } = useSettingsStore();
  const isRtl = settings.language === 'fa';

  // Listen to escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div 
        id="modal-card"
        className="relative w-full max-w-md bg-white dark:bg-[#16171B] border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transform transition-all duration-300 scale-100"
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b border-stone-100 dark:border-stone-800 shrink-0
          ${isRtl ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
          <button
            type="button"
            id="modal-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 text-stone-700 dark:text-stone-300">
          {children}
        </div>
      </div>
    </div>
  );
}
