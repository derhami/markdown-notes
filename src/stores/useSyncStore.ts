/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { liveQuery } from 'dexie';
import { db } from '../db/database';
import {
  clearBrowserSyncFolder,
  createBrowserAdapter,
  createDeviceAdapter,
  ensureBrowserPermission,
  isNativeShell,
  loadBrowserSyncFolder,
  pickBrowserSyncFolder,
  prepareDeviceSyncFolder,
  runFolderSync,
  supportsBrowserFolderSync,
  type SyncAdapter,
  type SyncReport
} from '../utils/folderSync';
import type { Settings } from '../types';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  initialized: boolean;
  connected: boolean;
  folderLabel: string | null;
  lastSyncAt: number | null;
  lastReport: SyncReport | null;
  autoSync: boolean;
  status: SyncStatus;
  error: string | null;
  init: () => Promise<void>;
  connect: () => Promise<boolean>;
  syncNow: (reason?: 'manual' | 'auto') => Promise<SyncReport | null>;
  disconnect: () => Promise<void>;
  setAutoSync: (enabled: boolean) => Promise<void>;
}

let adapter: SyncAdapter | null = null;
let scheduleHandle: ReturnType<typeof setTimeout> | null = null;
let subscription: { unsubscribe: () => void } | null = null;
let activityListenerAttached = false;
// Our own writes must not schedule another automatic pass.
let suppressUntil = 0;

async function saveConfig(changes: Partial<Settings>): Promise<void> {
  const current = (await db.settings.get('current')) ?? ({ id: 'current' } as Settings);
  await db.settings.put({ ...current, ...changes, id: 'current' });
  const { useSettingsStore } = await import('./useSettingsStore');
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, ...changes }
  }));
}

function clearSchedule() {
  if (scheduleHandle) {
    clearTimeout(scheduleHandle);
    scheduleHandle = null;
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  initialized: false,
  connected: false,
  folderLabel: null,
  lastSyncAt: null,
  lastReport: null,
  autoSync: true,
  status: 'idle',
  error: null,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    const settings = await db.settings.get('current');
    const target = settings?.syncTarget;
    const lastSyncAt = settings?.syncLastAt ?? null;
    const autoSync = settings?.syncAuto ?? true;
    const folderLabel = settings?.syncFolderLabel ?? null;

    if (target === 'device' && isNativeShell()) {
      adapter = createDeviceAdapter();
      set({ connected: true, folderLabel: folderLabel ?? adapter.label, lastSyncAt, autoSync });
    } else if (target === 'browser') {
      const handle = await loadBrowserSyncFolder();
      if (handle && (await ensureBrowserPermission(handle, false))) {
        adapter = createBrowserAdapter(handle);
        set({ connected: true, folderLabel: handle.name, lastSyncAt, autoSync });
      } else if (handle) {
        // The handle is remembered but Chromium needs a user gesture again.
        set({
          connected: false,
          folderLabel: handle.name,
          lastSyncAt,
          autoSync,
          error: 'Reconnect the folder to restore write access.'
        });
      } else {
        set({ autoSync });
      }
    } else {
      set({ autoSync });
    }

    if (!subscription) {
      subscription = liveQuery(() => db.notes.orderBy('updatedAt').last()).subscribe({
        next: () => {
          const state = get();
          if (!state.connected || !state.autoSync || state.status === 'syncing') return;
          if (Date.now() < suppressUntil) return;
          clearSchedule();
          scheduleHandle = setTimeout(() => {
            const current = get();
            if (current.connected && current.autoSync && current.status !== 'syncing') {
              void current.syncNow('auto');
            }
          }, 2500);
        },
        error: () => undefined
      });
    }

    if (!activityListenerAttached && typeof document !== 'undefined') {
      activityListenerAttached = true;
      document.addEventListener('visibilitychange', () => {
        const state = get();
        if (document.visibilityState === 'hidden' && state.connected && state.autoSync) {
          void state.syncNow('auto');
        }
      });
    }
  },

  connect: async () => {
    set({ error: null });
    try {
      if (isNativeShell()) {
        const label = await prepareDeviceSyncFolder();
        adapter = createDeviceAdapter();
        // Fail loudly here instead of pretending the folder is linked.
        await adapter.listFiles();
        await saveConfig({ syncTarget: 'device', syncFolderLabel: label, syncAuto: get().autoSync });
        set({ connected: true, folderLabel: label, error: null });
      } else {
        if (!supportsBrowserFolderSync()) {
          set({
            error:
              'This browser cannot link a folder. Install the Android app, or use a Chromium browser on a computer.'
          });
          return false;
        }
        const handle = await pickBrowserSyncFolder();
        if (!(await ensureBrowserPermission(handle, true))) {
          set({ error: 'Write access to that folder was not granted.' });
          return false;
        }
        adapter = createBrowserAdapter(handle);
        await saveConfig({ syncTarget: 'browser', syncFolderLabel: handle.name, syncAuto: get().autoSync });
        set({ connected: true, folderLabel: handle.name, error: null });
      }

      await get().syncNow('manual');
      return true;
    } catch (error) {
      const name = (error as any)?.name;
      if (name === 'AbortError') return false;
      set({ error: (error as Error).message || 'Could not open that folder.' });
      return false;
    }
  },

  syncNow: async (reason = 'manual') => {
    if (get().status === 'syncing') return get().lastReport;
    if (!adapter) {
      if (get().connected) {
        const handle = await loadBrowserSyncFolder();
        if (handle && (await ensureBrowserPermission(handle, false))) {
          adapter = createBrowserAdapter(handle);
        }
      }
      if (!adapter) {
        set({ error: 'Choose a folder first.', status: 'error' });
        return null;
      }
    }

    clearSchedule();
    suppressUntil = Date.now() + 8000;
    set({ status: 'syncing', error: null });
    try {
      const report = await runFolderSync(adapter);
      const stamp = report.at;
      await saveConfig({ syncLastAt: stamp });
      set({
        status: 'idle',
        lastReport: report,
        lastSyncAt: stamp,
        folderLabel: adapter.label,
        error: report.errors.length ? report.errors[0] : null
      });
      suppressUntil = Date.now() + 6000;

      if (reason === 'manual') {
        const { useToastStore } = await import('./useToastStore');
        useToastStore.getState().showToast(
          report.errors.length
            ? 'Synced with a few skipped files.'
            : `Folder sync complete · ${report.pushed + report.pulled + report.imported} changed`,
          report.errors.length ? 'info' : 'success'
        );
      }
      return report;
    } catch (error) {
      set({ status: 'error', error: (error as Error).message || 'Folder sync failed.' });
      if (reason === 'manual') {
        const { useToastStore } = await import('./useToastStore');
        useToastStore.getState().showToast('Folder sync failed', 'error');
      }
      return null;
    }
  },

  disconnect: async () => {
    clearSchedule();
    adapter = null;
    await clearBrowserSyncFolder().catch(() => undefined);
    await saveConfig({
      syncTarget: undefined,
      syncFolderLabel: undefined,
      syncAuto: false
    });
    set({ connected: false, folderLabel: null, lastSyncAt: null, lastReport: null, status: 'idle', error: null, autoSync: false });
  },

  setAutoSync: async (enabled) => {
    await saveConfig({ syncAuto: enabled });
    set({ autoSync: enabled });
    if (!enabled) clearSchedule();
    else if (get().connected) void get().syncNow('auto');
  }
}));
