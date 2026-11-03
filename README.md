# Smart File Organizer

Scans your Downloads folder, suggests where each file belongs, and moves files only after you approve. Every move can be undone. Nothing is deleted, overwritten, or uploaded.

## Run it (Windows 10/11)

```
npm install
npm run dev      # development, hot reload
npm run build && npm start   # production build
npm test         # Vitest
```

Needs Node 22.13+ (the app uses Electron 37, whose Node has built-in `node:sqlite`, so there is no native module to compile).

## How it works

- **Scan** reads names, sizes and dates only. Files touched in the last 5 seconds and `.crdownload`/`.part`/`.tmp` files are skipped as still downloading. Only files that share a size with another file are hashed (SHA-256) to find duplicates.
- **Classify** by extension and filename (`invoice_2026.pdf` goes to Documents/Invoices). Confidence below 60% lands in the review queue, unchecked.
- **Preview** shows every proposed move. You can change a category, skip a file, or resolve a name conflict (keep both, or choose another category). Conflicts are never pre-selected.
- **Move** uses a hard link then removes the original, so an existing file can never be replaced. Each move is written to the database before it happens, and an interrupted run is settled on the next launch.
- **Undo** restores files to where they came from, and refuses if something else now occupies the original path.

## Layout

```
electron/        main process, preload (whitelisted IPC), IPC handlers
src/services/    classifier, scanner, organizer (all unit tested, no Electron imports)
src/database/    SQLite schema and helpers
src/pages/       Dashboard, FileExplorer, SmartOrganize, History, Settings
tests/           Vitest
```

## Not in this version (per the PRD's post-MVP list)

AI categorization, natural language search, background monitoring, multi-folder organizing, and Playwright end-to-end tests.

## Known shortcuts

- `categories.extensions` is an extra column (the PRD's data model has nowhere to keep a custom category's extensions). `mime_type` exists but stays empty.
- Archives are filed as projects by filename keywords only (`react-dashboard.zip`), not by looking inside.
- Drives without hard links (exFAT) fall back to check-then-rename, which has a tiny race.
