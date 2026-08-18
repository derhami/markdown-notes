/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder as FolderIcon, Plus, Edit2, Trash2, FolderPlus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import type { Folder } from '../types';

interface FolderNodeProps {
  folder: Folder;
  level: number;
  allFolders: Folder[];
  activeCategoryId: string | null;
  onSelect: (id: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (id: string) => void;
  onAddSubfolder: (parentId: string) => void;
}

function FolderNode({
  folder,
  level,
  allFolders,
  activeCategoryId,
  onSelect,
  onRename,
  onDelete,
  onAddSubfolder
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const childFolders = allFolders.filter((f) => f.parentId === folder.id);
  const isSelected = activeCategoryId === folder.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <div className="select-none">
      <div
        id={`folder-node-${folder.id}`}
        onClick={() => onSelect(folder.id)}
        className={`group flex items-center justify-between py-1 px-2 rounded transition-colors cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-800/60
          ${isSelected 
            ? 'bg-[#E8E9EE] dark:bg-[#222328] text-stone-900 dark:text-stone-100 font-medium' 
            : 'text-stone-600 dark:text-stone-400'}`}
        style={{
          paddingInlineStart: `${Math.max(8, level * 12)}px`
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Collapse/Expand Toggle */}
          <button
            type="button"
            id={`btn-folder-toggle-${folder.id}`}
            onClick={handleToggle}
            className={`p-0.5 rounded hover:bg-stone-200/50 dark:hover:bg-stone-700/50 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors cursor-pointer
              ${childFolders.length === 0 ? 'opacity-20 pointer-events-none' : ''}`}
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          
          <FolderIcon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#1D2EA0] dark:text-[#A3B5F5]' : 'text-stone-400'}`} />
          <span className="truncate text-xs font-medium tracking-tight">{folder.name}</span>
        </div>

        {/* Quiet operational controls visible on hover */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
          <button
            type="button"
            id={`btn-folder-addsub-${folder.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onAddSubfolder(folder.id);
            }}
            title="Add Subfolder"
            className="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-400 dark:text-stone-500 hover:text-stone-600 cursor-pointer"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
          <button
            type="button"
            id={`btn-folder-rename-${folder.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onRename(folder);
            }}
            title="Rename Folder"
            className="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-400 dark:text-stone-500 hover:text-stone-600 cursor-pointer"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            id={`btn-folder-del-${folder.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(folder.id);
            }}
            title="Delete Folder"
            className="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-400 dark:text-stone-500 hover:text-rose-500 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {expanded && childFolders.length > 0 && (
        <div className="flex flex-col mt-0.5 border-s border-stone-100 dark:border-stone-800/40 ml-3.5 pl-0.5">
          {childFolders.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              level={level + 1}
              allFolders={allFolders}
              activeCategoryId={activeCategoryId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onAddSubfolder={onAddSubfolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FolderTreeProps {
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (id: string) => void;
  onCreateSubfolder: (parentId: string) => void;
}

export default function FolderTree({ onRenameFolder, onDeleteFolder, onCreateSubfolder }: FolderTreeProps) {
  const folders = useLiveQuery(() => db.folders.toArray()) || [];
  const { activeCategory, setActiveCategory } = useWorkspaceStore();
  
  const activeFolderId = activeCategory.startsWith('folder:') 
    ? activeCategory.substring(7) 
    : null;

  const handleSelectFolder = (id: string) => {
    setActiveCategory(`folder:${id}`);
  };

  const topLevelFolders = folders.filter((f) => !f.parentId);

  if (folders.length === 0) {
    return (
      <div className="text-center py-5 text-stone-400 text-xs italic">
        No folders created yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {topLevelFolders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          level={0}
          allFolders={folders}
          activeCategoryId={activeFolderId}
          onSelect={handleSelectFolder}
          onRename={onRenameFolder}
          onDelete={onDeleteFolder}
          onAddSubfolder={onCreateSubfolder}
        />
      ))}
    </div>
  );
}
