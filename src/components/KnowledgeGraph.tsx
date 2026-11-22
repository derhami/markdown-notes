/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { X, Network } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useVaultStore } from '../stores/useVaultStore';
import { extractWikiLinks } from '../utils/links';
import { normalizeText } from '../utils/notesHelper';

interface KnowledgeGraphProps {
  open: boolean;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
}

export default function KnowledgeGraph({ open, onClose, onOpenNote }: KnowledgeGraphProps) {
  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? [];
  const { decryptedNotes, isLocked } = useVaultStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const documents = useMemo(() => {
    return notes
      .filter((n) => !n.deletedAt)
      .map((n) => ({
        id: n.id,
        title: n.isEncrypted ? (decryptedNotes[n.id]?.title || 'Locked Note') : (n.title || 'Untitled'),
        content: n.isEncrypted ? (decryptedNotes[n.id]?.content || '') : (n.content || '')
      }));
  }, [notes, decryptedNotes]);

  const titleToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of documents) map.set(normalizeText(d.title).toLowerCase(), d.id);
    return map;
  }, [documents]);

  const edges = useMemo(() => {
    const out: { from: string; to: string }[] = [];
    for (const d of documents) {
      for (const link of extractWikiLinks(d.content)) {
        const target = titleToId.get(normalizeText(link).toLowerCase());
        if (target && target !== d.id) {
          out.push({ from: d.id, to: target });
        }
      }
    }
    // de-dupe
    const seen = new Set<string>();
    return out.filter((e) => {
      const key = `${e.from}->${e.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [documents, titleToId]);

  if (!open) return null;

  const size = 520;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 40;
  const positions = new Map<string, { x: number; y: number }>();
  documents.forEach((d, idx) => {
    const angle = (idx / Math.max(1, documents.length)) * Math.PI * 2;
    positions.set(d.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Knowledge graph"
    >
      <div
        className="w-full md:max-w-2xl max-h-[90vh] bg-white dark:bg-[#1A1B1E] border border-[#D1D4DC] dark:border-[#2E3039] rounded-md shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D1D4DC]/60 dark:border-[#2E3039] shrink-0">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-[var(--accent)] dark:text-[var(--accent-dark)]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-600 dark:text-stone-300">
              Knowledge Graph
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close graph" className="p-2 -me-2 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 p-4 overflow-auto">
          {documents.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-8">No notes yet.</p>
          ) : (
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
              {edges.map((e, idx) => {
                const a = positions.get(e.from)!;
                const b = positions.get(e.to)!;
                return (
                  <line
                    key={idx}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="currentColor"
                    strokeOpacity={0.25}
                    strokeWidth={1}
                    className="text-stone-400"
                  />
                );
              })}
              {documents.map((d) => {
                const p = positions.get(d.id)!;
                const isSelected = selectedId === d.id;
                return (
                  <g
                    key={d.id}
                    transform={`translate(${p.x},${p.y})`}
                    onClick={() => setSelectedId(d.id)}
                    onDoubleClick={() => { onOpenNote(d.id); onClose(); }}
                    className="cursor-pointer"
                  >
                    <circle
                      r={isSelected ? 8 : 5}
                      className={isSelected ? 'fill-[var(--accent)]' : 'fill-stone-500 dark:fill-stone-300'}
                    />
                    <text
                      x={0}
                      y={-10}
                      textAnchor="middle"
                      className="text-[9px] fill-stone-600 dark:fill-stone-300"
                      style={{ pointerEvents: 'none' }}
                    >
                      {d.title.length > 16 ? d.title.slice(0, 16) + '…' : d.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          {selectedId && (
            <p className="text-[10px] text-stone-400 text-center mt-2">
              Double-click a node to open that note.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}