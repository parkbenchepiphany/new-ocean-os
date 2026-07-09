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

For search, [qmd](https://github.com/tobi/qmd) must be installed and on your PATH with your vault indexed as a collection.

To run it as a desktop app rather than in dev mode: `npm run tauri build -- --no-bundle`, then create a shortcut to `src-tauri/target/release/new-ocean-os.exe` with "Start in" set to the repo root (config discovery walks up from the working directory).

## Keyboard

- `Ctrl+K` global vault search
- `Ctrl+E` toggle edit / preview on the open note
- `Ctrl+S` save while editing

## Roadmap

- [x] **M0, Shell:** sidebar with vault tree, tabbed main pane, native web bookmarks
- [ ] **M1, Editor:** TipTap rich editing with strict markdown round-trip, wikilink navigation (raw markdown edit + save shipped as a stepping stone)
- [x] **M2, Search:** global keyword search over the vault via qmd (semantic layer still to come)
- [ ] **M3, Surfaces:** briefing dashboard and workspace views
- [ ] **M4, Finance:** business units, ledger, invoice generation (SQLite, outside the vault)
- [ ] **M5, Agent panel:** embedded agent surface

## Security posture

- No secrets in the repo or the vault; credentials live in local untracked config only.
- Bookmark webviews are isolated: no Tauri IPC capability, no filesystem bridge.
- Note reads and writes are locked to the configured vault root (canonicalised path checks); writes touch existing `.md` files only.
- Search shells out to the local qmd index; nothing leaves the machine.
