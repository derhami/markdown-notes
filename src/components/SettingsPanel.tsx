/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Settings, HelpCircle, HardDrive, Keyboard, Trash2, 
  Download, Upload, ShieldAlert, CheckCircle2, ChevronRight, X, ArrowLeft,
  Shield, Lock, Unlock, Key, Eye, EyeOff, AlertTriangle, FileText, RefreshCw, Folder, Copy,
  FolderSync, Smartphone, Loader2
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, markWorkspaceSeeded } from '../db/database';
import { importMarkdownFolder } from '../utils/importer';
import { stringifyFrontmatter, sanitizeFileName } from '../utils/notesHelper';
import { createZip, downloadBlob } from '../utils/zip';
import { useSettingsStore, ACCENT_PRESETS } from '../stores/useSettingsStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useToastStore } from '../stores/useToastStore';
import { useVaultStore } from '../stores/useVaultStore';
import type { Theme, Note } from '../types';
import { withoutVaultSettings } from '../utils/backup';
import { describeSyncReport, isNativeShell } from '../utils/folderSync';
import { useSyncStore } from '../stores/useSyncStore';

export default function SettingsPanel() {
  const { settings, updateSettings } = useSettingsStore();
  const { setActiveNoteId } = useWorkspaceStore();
  const { showToast } = useToastStore();
  const {
    connected: syncConnected,
    folderLabel: syncFolderLabel,
    lastSyncAt,
    lastReport,
    autoSync,
    status: syncStatus,
    error: syncError,
    connect: connectSyncFolder,
    syncNow,
    disconnect: disconnectSyncFolder,
    setAutoSync
  } = useSyncStore();
  const nativeShell = isNativeShell();
  const { 
    isLocked, 
    vaultPasswordExists, 
    showHidden, 
    autoLockDelay,
    setupVault, 
    changePassword, 
    generateRecoveryKey, 
    unlock, 
    lock, 
    setShowHidden, 
    setAutoLockDelay 
  } = useVaultStore();
  
  // Storage Metrics
  const notes = useLiveQuery(() => db.notes.toArray()) || [];
  const folders = useLiveQuery(() => db.folders.toArray()) || [];
  const tags = useLiveQuery(() => db.tags.toArray()) || [];

  const activeNotesCount = notes.filter(n => !n.deletedAt).length;
  const trashCount = notes.filter(n => n.deletedAt !== null).length;

  const [activeTab, setActiveTab] = useState<'appearance' | 'editor' | 'storage' | 'security' | 'shortcuts'>('appearance');
  
  // Mobile UI States
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileSection, setMobileSection] = useState<'menu' | 'appearance' | 'editor' | 'storage' | 'security' | 'shortcuts'>('menu');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Database Wiper
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [isWipeVerifying, setIsWipeVerifying] = useState(false);

  // Security States
  const [vaultPass, setVaultPass] = useState('');
  const [vaultPassConfirm, setVaultPassConfirm] = useState('');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [recoveryKeyDisplay, setRecoveryKeyDisplay] = useState<string | null>(null);
  const [unlockPass, setUnlockPass] = useState('');

  // Storage States
  const [backupIsEncrypted, setBackupIsEncrypted] = useState(true);
  const [restorePreview, setRestorePreview] = useState<{
    notesCount: number;
    foldersCount: number;
    secureCount: number;
    conflictsCount: number;
    conflictsList: string[];
    data: any;
  } | null>(null);

  // Backups export
  const handleExportBackup = async () => {
    try {
      let notesToExport = [...notes];
      
      // If unencrypted backup is chosen, let's verify if vault is locked
      if (!backupIsEncrypted && vaultPasswordExists) {
        if (isLocked) {
          showToast('Please unlock your Secure Vault to export unencrypted plaintext notes.', 'error');
          return;
        }
        
        // Decrypt notes for backup
        const decryptedNotesCache = useVaultStore.getState().decryptedNotes;
        notesToExport = notes.map(note => {
          if (note.isEncrypted) {
            const dec = decryptedNotesCache[note.id];
            return {
              ...note,
              title: dec?.title || note.title,
              content: dec?.content || note.content,
              tags: dec?.tags || note.tags,
              isEncrypted: false,
              encryptedContent: undefined,
              encryptionIv: undefined,
              encryptionSalt: undefined
            };
          }
          return note;
        });
      }

      const backupData = {
        version: 1,
        exportedAt: Date.now(),
        isEncrypted: backupIsEncrypted,
        notes: notesToExport,
        folders,
        tags,
        settings
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const prefix = backupIsEncrypted ? 'secured_backup' : 'plaintext_backup';
      const link = document.createElement('a');
      link.href = url;
      link.download = `markdownnotes_${prefix}_${new Date().toISOString().slice(0, 10)}.markdownnotes`;
      link.click();
      
      showToast(`${backupIsEncrypted ? 'Secure encrypted' : 'Plaintext'} backup archive exported`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export backup', 'error');
    }
  };

  const handleStageRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.notes || !parsed.folders || !parsed.tags) {
          showToast('Invalid backup file structure', 'error');
          return;
        }

        // Analyze conflicts
        const conflictsList: string[] = [];
        for (const note of parsed.notes) {
          const existing = await db.notes.get(note.id);
          if (existing) {
            conflictsList.push(note.title || existing.title || 'Untitled');
          }
        }

        const secureCount = parsed.notes.filter((n: any) => n.isEncrypted).length;

        setRestorePreview({
          notesCount: parsed.notes.length,
          foldersCount: parsed.folders.length,
          secureCount,
          conflictsCount: conflictsList.length,
          conflictsList,
          data: parsed
        });

        showToast('Backup archive analyzed. Review conflicts before restoring.', 'info');
      } catch (err) {
        console.error(err);
        showToast('Failed to parse backup archive', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!restorePreview) return;
    try {
      const data = restorePreview.data;

      // Merge with last-write-wins semantics: importing an older archive must
      // never roll back a note that was edited more recently on this device.
      for (const f of data.folders) {
        const existing = await db.folders.get(f.id);
        if (!existing || (f.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          await db.folders.put(f);
        }
      }
      for (const tg of data.tags) {
        const existing = await db.tags.get(tg.id);
        if (!existing) await db.tags.put(tg);
      }
      let keptNewer = 0;
      for (const nt of data.notes) {
        const existing = await db.notes.get(nt.id);
        if (!existing) {
          await db.notes.put(nt);
        } else if ((nt.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          await db.notes.put(nt);
        } else if ((existing.updatedAt ?? 0) > (nt.updatedAt ?? 0)) {
          keptNewer++;
        }
      }
      if (data.settings) {
        await updateSettings(withoutVaultSettings(data.settings));
      }

      showToast(
        keptNewer > 0
          ? `Merged. Kept ${keptNewer} newer local note${keptNewer === 1 ? '' : 's'}; vault keys unchanged.`
          : 'Backup merged. Vault keys were kept unchanged for safety.',
        'success'
      );
      setRestorePreview(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error(err);
      showToast('Backup restoration failed', 'error');
    }
  };

  const handleFolderImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;

    try {
      const entries = await Promise.all(
        picked
          .filter((file) => /\.(md|markdown|mdown)$/i.test(file.name))
          .map(async (file) => ({
            path: (file as any).webkitRelativePath || file.name,
            content: await file.text()
          }))
      );

      if (entries.length === 0) {
        showToast('No Markdown files found in that folder', 'info');
        return;
      }

      const result = await importMarkdownFolder(entries);
      const duplicates = result.duplicates > 0 ? ` · ${result.duplicates} already imported` : '';
      showToast(
        `Imported ${result.notes} notes into ${result.folders} new folders${duplicates}`,
        'success'
      );
    } catch (error) {
      console.error('Folder import failed', error);
      showToast('Folder import failed', 'error');
    }
  };

  const relativeSyncTime = (timestamp: number | null) => {
    if (!timestamp) return 'not synced yet';
    const minutes = Math.round((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Bundle every note into one ZIP: browsers block chains of downloads.
  const handleDownloadMarkdownFiles = () => {
    const entries: { name: string; content: string }[] = [];
    const usedNames = new Map<string, number>();

    for (const note of notes) {
      if (note.deletedAt) continue;

      let title = note.title || 'Untitled';
      let content = note.content || '';
      let tags = note.tags || [];

      if (note.isEncrypted) {
        const dec = useVaultStore.getState().decryptedNotes[note.id];
        if (!dec) continue; // never write placeholder files for locked notes
        title = dec.title || 'Untitled_Secure_Note';
        content = dec.content || '';
        tags = dec.tags || [];
      }

      const base = sanitizeFileName(title || 'Untitled') || 'untitled';
      const count = (usedNames.get(base) ?? 0) + 1;
      usedNames.set(base, count);
      const fileName = count === 1 ? `${base}.md` : `${base} (${count}).md`;

      entries.push({
        name: fileName,
        content: stringifyFrontmatter(content, {
          title,
          tags,
          created: new Date(note.createdAt).toISOString(),
          updated: new Date(note.updatedAt).toISOString()
        })
      });
    }

    if (entries.length === 0) {
      showToast('No unlocked notes available to export', 'error');
      return;
    }

    const archive = createZip(entries);
    downloadBlob(archive, `markdownnotes_export_${new Date().toISOString().slice(0, 10)}.zip`);
    showToast(`Exported ${entries.length} note(s) as a ZIP archive`, 'success');
  };

  const handleWipeDatabase = async () => {
    if (wipeConfirmText === 'WIPE') {
      try {
        await db.notes.clear();
        await db.noteVersions.clear();
        await db.attachments.clear();
        await db.folders.clear();
        await db.tags.clear();
        await db.settings.clear();
        // Keep a seed marker so the demo library is not recreated on reload.
        await markWorkspaceSeeded();
        showToast('All database content wiped successfully', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        console.error(err);
      }
    } else {
      showToast('Please type WIPE to confirm', 'error');
    }
  };

  // Secure Vault Password Setup Handlers
  const handleSetupVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultPass) {
      showToast('Password cannot be empty', 'error');
      return;
    }
    if (vaultPass !== vaultPassConfirm) {
      showToast('Passwords do not match', 'error');
      return;
    }

    try {
      const success = await setupVault(vaultPass);
      if (success) {
        showToast('Secure Vault initialized successfully!', 'success');
        setVaultPass('');
        setVaultPassConfirm('');
      } else {
        showToast('Initialization failed', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPass || !newPass) {
      showToast('All password fields are required', 'error');
      return;
    }
    if (newPass !== newPassConfirm) {
      showToast('New passwords do not match', 'error');
      return;
    }

    try {
      const success = await changePassword(oldPass, newPass);
      if (success) {
        showToast('Vault password updated successfully', 'success');
        setOldPass('');
        setNewPass('');
        setNewPassConfirm('');
      } else {
        showToast('Incorrect old password', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateRecoveryKey = async () => {
    try {
      const key = await generateRecoveryKey();
      if (key) {
        setRecoveryKeyDisplay(key);
        showToast('Recovery key generated', 'success');
      } else {
        showToast('Failed. Make sure the vault is unlocked first.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadRecoveryKey = () => {
    if (!recoveryKeyDisplay) return;
    const blob = new Blob([
      `MARKDOWN NOTES - SECURE VAULT RECOVERY KEY\n==========================================\n\nGenerated: ${new Date().toISOString()}\n\nRecovery Key: ${recoveryKeyDisplay}\n\nWARNING: Keep this key safe. Do not share it. You can use this recovery key to gain emergency access to your notes if you forget your password.`
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'markdownnotes_recovery_key.txt';
    link.click();
    showToast('Recovery key downloaded as text file', 'success');
  };

  const renderAppearanceSection = () => (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h3 className="text-xs font-bold text-[var(--accent)] dark:text-[var(--accent-dark)] uppercase tracking-wider">Appearance Settings</h3>
        <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 font-semibold">Control the theme and color styles of Markdown Notes</p>
      </div>

      {/* Theme Selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Color Mode</label>
        <p className="text-[10px] text-stone-400 leading-normal">Choose light, dark, or sync with your operating system preferences.</p>
        
        <div className="flex flex-wrap gap-2 mt-1">
          {[
            { id: 'light', label: 'Light Mode' },
            { id: 'dark', label: 'Dark Mode' },
            { id: 'system', label: 'System Defaults' }
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              id={`btn-appearance-theme-${mode.id}`}
              onClick={() => updateSettings({ theme: mode.id as any })}
              className={`px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-all
                ${settings.theme === mode.id 
                  ? 'border-[var(--accent)] dark:border-[var(--accent-dark)] bg-[#F2F3F8] dark:bg-[#222328] text-[var(--accent)] dark:text-[var(--accent-dark)] font-bold' 
                  : 'border-stone-200 dark:border-[#2E3039] text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-900/40'}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent color presets */}
      <div className="flex flex-col gap-1.5 border-t border-stone-100 dark:border-[#2E3039] pt-5">
        <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Accent Color</label>
        <p className="text-[10px] text-stone-400 leading-normal">Choose the highlight color used across buttons, links and focus rings.</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => updateSettings({ accentPreset: preset.id } as any)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-all
                ${settings.accentPreset === preset.id || (!settings.accentPreset && preset.id === 'indigo')
                  ? 'border-[var(--accent)] dark:border-[var(--accent-dark)] bg-[#F2F3F8] dark:bg-[#222328] text-[var(--accent)] dark:text-[var(--accent-dark)] font-bold'
                  : 'border-stone-200 dark:border-[#2E3039] text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-900/40'}`}
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.light }} />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interface Density comfortable / compact */}
      <div className="flex flex-col gap-1.5 border-t border-stone-100 dark:border-[#2E3039] pt-5">
        <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">UI Density</label>
        <p className="text-[10px] text-stone-400 leading-normal font-semibold">Adjust vertical padding to show more or less workspace item list density.</p>
        
        <div className="flex flex-wrap gap-2 mt-1">
          {[
            { id: 'comfortable', label: 'Comfortable' },
            { id: 'compact', label: 'Compact spacing' },
            { id: 'spacious', label: 'Spacious' }
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              id={`btn-appearance-density-${d.id}`}
              onClick={() => updateSettings({ uiDensity: d.id as any })}
              className={`px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-all
                ${settings.uiDensity === d.id 
                  ? 'border-[var(--accent)] dark:border-[var(--accent-dark)] bg-[#F2F3F8] dark:bg-[#222328] text-[var(--accent)] dark:text-[var(--accent-dark)] font-bold' 
                  : 'border-stone-200 dark:border-[#2E3039] text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-900/40'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderEditorSection = () => (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h3 className="text-xs font-bold text-[var(--accent)] dark:text-[var(--accent-dark)] uppercase tracking-wider">Editor Settings</h3>
        <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 font-semibold">Customize font and layouts of the Markdown text canvas</p>
      </div>

      {/* Font Size slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-stone-700 dark:text-stone-300">
          <label>Font Size</label>
          <span className="font-mono text-[11px] text-stone-400">{settings.editorFontSize}px</span>
        </div>
        <input
          type="range"
          id="range-editor-fontsize"
          min="13"
          max="22"
          value={settings.editorFontSize}
          onChange={(e) => updateSettings({ editorFontSize: parseInt(e.target.value) })}
          className="w-full h-1 bg-stone-200 dark:bg-[#2E3039] rounded appearance-none cursor-pointer accent-[var(--accent)] dark:accent-[var(--accent-dark)]"
        />
      </div>

      {/* Line Height selection */}
      <div className="flex flex-col gap-1.5 mt-2">
        <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Line Spacing</label>
        <p className="text-[10px] text-stone-400 leading-normal font-semibold">Alter the vertical space between lines of raw text for legibility.</p>
        
        <div className="flex flex-wrap gap-2 mt-1">
          {['1.4', '1.6', '1.8', '2.0'].map((lh) => (
            <button
              key={lh}
              type="button"
              id={`btn-editor-lh-${lh.replace('.', '-')}`}
              onClick={() => updateSettings({ editorLineHeight: lh })}
              className={`px-3 py-1 rounded border text-xs font-medium cursor-pointer transition-all
                ${settings.editorLineHeight === lh 
                  ? 'border-[var(--accent)] dark:border-[var(--accent-dark)] bg-[#F2F3F8] dark:bg-[#222328] text-[var(--accent)] dark:text-[var(--accent-dark)]' 
                  : 'border-stone-200 dark:border-[#2E3039] text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-900/40'}`}
            >
              {lh}
            </button>
          ))}
        </div>
      </div>

      {/* Word Wrap Toggle */}
      <div className="flex items-center justify-between border-t border-stone-100 dark:border-[#2E3039] pt-5 mt-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Word wrap</label>
          <p className="text-[10px] text-stone-400 leading-normal font-semibold">Wrap lines to prevent horizontal scroll bars.</p>
        </div>
        <button
          type="button"
          id="btn-editor-wrap-toggle"
          onClick={() => updateSettings({ editorWordWrap: !settings.editorWordWrap })}
          className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer
            ${settings.editorWordWrap ? 'bg-[var(--accent)] dark:bg-[var(--accent-dark)]' : 'bg-stone-200 dark:bg-[#222328]'}`}
        >
          <div 
            className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transform transition-transform duration-200
              ${settings.editorWordWrap ? 'translate-x-4.5' : 'translate-x-0'}`}
          />
        </button>
      </div>
    </div>
  );

  const renderStorageSection = () => (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h3 className="text-xs font-bold text-[var(--accent)] dark:text-[var(--accent-dark)] uppercase tracking-wider">Storage & Local Files</h3>
        <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 font-semibold">Inspect database, sync local directories, and run backup processes</p>
      </div>

      {/* Uninstall Warning Guard */}
      <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/30 text-stone-700 dark:text-stone-300 rounded-sm">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400">Uninstall Safety Warning</h4>
          <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed font-medium">
            This workspace operates <strong>offline-first</strong>. All notes live in this device's local database. Uninstalling the app or clearing its storage deletes that database — connect a Markdown folder below (or export a backup) to keep an editable copy outside the app.
          </p>
        </div>
      </div>

      {/* Two-way Markdown folder mirror */}
      <div className="flex flex-col gap-2 border-t border-stone-100 dark:border-[#2E3039] pt-4">
        <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
          <FolderSync className="w-3.5 h-3.5 text-[var(--accent)] dark:text-[var(--accent-dark)]" />
          <span>Markdown Folder Sync</span>
        </label>
        <p className="text-[10px] text-stone-400 leading-relaxed font-semibold">
          Keep a real folder of <span className="font-mono">.md</span> files in two-way sync. Notes are written with their
          folder tree and frontmatter, edits made in another editor come back, and deleted notes remove their file.
          {' '}Secure vault notes are never written to disk.
        </p>

        {syncConnected ? (
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex items-center gap-2.5 rounded-sm border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 truncate">
                  {syncFolderLabel || 'Connected folder'}
                </span>
                <span className="text-[10px] text-stone-400 dark:text-stone-500 font-semibold">
                  {syncStatus === 'syncing' ? 'Syncing…' : `Last sync ${relativeSyncTime(lastSyncAt)} · ${autoSync ? 'auto-sync on' : 'manual'}`}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                id="btn-settings-sync-now"
                onClick={() => void syncNow('manual')}
                disabled={syncStatus === 'syncing'}
                className="px-3.5 py-1.5 bg-[var(--accent)] text-white hover:bg-[#18298B] dark:bg-[var(--accent-dark)] text-xs font-bold rounded-sm cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-60"
              >
                {syncStatus === 'syncing' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{syncStatus === 'syncing' ? 'Syncing…' : 'Sync now'}</span>
              </button>
              <button
                type="button"
                onClick={() => void disconnectSyncFolder()}
                className="px-3 py-1.5 border border-stone-200 dark:border-[#2E3039] text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900/30 text-xs font-semibold rounded-sm cursor-pointer transition-colors"
              >
                Disconnect
              </button>
            </div>

            <label className="flex items-center justify-between gap-3 py-1">
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">Automatic sync</span>
                <span className="text-[10px] text-stone-400 dark:text-stone-500 font-semibold">
                  Mirror changes a couple of seconds after you stop typing.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={autoSync}
                onClick={() => void setAutoSync(!autoSync)}
                className={`w-10 h-5.5 rounded-full p-0.5 shrink-0 transition-colors duration-200 cursor-pointer
                  ${autoSync ? 'bg-[var(--accent)] dark:bg-[var(--accent-dark)]' : 'bg-stone-200 dark:bg-[#222328]'}`}
              >
                <span
                  className={`block w-4.5 h-4.5 rounded-full bg-white shadow-sm transform transition-transform duration-200
                    ${autoSync ? 'translate-x-4.5' : 'translate-x-0'}`}
                />
              </button>
            </label>

            {lastReport && (
              <p className="text-[10px] text-stone-400 dark:text-stone-500 font-semibold leading-relaxed">
                {describeSyncReport(lastReport)}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            <button
              type="button"
              id="btn-settings-connect-folder"
              onClick={() => void connectSyncFolder()}
              className="px-3.5 py-2 bg-[var(--accent)] text-white hover:bg-[#18298B] dark:bg-[var(--accent-dark)] text-xs font-bold rounded-sm cursor-pointer flex items-center justify-center gap-1.5 transition-colors self-start"
            >
              {nativeShell ? <Smartphone className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
              <span>{nativeShell ? 'Use device folder' : 'Choose sync folder'}</span>
            </button>
            <p className="text-[10px] text-stone-400 dark:text-stone-500 font-semibold leading-relaxed">
              {nativeShell
                ? 'Notes are mirrored to Documents/Markdown Notes, where any file manager or folder-sync app can pick them up.'
                : 'Pick any folder on this computer. The browser asks once for read and write access.'}
            </p>
          </div>
        )}

        {syncError && (
          <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold leading-relaxed mt-1">
            {syncError}
          </p>
        )}
      </div>

      {/* Individual note downloads */}
      <div className="flex flex-col gap-1.5 border-t border-stone-100 dark:border-[#2E3039] pt-4">
        <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Download active documents</label>
        <p className="text-[10px] text-stone-400 leading-relaxed font-semibold">
          Trigger a browser file download sequence to download all un-archived documents as individual .md files.
        </p>
        <button
          type="button"
          onClick={handleDownloadMarkdownFiles}
          className="px-3.5 py-1.5 border border-stone-200 dark:border-[#2E3039] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/30 text-xs font-bold rounded-sm cursor-pointer self-start flex items-center gap-1.5 mt-2 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Download All (.md)</span>
        </button>
      </div>

      {/* App version */}
      <div className="flex items-center justify-between border-t border-stone-100 dark:border-[#2E3039] pt-4">
        <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">App version</span>
        <span className="text-xs font-mono text-stone-500 dark:text-stone-400">{__APP_VERSION__}</span>
      </div>

      {/* Core metrics grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 border-t border-stone-100 dark:border-[#2E3039] pt-4">
        {[
          { label: 'Documents', count: activeNotesCount },
          { label: 'Folders', count: folders.length },
          { label: 'Trash Notes', count: trashCount }
        ].map((stat) => (
          <div key={stat.label} className="p-3 rounded-sm border border-stone-100 dark:border-[#2E3039] bg-[#F2F3F8] dark:bg-[#222328] flex flex-col gap-0.5 text-center">
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">{stat.label}</span>
            <span className="text-sm font-serif font-bold text-stone-800 dark:text-stone-100 mt-0.5">{stat.count}</span>
          </div>
        ))}
      </div>

      {/* Export Backup Trigger */}
      <div className="flex flex-col gap-2 mt-2 border-t border-stone-100 dark:border-[#2E3039] pt-5">
        <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Backup Archive (.markdownnotes)</label>
        <p className="text-[10px] text-stone-400 leading-normal font-semibold">Download a complete, serialized JSON archive containing your database variables.</p>
        
        {/* Toggle Encrypted or Unencrypted Backup */}
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => setBackupIsEncrypted(true)}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-sm border transition-all cursor-pointer
              ${backupIsEncrypted 
                ? 'bg-stone-100 dark:bg-[#222328] text-stone-800 dark:text-stone-100 border-stone-200 dark:border-[#2E3039]' 
                : 'text-stone-400 border-transparent'}`}
          >
            Encrypted Backup (Recommended)
          </button>
          <button
            type="button"
            onClick={() => setBackupIsEncrypted(false)}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-sm border transition-all cursor-pointer
              ${!backupIsEncrypted 
                ? 'bg-stone-100 dark:bg-[#222328] text-stone-800 dark:text-stone-100 border-stone-200 dark:border-[#2E3039]' 
                : 'text-stone-400 border-transparent'}`}
          >
            Plaintext Export
          </button>
        </div>

        <div className="flex gap-2.5 mt-2">
          <button
            type="button"
            id="btn-settings-export-backup"
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold text-white bg-[var(--accent)] hover:bg-[#18298B] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Archive</span>
          </button>

          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold border border-stone-200 dark:border-[#2E3039] bg-white dark:bg-[#1A1B1E] text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900/30 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-stone-400" />
            <span>Select Backup to Restore</span>
            <input
              type="file"
              id="input-backup-uploader"
              accept=".markdownnotes"
              onChange={handleStageRestore}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Folder import: Markdown / Obsidian vault */}
      <div className="flex flex-col gap-2 mt-2 border-t border-stone-100 dark:border-[#2E3039] pt-5">
        <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Import Markdown or Obsidian Folder</label>
        <p className="text-[10px] text-stone-400 leading-normal font-semibold">
          Keeps nested folders, frontmatter tags and <span className="font-mono">[[wiki links]]</span>. Hidden folders such as <span className="font-mono">.obsidian</span> and <span className="font-mono">.trash</span> are skipped, and importing the same folder twice adds nothing.
        </p>
        <label className="flex items-center justify-center gap-1.5 px-3 py-2 mt-1 rounded-sm text-xs font-bold border border-dashed border-stone-300 dark:border-[#2E3039] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/30 transition-colors cursor-pointer">
          <Upload className="w-3.5 h-3.5 text-stone-400" />
          <span>Choose Folder…</span>
          <input
            type="file"
            multiple
            onChange={handleFolderImport}
            className="hidden"
            {...({ webkitdirectory: '' } as any)}
          />
        </label>
      </div>

      {/* Restore Preview Block - PREVENT SILENT OVERWRITES */}
      {restorePreview && (
        <div className="border border-[var(--accent)]/30 dark:border-[var(--accent-dark)]/30 bg-[var(--accent)]/5 rounded-sm p-4 mt-2 flex flex-col gap-3.5">
          <div>
            <h4 className="text-xs font-bold text-[var(--accent)] dark:text-[var(--accent-dark)] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--accent)] dark:text-[var(--accent-dark)]" />
              <span>Restore Preview & Conflict Analysis</span>
            </h4>
            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 leading-relaxed font-semibold">
              Review what will be imported into your database. Existing items with conflicting IDs will be overwritten, other items will be merged. Vault keys stored in the archive are ignored so your current vault keeps working.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3.5 text-left bg-white dark:bg-[#1A1B1E] border border-stone-200/50 dark:border-[#2E3039] p-3 rounded-sm">
            <div className="flex flex-col text-xs">
              <span className="text-stone-400 font-bold uppercase text-[9px] tracking-wider">Total Notes</span>
              <span className="text-sm font-serif font-bold text-stone-800 dark:text-stone-100">{restorePreview.notesCount}</span>
            </div>
            <div className="flex flex-col text-xs">
              <span className="text-stone-400 font-bold uppercase text-[9px] tracking-wider">Folders</span>
              <span className="text-sm font-serif font-bold text-stone-800 dark:text-stone-100">{restorePreview.foldersCount}</span>
            </div>
            <div className="flex flex-col text-xs">
              <span className="text-stone-400 font-bold uppercase text-[9px] tracking-wider">Secure Notes</span>
              <span className="text-sm font-serif font-bold text-stone-800 dark:text-stone-100">{restorePreview.secureCount}</span>
            </div>
            <div className="flex flex-col text-xs">
              <span className="text-stone-400 font-bold uppercase text-[9px] tracking-wider">ID Conflicts</span>
              <span className={`text-sm font-bold ${restorePreview.conflictsCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                {restorePreview.conflictsCount} duplicates found
              </span>
            </div>
          </div>

          {restorePreview.conflictsCount > 0 && (
            <div className="flex flex-col gap-1 bg-amber-500/5 p-2 rounded-sm border border-amber-500/20 max-h-24 overflow-y-auto">
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">Conflicting titles to overwrite:</span>
              <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 leading-normal">
                {restorePreview.conflictsList.join(', ')}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleExecuteRestore}
              className="py-2 px-3.5 bg-[var(--accent)] dark:bg-[var(--accent-dark)] text-white text-xs font-bold rounded-sm cursor-pointer hover:opacity-90 transition-all"
            >
              Confirm & Execute Merge
            </button>
            <button
              onClick={() => setRestorePreview(null)}
              className="py-2 px-3 text-stone-500 text-xs font-semibold rounded-sm hover:bg-stone-100 dark:hover:bg-stone-900 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Clear database wipe block */}
      <div className="border border-rose-100 dark:border-rose-950/40 bg-rose-50/10 dark:bg-rose-950/5 rounded-sm p-4 mt-4 flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <h4 className="text-xs font-bold text-rose-800 dark:text-rose-400">Danger Zone</h4>
            <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-normal font-semibold">
              Wiping the workspace deletes all folders, notes, tags, and settings. This is irreversible.
            </p>
          </div>
        </div>

        {!isWipeVerifying ? (
          <button
            type="button"
            id="btn-settings-wipe-verify"
            onClick={() => setIsWipeVerifying(true)}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-sm cursor-pointer self-start transition-colors"
          >
            Wipe Database...
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <input
              type="text"
              id="input-wipe-confirm-text"
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder="Type 'WIPE' to confirm"
              className="px-2.5 py-1 bg-white dark:bg-[#111214] border border-stone-200 dark:border-[#2E3039] text-xs rounded-sm focus:outline-none focus:ring-1 focus:ring-rose-500 text-stone-800 dark:text-stone-100"
            />
            <button
              type="button"
              id="btn-settings-wipe-submit"
              onClick={handleWipeDatabase}
              disabled={wipeConfirmText !== 'WIPE'}
              className="py-1 px-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-sm disabled:opacity-40 cursor-pointer"
            >
              Wipe
            </button>
            <button
              type="button"
              id="btn-settings-wipe-cancel"
              onClick={() => {
                setIsWipeVerifying(false);
                setWipeConfirmText('');
              }}
              className="py-1 px-2 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 text-xs font-medium rounded-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderSecuritySection = () => (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h3 className="text-xs font-bold text-[var(--accent)] dark:text-[var(--accent-dark)] uppercase tracking-wider">Security & Vault</h3>
        <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 font-semibold">Manage client-side AES-256 encrypted storage, passwords, and recovery options</p>
      </div>

      {/* Password Setup Form */}
      {!vaultPasswordExists ? (
        <form onSubmit={handleSetupVault} className="border border-stone-200/60 dark:border-[#2E3039] p-4 rounded-sm flex flex-col gap-3 bg-white dark:bg-[#1A1B1E]">
          <div>
            <h4 className="text-xs font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[var(--accent)] dark:text-[var(--accent-dark)]" />
              <span>Initialize Secure Vault</span>
            </h4>
            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 leading-normal font-semibold">
              Initialize local cryptographic vault. Encryption key is derived strictly inside your browser memory using PBKDF2.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wide">Enter Vault Password</label>
              <input
                type="password"
                value={vaultPass}
                onChange={(e) => setVaultPass(e.target.value)}
                placeholder="Secure Password"
                className="w-full py-1.5 px-3 border border-stone-300 dark:border-[#2E3039] rounded-sm text-xs bg-[#F2F3F8] dark:bg-[#111214] text-stone-800 dark:text-stone-100 outline-none focus:border-[var(--accent)] dark:focus:border-[var(--accent-dark)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wide">Confirm Vault Password</label>
              <input
                type="password"
                value={vaultPassConfirm}
                onChange={(e) => setVaultPassConfirm(e.target.value)}
                placeholder="Confirm Password"
                className="w-full py-1.5 px-3 border border-stone-300 dark:border-[#2E3039] rounded-sm text-xs bg-[#F2F3F8] dark:bg-[#111214] text-stone-800 dark:text-stone-100 outline-none focus:border-[var(--accent)] dark:focus:border-[var(--accent-dark)]"
              />
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 bg-rose-500/5 border border-rose-500/20 text-stone-600 dark:text-stone-400 rounded-sm mt-1">
            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed font-semibold">
              <strong>Warning:</strong> Plaintext keys are never stored. If you lose this password and don't download your Recovery Key, you will lose access to secure documents permanently.
            </p>
          </div>

          <button
            type="submit"
            className="py-2 px-3.5 bg-[var(--accent)] dark:bg-[var(--accent-dark)] text-white text-xs font-bold rounded-sm cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all text-center self-start"
          >
            Create Private Vault
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-5 border border-stone-200/60 dark:border-[#2E3039] p-4 rounded-sm bg-white dark:bg-[#1A1B1E]">
          
          {/* Status Indicator */}
          <div className="flex items-center justify-between pb-3.5 border-b border-stone-100 dark:border-[#2E3039]/50">
            <div className="flex items-center gap-2">
              <Shield className="w-4.5 h-4.5 text-[var(--accent)] dark:text-[var(--accent-dark)]" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-stone-800 dark:text-stone-100">Private Cryptographic Vault</span>
                <span className="text-[10px] text-stone-400 font-semibold">
                  AES-256-GCM · PBKDF2 {((settings.vaultKdfIterations || 100000) / 1000).toFixed(0)}k rounds
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-sm bg-stone-50 dark:bg-[#111214] text-[10px] font-bold border border-stone-200 dark:border-[#2E3039]">
              {isLocked ? (
                <>
                  <Lock className="w-3 h-3 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">Vault Locked</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Vault Unlocked</span>
                </>
              )}
            </div>
          </div>

          {/* Quick Lock/Unlock Controls */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wide">Quick Vault Toggle</label>
            {isLocked ? (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Vault Password"
                  value={unlockPass}
                  onChange={(e) => setUnlockPass(e.target.value)}
                  className="flex-1 py-1.5 px-3 border border-stone-200 dark:border-[#2E3039] rounded-sm text-xs bg-[#F2F3F8] dark:bg-[#111214] text-stone-800 dark:text-stone-100 outline-none"
                />
                <button
                  onClick={async () => {
                    const success = await unlock(unlockPass);
                    if (success) {
                      setUnlockPass('');
                      showToast('Vault successfully unlocked', 'success');
                    } else {
                      showToast('Incorrect vault password', 'error');
                    }
                  }}
                  className="py-1.5 px-4 bg-[var(--accent)] dark:bg-[var(--accent-dark)] text-white font-bold text-xs rounded-sm cursor-pointer hover:opacity-90 transition-all"
                >
                  Unlock
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  lock();
                  showToast('Private Vault instantly locked', 'info');
                }}
                className="py-1.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-sm cursor-pointer self-start transition-colors"
              >
                Lock Vault Now
              </button>
            )}
          </div>          {/* Auto Lock Delay Selector */}
          <div className="flex flex-col gap-1.5 border-t border-stone-100 dark:border-[#2E3039]/40 pt-4">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Auto-Lock Inactivity Delay</label>
            <p className="text-[10px] text-stone-400 leading-normal font-semibold">Automatically lock the vault after a specific period of user inactivity.</p>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {[
                { id: 'immediately', label: 'After 5s idle' },
                { id: '5m', label: '5 Minutes' },
                { id: '15m', label: '15 Minutes' },
                { id: '30m', label: '30 Minutes' },
                { id: '1h', label: '1 Hour' },
                { id: 'never', label: 'Never' }
              ].map((delay) => (
                <button
                  key={delay.id}
                  onClick={() => setAutoLockDelay(delay.id as any)}
                  className={`px-2.5 py-1 text-[10px] font-bold border rounded-sm transition-all cursor-pointer
                    ${autoLockDelay === delay.id 
                      ? 'border-[var(--accent)] dark:border-[var(--accent-dark)] text-[var(--accent)] dark:text-[var(--accent-dark)] bg-[#F2F3F8] dark:bg-[#222328]' 
                      : 'border-stone-200 dark:border-[#2E3039] text-stone-400 dark:text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-900/40'}`}
                >
                  {delay.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hidden Notes Switcher */}
          <div className="flex items-center justify-between border-t border-stone-100 dark:border-[#2E3039]/40 pt-4">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Show Hidden Notes</label>
              <p className="text-[10px] text-stone-400 leading-normal font-semibold">Toggle the global visibility of documents flagged as Hidden.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowHidden(!showHidden)}
              className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer
                ${showHidden ? 'bg-[var(--accent)] dark:bg-[var(--accent-dark)]' : 'bg-stone-200 dark:bg-stone-800'}`}
            >
              <div 
                className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transform transition-transform duration-200
                  ${showHidden ? 'translate-x-4.5' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {/* Change Password Panel */}
          <div className="border-t border-stone-100 dark:border-[#2E3039]/40 pt-4 flex flex-col gap-3">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Change Vault Password</label>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-2.5 max-w-sm">
              <input
                type="password"
                placeholder="Old Password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                className="w-full py-1.5 px-3 border border-stone-200 dark:border-[#2E3039] rounded-sm text-xs bg-[#F2F3F8] dark:bg-[#111214] text-stone-800 dark:text-stone-100 outline-none"
              />
              <input
                type="password"
                placeholder="New Password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="w-full py-1.5 px-3 border border-stone-200 dark:border-[#2E3039] rounded-sm text-xs bg-[#F2F3F8] dark:bg-[#111214] text-stone-800 dark:text-stone-100 outline-none"
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={newPassConfirm}
                onChange={(e) => setNewPassConfirm(e.target.value)}
                className="w-full py-1.5 px-3 border border-stone-200 dark:border-[#2E3039] rounded-sm text-xs bg-[#F2F3F8] dark:bg-[#111214] text-stone-800 dark:text-stone-100 outline-none"
              />
              <button
                type="submit"
                className="py-1.5 px-3 bg-stone-100 hover:bg-stone-200/55 dark:bg-[#111214] dark:hover:bg-[#2A2B30] border border-stone-200 dark:border-[#2E3039] text-stone-700 dark:text-stone-300 text-xs font-bold rounded-sm cursor-pointer self-start transition-all"
              >
                Update Password
              </button>
            </form>
          </div>

          {/* Recovery Key Panel */}
          <div className="border-t border-stone-100 dark:border-[#2E3039]/40 pt-4 flex flex-col gap-3">
            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">Emergency Recovery Key</label>
            <p className="text-[10px] text-stone-400 leading-normal font-semibold">Generate a highly cryptographically strong emergency key. If you forget your vault password, this key acts as a master decoder.</p>
            
            {recoveryKeyDisplay ? (
              <div className="flex flex-col gap-2.5 p-3.5 bg-stone-50 dark:bg-[#0E1013] border border-stone-200 dark:border-[#2E3039] rounded-sm">
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest leading-none">Your Recovery Key (Show Once):</span>
                <span className="text-xs font-mono font-bold break-all select-all text-[var(--accent)] dark:text-[var(--accent-dark)]">
                  {recoveryKeyDisplay}
                </span>
                
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(recoveryKeyDisplay);
                      showToast('Copied to Clipboard!', 'success');
                    }}
                    className="flex items-center gap-1 text-[10px] font-bold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                  <span className="text-stone-300">|</span>
                  <button
                    onClick={handleDownloadRecoveryKey}
                    className="flex items-center gap-1 text-[10px] font-bold text-stone-500 hover:text-[var(--accent)] dark:hover:text-[var(--accent-dark)] transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download TXT</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerateRecoveryKey}
                className="py-1.5 px-3 bg-[var(--accent)] dark:bg-[var(--accent-dark)] text-white text-xs font-bold rounded-sm cursor-pointer self-start transition-colors"
              >
                Generate Emergency Key
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );

  const renderShortcutsSection = () => (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h3 className="text-xs font-bold text-[var(--accent)] dark:text-[var(--accent-dark)] uppercase tracking-wider">Keyboard Shortcuts</h3>
        <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 font-semibold">Boost your productivity using keyboard commands</p>
      </div>

      <div className="border border-stone-200 dark:border-[#2E3039] rounded-sm overflow-hidden">
        <table className="min-w-full border-collapse text-xs text-stone-700 dark:text-stone-300">
          <thead className="bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-[#2E3039]">
            <tr>
              <th className="p-2.5 font-bold text-stone-800 dark:text-stone-200 text-left">Action</th>
              <th className="p-2.5 font-bold text-stone-800 dark:text-stone-200 text-right">Keybind</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-[#2E3039]/40">
            {[
              { act: 'Create Document', key: 'Ctrl + N' },
              { act: 'Search / Command Menu', key: 'Ctrl + K' },
              { act: 'Save Document', key: 'Ctrl + S' },
              { act: 'Toggle Sidebar Panels', key: 'Ctrl + Shift + S' },
              { act: 'Toggle Focus Mode', key: 'Ctrl + Shift + F' },
              { act: 'Toggle Zen Workspace', key: 'Ctrl + Shift + Z' },
              { act: 'Toggle Formatting Toolbar', key: 'Ctrl + /' },
              { act: 'Exit Zen Mode', key: 'Escape' }
            ].map((shortcut) => (
              <tr key={shortcut.act} className="hover:bg-stone-50/50 dark:hover:bg-stone-900/10 transition-colors">
                <td className="p-2.5 font-medium">{shortcut.act}</td>
                <td className="p-2.5 font-bold text-stone-400 dark:text-stone-500 font-mono text-[10px] text-right">
                  {shortcut.key}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex-1 h-full flex flex-col overflow-hidden bg-white dark:bg-[#1A1B1E] select-none text-stone-800 dark:text-stone-200 animate-fade-in">
        {/* Mobile Settings Header */}
        <div className="px-5 py-4 border-b border-stone-100 dark:border-[#2E3039] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {mobileSection !== 'menu' && (
              <button 
                type="button" 
                onClick={() => setMobileSection('menu')}
                className="p-1 -ml-1 mr-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Settings className="w-4 h-4 text-[var(--accent)] dark:text-[var(--accent-dark)]" />
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {mobileSection === 'menu' ? 'Preferences' : 
               mobileSection === 'appearance' ? 'Appearance' :
               mobileSection === 'editor' ? 'Editor Settings' :
               mobileSection === 'storage' ? 'Files & Storage' : 
               mobileSection === 'security' ? 'Security & Vault' : 'Keybinds'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setActiveNoteId(null)}
            className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Settings Body */}
        <div className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
          {mobileSection === 'menu' ? (
            <div className="flex flex-col p-4 gap-1">
              {/* Sync is the one setting people come back to, so it gets a card. */}
              <div className="mb-3 rounded-xl border border-stone-200/70 dark:border-[#2E3039] bg-[#F7F8FC] dark:bg-[#222328] p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        syncStatus === 'syncing'
                          ? 'bg-amber-500 animate-pulse'
                          : syncConnected
                            ? 'bg-emerald-500'
                            : 'bg-stone-400'
                      }`}
                    />
                    <span className="text-[11px] font-bold text-stone-700 dark:text-stone-200 truncate">
                      {syncConnected ? 'Markdown folder sync' : 'Folder sync is off'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('storage');
                      setMobileSection('storage');
                    }}
                    className="text-[10px] font-bold text-[var(--accent)] dark:text-[var(--accent-dark)] shrink-0"
                  >
                    Manage
                  </button>
                </div>
                <span className="text-[10px] text-stone-400 dark:text-stone-500 font-semibold leading-relaxed">
                  {syncConnected
                    ? `${syncFolderLabel || 'Folder'} · ${syncStatus === 'syncing' ? 'syncing…' : `last sync ${relativeSyncTime(lastSyncAt)}`}`
                    : 'Mirror every note to a real folder of .md files.'}
                </span>
                <button
                  type="button"
                  onClick={() => (syncConnected ? void syncNow('manual') : void connectSyncFolder())}
                  disabled={syncStatus === 'syncing'}
                  className="self-start px-3 py-1.5 rounded-lg bg-[var(--accent)] dark:bg-[var(--accent-dark)] text-white dark:text-[#111214] text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-60"
                >
                  {syncStatus === 'syncing' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  <span>{syncConnected ? 'Sync now' : 'Connect a folder'}</span>
                </button>
              </div>

              {[
                { id: 'appearance', label: 'Appearance', icon: Settings },
                { id: 'editor', label: 'Editor Settings', icon: Keyboard },
                { id: 'storage', label: 'Files & Storage', icon: HardDrive },
                { id: 'security', label: 'Security & Vault', icon: Shield },
                { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: HelpCircle }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setMobileSection(tab.id as any);
                  }}
                  className="w-full h-12 px-3 rounded flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors cursor-pointer text-left text-stone-700 dark:text-stone-300 border-b border-stone-50 dark:border-[#2E3039]/40"
                >
                  <div className="flex items-center gap-3">
                    <tab.icon className="w-4.5 h-4.5 text-stone-400" />
                    <span className="text-xs font-semibold">{tab.label}</span>
                  </div>
                  <ChevronRight className="w-4.5 h-4.5 text-stone-400" />
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6">
              <div className="max-w-md flex flex-col gap-6">
                {activeTab === 'appearance' && renderAppearanceSection()}
                {activeTab === 'editor' && renderEditorSection()}
                {activeTab === 'storage' && renderStorageSection()}
                {activeTab === 'security' && renderSecuritySection()}
                {activeTab === 'shortcuts' && renderShortcutsSection()}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-white dark:bg-[#1A1B1E] select-none text-stone-800 dark:text-stone-200 animate-fade-in">
      
      {/* Settings Panel Header */}
      <div className="px-6 py-4 border-b border-stone-100 dark:border-[#2E3039] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <Settings className="w-4 h-4 text-[var(--accent)] dark:text-[var(--accent-dark)]" />
          <div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">Preferences</h2>
            <p className="text-[10px] text-stone-400 dark:text-stone-500 font-semibold mt-0.5">Customize your writing space and secure vault</p>
          </div>
        </div>
        
        {/* Close Button */}
        <button
          type="button"
          id="btn-settings-close"
          onClick={() => setActiveNoteId(null)}
          className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Preferences Body layout splitting sidebar and content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Section Navigation Tabs List (Left Column) */}
        <div className="w-48 bg-[#F2F3F8] dark:bg-[#0E1013] border-e border-stone-100 dark:border-[#2E3039] p-4 flex flex-col gap-1 shrink-0">
          {[
            { id: 'appearance', label: 'Appearance', icon: Settings },
            { id: 'editor', label: 'Editor Settings', icon: Keyboard },
            { id: 'storage', label: 'Files & Storage', icon: HardDrive },
            { id: 'security', label: 'Security & Vault', icon: Shield },
            { id: 'shortcuts', label: 'Keybinds', icon: HelpCircle }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              id={`btn-settings-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full py-1.5 px-2.5 rounded-sm text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors text-left
                ${activeTab === tab.id 
                  ? 'bg-[#D1D4DC] dark:bg-[#222328] text-stone-950 dark:text-stone-100 font-bold shadow-sm' 
                  : 'text-stone-500 dark:text-stone-400 hover:bg-stone-200/50 dark:hover:bg-stone-800/30'}`}
            >
              <tab.icon className="w-3.5 h-3.5 shrink-0 text-stone-400" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Properties Fields Pane (Right Column) */}
        <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-[#1A1B1E]">
          <div className="max-w-md flex flex-col gap-8">
            {activeTab === 'appearance' && renderAppearanceSection()}
            {activeTab === 'editor' && renderEditorSection()}
            {activeTab === 'storage' && renderStorageSection()}
            {activeTab === 'security' && renderSecuritySection()}
            {activeTab === 'shortcuts' && renderShortcutsSection()}
          </div>
        </div>
      </div>

    </div>
  );
}
