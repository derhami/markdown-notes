# Markdown Notes - AI Agent Instructions & Guidelines

This file serves as the core source of truth for the **Markdown Notes** architecture, design system, and technical guidelines. All modifications and future implementations must align with the decisions outlined below.

---

## 1. Core Architectural Strategy
* **Three-Zone Workspace Layout**:
  * **Zone 1: Navigation Rail**: Compact vertical toolbar (56px) for switching categories (All, Favorites, Folders, Trash) and launching Preferences.
  * **Zone 2: Document Browser**: Collapsible middle column (280px) for note selection, tags, searching, and simple list navigation.
  * **Zone 3: Writing Canvas**: A spacious, distraction-free writing panel optimizing vertical text focus.
* **Local-First & Offline-First**: All data is stored in the browser's IndexedDB via `Dexie.js`. No backend server or cloud requests are authorized.
* **Markdown-Native**: The primary data format is standard GitHub Flavored Markdown (GFM).
* **Focused English UI with RTL Document Support**: The application UI is entirely in English to maintain a distraction-free, elegant layout. However, the editor canvas automatically detects and formats RTL (Persian/Arabic) script values for seamless bilingual writing.

---

## 2. Database Schema (IndexedDB with Dexie)
We define the local database structure inside `src/db/database.ts`:

### Notes Table:
* `id`: UUID (string)
* `title`: Title (string, fallback to "Untitled" or extracted from first H1)
* `content`: Markdown raw string (string)
* `folderId`: Folder ID reference or `null` for root (string, indexed)
* `tags`: Array of tag names or IDs (array of strings, indexed)
* `isFavorite`: Favorite status (boolean/number, indexed)
* `isPinned`: Pin status (boolean/number, indexed)
* `createdAt`: Timestamp (number)
* `updatedAt`: Timestamp (number)
* `wordCount`: Word count (number)
* `characterCount`: Character count (number)
* `readingTime`: Estimated reading time in minutes (number)

### Folders Table:
* `id`: UUID (string)
* `name`: Folder name (string)
* `parentId`: Parent Folder ID reference or `null` for top-level (string, indexed)
* `createdAt`: Timestamp (number)
* `updatedAt`: Timestamp (number)

### Tags Table:
* `id`: UUID (string)
* `name`: Tag name (string)
* `color`: Hex or Tailwind class color (string)
* `createdAt`: Timestamp (number)

### Settings Table:
* `id`: "current" (singleton, string)
* `theme`: "light" | "dark" | "system"
* `language`: "en"
* `editorFontSize`: number (default: 15)
* `editorLineHeight`: string (default: "1.6")
* `editorWordWrap`: boolean (default: true)
* `autoSaveInterval`: number (default: 500) // ms
* `sidebarOpen`: boolean (default: true)
* `noteListWidth`: number (default: 280)
* `editorMode`: "editor" | "split" | "preview"
* `accentColor`: string (default: "#3E5A80")
* `uiDensity`: "comfortable" | "compact"

---

## 3. Design Tokens & Visual Hierarchy
* **Color System**:
  * **Light Theme**:
    * Background: `#FAF9F6` (Elegant Warm White / Alabaster)
    * Surface: `#FFFFFF`
    * Elevated Surface: `#F4F3EF`
    * Border: `#E5E4DF`
    * Primary Accent: `#3E5A80` (Muted Slate Blue)
  * **Dark Theme**:
    * Background: `#0D0E11` (Sophisticated deep space charcoal)
    * Surface: `#141519`
    * Elevated Surface: `#1C1D24`
    * Border: `#20222B`
    * Primary Accent: `#5A89C7` (Muted Steel Blue)
* **Geometry**:
  * Crisp, sharp corners for all interactive states and modal containers. Avoid extreme rounded cards (maximum boundary `rounded` i.e. 4px-6px).
* **Typography**:
  * Headings: Elegant serif typography (Lora / Playfair Display) for an editorial feel.
  * Body & UI Font: System-wide clean sans-serif (Inter/system-ui).
  * Line height: UI is `1.4` - `1.5`, Editor is customizable (default `1.6` - `1.7`) for maximum readability.
  * Markdown Reading Width: Constrained to `max-w-[720px]` in editor and preview modes for optimal reading lines.

---

## 4. Feature Implementation Guidelines
1. **Auto-save with Debounce**: Trigger saves to IndexedDB dynamically on content changes with a `500ms` debounce. Show auto-save indicators ("Saving...", "Saved", "Offline") subtly in the editor's toolbar.
2. **Command Palette**: Support `Ctrl + K` (or `Cmd + K`) to toggle a unified search & execution command list.
3. **Markdown Preview**: Render headings, paragraphs, strong/em, checkboxes, lists, tables, blockquotes, code blocks with syntax highlighting, and custom interactive checkbox triggers (changing check state in Preview edits the raw Markdown).
4. **Trash system**: "Delete" actions should move notes to a virtual Trash bin. Notes in Trash can be "Restored" or "Permanently Deleted".
5. **Backup & Restore**: Export a single `.markdownnotes` file (JSON structure containing notes, folders, tags, settings) and restore it completely.
6. **Centered Empty Desk State**: When no document is selected, render a distraction-free typing desk that highlights elegant serif headings, direct quick actions, and a "Resume Writing" list of recent documents.

---

## 5. Coding Conventions
* **TypeScript Quality**: Strictly define interfaces for all data structures in `src/types.ts`.
* **State Management**: Use Zustand stores (`src/stores/`) to hold active UI state, but synchronize updates back to the IndexedDB using the repositories.
* **Separation of Concerns**: UI components should never talk directly to IndexedDB. They must use Zustand actions or repository services.
* **Logical Spacing**: Use CSS logical properties (`mx-`, `my-`, `ps-`, `pe-` in custom styles, or standard Tailwind utility directions) to support LTR & RTL layouts seamlessly.

---

## 6. Responsive & Adaptive Product Design (Device-Aware UX)
We implement specialized device interaction models depending on the current viewport width:

### 1. Mobile Viewports (under 768px):
* **Focused Writing Mode**: The workspace defaults to a single-view focus. Persistent sidebars/lists are completely hidden, allowing full horizontal workspace utilization.
* **Header & Back Stack**: The header adapts to include a Back button. Clicking it sets `activeNoteId` back to `null`, taking the user back to the note list view.
* **Responsive Bottom Navigation Rail**: Replaces the desktop vertical rail with a clean bottom tab bar (Notes, Search, Folders, Settings), providing comfortable touch targets.
* **Mobile Formatting Bar**: Rendered as a bottom-pinned, horizontally scrollable toolbar, situated right above the keyboard using `visualViewport` height offsets.
* **Menu-Driven Preferences**: The multi-tab desktop Settings page is transformed into a stacked menu list flow with 12px height items and Chevron-guided navigators to prevent layout squeezing.

### 2. Tablet Viewports (768px - 1024px):
* **Flexible Dual-Column Workspace**: Renders the middle-column NoteList side-by-side with the editor, while collapsing the leftmost Navigation Rail.
* **Compact Sidebar Toggle**: A dedicated hamburger trigger is exposed to seamlessly overlay or pin the folders sidebar list.
* **Adaptive Panels**: Squeezing panels triggers automatic transition to single split-screen mode or full preview to maximize writing area.

### 3. Desktop Viewports (over 1024px):
* **Complete Three-Zone Workspace**: Simultaneously displays the Navigation Rail, the NoteList (adjustable via drag handles), and the Markdown writing canvas.
* **Comfortable Text Boundaries**: Constrains the reading/writing track to a standard serif/sans metric (`max-w-[720px]`) centered on screen to promote typing endurance.
