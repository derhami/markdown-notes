<div align="center">
  <img width="96" height="96" alt="Markdown Notes icon" src="public/pwa-192x192.png" />
  <h1>Markdown Notes</h1>
  <p>A local-first, offline-friendly Markdown writing workspace.</p>
</div>

## Overview

Markdown Notes is a professional, distraction-free Markdown editor that runs entirely in your browser. All data lives locally in your device's IndexedDB — there is no backend, no cloud, no account. Write in peace, read in elegance.

- **Local-first & offline-first**: Your notes never leave your device (Dexie.js / IndexedDB).
- **Markdown-native**: Full GitHub Flavored Markdown (GFM) with live preview.
- **Focused English UI with RTL document support**: The editor auto-detects and formats Persian/Arabic script for seamless bilingual writing.
- **PWA + Android**: Installable as a Progressive Web App, and ships as a native Android APK via Capacitor.
- **Vault**: Optional password/recovery-key encryption for your notes (AES-256-GCM).

## Features

- Three-zone workspace: navigation rail, collapsible document browser, distraction-free writing canvas
- Notes, folders, favorites, tags, pinning, search, and a command palette (`Ctrl+K`)
- Auto-save with debounce and save-status indicator
- Markdown preview with syntax highlighting and interactive checklists
- Trash with restore and permanent delete
- `.markdownnotes` backup / restore
- Centered "empty desk" dashboard with resume-writing list
- Light & dark themes, adjustable editor typography, accent color
- Responsive: bottom navigation on mobile, dual-pane on tablet, full three-zone on desktop

## Getting Started

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Web Deployment

The app is deployed to GitHub Pages at **https://md.nounproject.ir**.

Deploy steps (documented for reference):

```bash
git push origin master
gh api repos/derhami/<repo>/pages \
  -X PUT -f cname=md.nounproject.ir -f "source[branch]=master" -f "source[path]=/"
```

## Android APK (Capacitor)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Markdown Notes" ir.nounproject.mdnotes --web-dir=dist
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Architecture

| Layer        | Technology                          |
| ------------ | ----------------------------------- |
| UI           | React 19, Zustand, Tailwind CSS 4   |
| Storage      | IndexedDB via Dexie.js              |
| Markdown     | react-markdown, remark-gfm          |
| Encryption   | Web Crypto API (AES-256-GCM)        |
| PWA          | vite-plugin-pwa / Workbox          |
| Native       | Capacitor (Android)                 |

Key source areas:

- `src/db/database.ts` — Dexie schema (notes, folders, tags, settings)
- `src/stores/` — Zustand stores (settings, vault, toasts, actions)
- `src/utils/crypto.ts` — vault key-wrapping (AES-256-GCM master key)
- `src/components/` — UI components
- `public/` — PWA icons and manifest assets