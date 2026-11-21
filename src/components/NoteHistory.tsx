/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { listNoteVersions, readNoteVersion, type VersionSnapshot } from '../utils/versions';
import { useVaultStore } from '../stores/useVaultStore';
import { useToastStore } from '../stores/useToastStore';
import type { NoteVersion } from '../types';

interface NoteHistoryProps {
  noteId: string;
  isEncrypted: boolean;
  onClose: () => void;
  onRestore: (snapshot: VersionSnapshot) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function NoteHistory({ noteId, isEncrypted, onClose, onRestore }: NoteHistoryProps) {
  const { derivedKey } = useVaultStore();
  const { showToast } = useToastStore();
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<VersionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listNoteVersions(noteId);
        if (cancelled) return;
        setVersions(list);
        if (list[0]) setSelectedId(list[0].id);
      } catch (error) {
        console.error('Failed to load history', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    let cancelled = false;
    const selected = versions.find((version) => version.id === selectedId);
    if (!selected) {
      setPreview(null);
      return;
    }
    (async () => {
      const snapshot = await readNoteVersion(selected, isEncrypted ? derivedKey : null);
      if (cancelled) return;
      if (!snapshot) {
        setPreview(null);
        showToast('Unlock the vault to read this snapshot', 'error');
        return;
      }
      setPreview(snapshot);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, versions, isEncrypted, derivedKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-xs select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Note history"
    >
      <div
        className="w-full md:max-w-2xl max-h-[88vh] md:max-h-[80vh] bg-white dark:bg-[#1A1B1E] border border-[#D1D4DC] dark:border-[#2E3039] rounded-t-2xl md:rounded-md shadow-2xl flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D1D4DC]/60 dark:border-[#2E3039] shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#1D2EA0] dark:text-[#A3B5F5]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-600 dark:text-stone-300">
              Version History
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="p-2 -me-2 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid md:grid-cols-[220px_1fr]">
          <div className="md:border-e border-[#D1D4DC]/60 dark:border-[#2E3039] overflow-y-auto max-h-[28vh] md:max-h-none border-b md:border-b-0">
            {loading ? (
              <p className="p-4 text-[11px] text-stone-400">Loading snapshots…</p>
            ) : versions.length === 0 ? (
              <p className="p-4 text-[11px] leading-relaxed text-stone-400">
                No snapshots yet. History is captured automatically a few moments after you start writing.
              </p>
            ) : (
              versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setSelectedId(version.id)}
                  className={`w-full text-start px-4 py-2.5 border-b border-stone-100 dark:border-stone-800/60 transition-colors cursor-pointer
                    ${selectedId === version.id
                      ? 'bg-[#F2F3F8] dark:bg-[#222328] text-[#1D2EA0] dark:text-[#A3B5F5]'
                      : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/40'}`}
                >
                  <span className="block text-[11px] font-semibold">{formatTime(version.createdAt)}</span>
                  <span className="block text-[10px] text-stone-400 mt-0.5">
                    {version.wordCount} words
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="overflow-y-auto p-4 md:p-5 min-h-[140px]">
            {preview ? (
              <>
                <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-2">
                  {preview.title || 'Untitled'}
                </p>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-stone-700 dark:text-stone-300">
                  {preview.content.slice(0, 4000)}
                  {preview.content.length > 4000 ? '…' : ''}
                </pre>
              </>
            ) : (
              <p className="text-[11px] text-stone-400">Select a snapshot to preview it.</p>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[#D1D4DC]/60 dark:border-[#2E3039] flex items-center justify-between gap-3 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
          <p className="text-[10px] text-stone-400 leading-snug">
            Saved on this device only.
          </p>
          <button
            type="button"
            disabled={!preview}
            onClick={() => {
              if (!preview) return;
              onRestore(preview);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#1D2EA0] text-white text-[11px] font-semibold disabled:opacity-40 hover:bg-[#18267f] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore this version
          </button>
        </div>
      </div>
    </div>
  );
}
