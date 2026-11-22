/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { db, DEFAULT_SETTINGS } from '../db/database';

export const ACCENT_PRESETS = [
  { id: 'indigo',  label: 'Indigo',  light: '#1D2EA0', dark: '#A3B5F5' },
  { id: 'emerald', label: 'Emerald', light: '#0F766E', dark: '#5EEAD4' },
  { id: 'rose',    label: 'Rose',    light: '#BE123C', dark: '#FDA4AF' },
  { id: 'amber',   label: 'Amber',   light: '#B45309', dark: '#FCD34D' },
  { id: 'violet',  label: 'Violet',  light: '#6D28D9', dark: '#C4B5FD' },
  { id: 'slate',   label: 'Slate',   light: '#334155', dark: '#CBD5E1' }
] as const;
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
      applyAccentColor(mergedSettings.accentPreset || 'indigo');
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
    if (changes.accentPreset) {
      applyAccentColor(changes.accentPreset);
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

function applyAccentColor(presetId: string) {
  const preset = ACCENT_PRESETS.find((p) => p.id === presetId) || ACCENT_PRESETS[0];
  const root = window.document.documentElement;
  root.style.setProperty('--accent', preset.light);
  root.style.setProperty('--accent-dark', preset.dark);
  try {
    localStorage.setItem('accentPreset', preset.id);
  } catch (e) {}
}
