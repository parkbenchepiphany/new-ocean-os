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

- `Ctrl+K` global vault search, `Ctrl+Enter` inside it for semantic deep search
- `Ctrl+E` toggle edit / preview on the open note
- `Ctrl+S` save while editing

## Home dashboard

The app boots onto a Today screen driven by the optional `home` config block: a pipeline card parsed live from any hub note's markdown table, and an activity feed of the newest files across configured folders (agent logs, summaries, inbox).

## Editing and the round-trip gate

Rich editing (TipTap) only activates on a note if parsing and immediately re-serializing it reproduces the file exactly; otherwise the raw markdown editor opens instead. Nothing the rich editor cannot represent losslessly can ever be saved through it. Wikilinks (`[[Target]]`, `[[Target|Alias]]`) round-trip via a custom node. A save-time reparse check (`safeMarkdown`) diverts any ambiguous edit to the raw editor rather than risking a byte it can't reproduce.

Getting real-world notes through that gate meant fixing six ways stock prosemirror-markdown silently mangles bytes: prose over-escaping, tight-list flattening, list-indent rewriting, emphasis delimiter swaps (`_` vs `*`), soft-break loss, and mailto autolink expansion. A permanent test harness runs the gate against 40 real vault notes on every `npm test` (skipped without local config); 31/40 pass, and the remaining gates are by design (tables, encoding-damaged logs, irregular lazy indents).

## Roadmap

- [x] **M0, Shell:** sidebar with vault tree, tabbed main pane, native web bookmarks
- [~] **M1, Editor:** TipTap rich editing behind a strict round-trip gate (shipped); custom serializer escape rules opened the gate from 0/40 to 31/40 real vault notes (78%); table support next
- [x] **M2, Search:** global keyword search plus explicit semantic deep search via qmd
- [~] **M3, Surfaces:** Home/Today dashboard shipped; briefing cards and workspace views next
- [ ] **M4, Finance:** business units, ledger, invoice generation (SQLite, outside the vault)
- [ ] **M5, Agent panel:** embedded agent surface

## Security posture

- No secrets in the repo or the vault; credentials live in local untracked config only.
- Bookmark webviews are isolated: no Tauri IPC capability, no filesystem bridge.
- Note reads and writes are locked to the configured vault root (canonicalised path checks); writes touch existing `.md` files only.
- Search shells out to the local qmd index; nothing leaves the machine.
