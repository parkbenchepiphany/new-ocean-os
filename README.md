# New Ocean OS

A local-first desktop OS that sits on top of an Obsidian vault: rich note viewing, pinned webpages rendered natively in the main pane, and (soon) semantic search, dashboards, and finance tooling. The vault's markdown files stay canonical, so Obsidian and any agents working against the vault keep functioning untouched.

Part of the [New Ocean](https://theoegginton.substack.com) build-in-public series.

## Stack

- **Shell:** Tauri v2 (Rust core, system webview)
- **Frontend:** React + TypeScript + Vite
- **Notes:** rendered from plain markdown on disk; no proprietary format, ever
- **Web bookmarks:** sandboxed native child webviews, no filesystem or IPC access
- **Search (M2):** [qmd](https://github.com/tobi/qmd) sidecar over the vault index

## Setup

1. Install the [Tauri prerequisites](https://tauri.app/start/prerequisites/) (Rust, and on Windows the VS Build Tools C++ workload).
2. `npm install`
3. Copy `new-ocean.config.example.json` to `new-ocean.config.json` and set your vault path and bookmarks. This file is untracked; personal config never enters the repo.
4. `npm run tauri dev`

## Roadmap

- [x] **M0, Shell:** sidebar with vault tree, tabbed main pane, native web bookmarks
- [ ] **M1, Editor:** TipTap rich editing with strict markdown round-trip, wikilink navigation
- [ ] **M2, Search:** global keyword + semantic search over the vault
- [ ] **M3, Surfaces:** briefing dashboard and workspace views
- [ ] **M4, Finance:** business units, ledger, invoice generation (SQLite, outside the vault)
- [ ] **M5, Agent panel:** embedded agent surface

## Security posture

- No secrets in the repo or the vault; credentials live in local untracked config only.
- Bookmark webviews are isolated: no Tauri IPC capability, no filesystem bridge.
- Note reads are locked to the configured vault root (canonicalised path checks).
