/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { db, DEFAULT_SETTINGS } from '../db/database';
import type { Settings, Theme, Language, EditorMode, UiDensity } from '../types';

interface SettingsState {
  settings: Settings;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (changes: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    try {
      let saved = await db.settings.get('current');
      if (!saved) {
        saved = { id: 'current', ...DEFAULT_SETTINGS } as any;
        await db.settings.put(saved!);
      }
      
      const mergedSettings = { ...DEFAULT_SETTINGS, ...saved, language: saved.language || 'en' as const };
      set({ settings: mergedSettings, isLoaded: true });
      
      // Apply initial theme and direction
      applyTheme(mergedSettings.theme);
      applyLanguage(mergedSettings.language || 'en');
    } catch (error) {
      console.error('Error loading settings:', error);
      set({ settings: { ...DEFAULT_SETTINGS, language: 'en' }, isLoaded: true });
    }
  },

  updateSettings: async (changes) => {
    const updated = { ...get().settings, ...changes, language: (changes.language ?? get().settings.language) as Language };
    set({ settings: updated });
    
    // Save to DB
    try {
      await db.settings.put({ id: 'current', ...updated });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }

    // Apply visual effects if related things changed
    if (changes.theme) {
      applyTheme(changes.theme);
    }
    applyLanguage(updated.language);
  }
}));

// Helper functions for DOM manipulations
function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  const body = window.document.body;
  
  root.classList.remove('light', 'dark');
  if (body) {
    body.classList.remove('light', 'dark');
  }

  let activeTheme = theme;
  if (theme === 'system') {
    activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  root.classList.add(activeTheme);
  if (body) {
    body.classList.add(activeTheme);
  }

  try {
    localStorage.setItem('theme', theme);
  } catch (e) {}
}

function applyLanguage(lang: Language) {
  const root = window.document.documentElement;
  const isRtl = lang === 'fa';
  root.setAttribute('lang', lang);
  root.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  root.style.fontFamily = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
}

// Media listener for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentTheme = useSettingsStore.getState().settings.theme;
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  });
}
