import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Bookmark, Config, SearchHit, Tab, TreeNode } from "./types";
import Sidebar from "./components/Sidebar";
import NoteView from "./components/NoteView";
import HomeView from "./components/HomeView";
import JobsView from "./components/JobsView";
import WebPane from "./components/WebPane";
import SearchPalette, { hitBasename } from "./components/SearchPalette";
import "./App.css";

function indexNotes(nodes: TreeNode[], map: Map<string, { path: string; name: string }>) {
  for (const node of nodes) {
    if (node.isDir) {
      indexNotes(node.children, map);
    } else {
      const key = node.name.toLowerCase();
      if (!map.has(key)) map.set(key, { path: node.path, name: node.name });
    }
  }
  return map;
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    invoke<Config>("load_config")
      .then((cfg) => {
        setConfig(cfg);
        setTabs((prev) =>
          prev.some((t) => t.id === "home") ? prev : [{ id: "home", kind: "home", title: "Home" }, ...prev]
        );
        setActiveTabId((id) => id ?? "home");
        return invoke<TreeNode[]>("list_vault_tree", { vaultPath: cfg.vaultPath });
      })
      .then(setTree)
      .catch((e) => setError(String(e)));
  }, []);

  const noteIndex = useMemo(() => indexNotes(tree, new Map()), [tree]);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  function activate(tab: Tab) {
    setTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
  }

  function openNote(path: string, name: string) {
    activate({ id: `note:${path}`, kind: "note", title: name, path });
  }

  function openBookmark(bm: Bookmark) {
    activate({ id: `bm:${bm.id}`, kind: "bookmark", title: bm.label, url: bm.url });
  }

  function openHome() {
    activate({ id: "home", kind: "home", title: "Home" });
  }

  function openJobs() {
    activate({ id: "jobs", kind: "jobs", title: "Apply Engine" });
  }

  function openWikilink(target: string) {
    const hit = noteIndex.get(target.toLowerCase());
    if (hit) openNote(hit.path, hit.name);
  }

  function openSearchResult(hit: SearchHit) {
    const note = noteIndex.get(hitBasename(hit).toLowerCase());
    if (note) {
      openNote(note.path, note.name);
      setSearchOpen(false);
    }
  }

  function closeTab(tab: Tab) {
    if (tab.kind === "bookmark") {
      invoke("close_bookmark", { id: tab.id.slice(3) }).catch(console.error);
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tab.id);
      if (activeTabId === tab.id) {
        setActiveTabId(next.length ? next[next.length - 1].id : null);
      }
      return next;
    });
  }

  if (error) {
    return (
      <div className="app-error">
        <h2>New Ocean OS could not start</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        bookmarks={config?.bookmarks ?? []}
        tree={tree}
        activePath={activeTab?.kind === "note" ? activeTab.path : undefined}
        onOpenNote={openNote}
        onOpenBookmark={openBookmark}
        onOpenHome={openHome}
        onOpenJobs={openJobs}
      />
      <main className="main">
        <div className="tab-bar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeTabId ? "active" : ""}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="tab-kind">{tab.kind === "note" ? "✎" : "◍"}</span>
              <span className="tab-title">{tab.title}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="content">
          {!activeTab && (
            <div className="empty-state">
              <span className="empty-mark">◍</span>
              <h1>New Ocean OS</h1>
              <p>Open a note from the vault or a pinned page from the sidebar.</p>
            </div>
          )}
          {activeTab?.kind === "home" && config && (
            <HomeView config={config} onOpenNote={openNote} />
          )}
          {activeTab?.kind === "jobs" && config && <JobsView config={config} />}
          {activeTab?.kind === "note" && config && (
            <NoteView
              key={activeTab.id}
              vaultPath={config.vaultPath}
              relPath={activeTab.path}
              onOpenWikilink={openWikilink}
            />
          )}
          {activeTab?.kind === "bookmark" && (
            <WebPane
              key={activeTab.id}
              id={activeTab.id.slice(3)}
              url={activeTab.url}
              suspended={searchOpen}
            />
          )}
        </div>
      </main>
      {searchOpen && (
        <SearchPalette onOpenResult={openSearchResult} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  );
}
