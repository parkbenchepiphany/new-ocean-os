import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SearchHit } from "../types";

interface Props {
  onOpenResult: (hit: SearchHit) => void;
  onClose: () => void;
}

// qmd reports files as qmd://vault/07-AI-Memory/..., with directory names
// slugified; only the basename reliably matches a real vault file.
export function hitBasename(hit: SearchHit): string {
  const last = hit.file.split("/").pop() ?? hit.file;
  return last.replace(/\.md$/, "");
}

export default function SearchPalette({ onOpenResult, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const [searching, setSearching] = useState(false);
  const [deepSearching, setDeepSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestQuery = useRef("");

  function deepSearch() {
    const q = query.trim();
    if (!q || deepSearching) return;
    setDeepSearching(true);
    setError(null);
    invoke<SearchHit[]>("search_vault", { query: q, semantic: true })
      .then((results) => {
        if (latestQuery.current !== query) return;
        setHits(results);
        setSelected(0);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setDeepSearching(false));
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    latestQuery.current = query;
    if (!query.trim()) {
      setHits([]);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      invoke<SearchHit[]>("search_vault", { query })
        .then((results) => {
          if (latestQuery.current !== query) return;
          setHits(results);
          setSelected(0);
          setError(null);
        })
        .catch((e) => {
          if (latestQuery.current !== query) return;
          setError(String(e));
        })
        .finally(() => {
          if (latestQuery.current === query) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      deepSearch();
    } else if (e.key === "Enter" && hits[selected]) {
      onOpenResult(hits[selected]);
    }
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search the vault…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {error && <div className="palette-status palette-error">{error}</div>}
        {!error && deepSearching && (
          <div className="palette-status">Semantic search… (this takes ~20s while the model loads)</div>
        )}
        {!error && !deepSearching && searching && <div className="palette-status">Searching…</div>}
        {!error && !searching && !deepSearching && query.trim() && hits.length === 0 && (
          <div className="palette-status">No results</div>
        )}
        <div className="palette-results">
          {hits.map((hit, i) => (
            <div
              key={hit.docid}
              className={`palette-hit ${i === selected ? "selected" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => onOpenResult(hit)}
            >
              <div className="palette-hit-top">
                <span className="palette-hit-title">{hit.title || hitBasename(hit)}</span>
                <span className="palette-hit-score">{hit.score.toFixed(2)}</span>
              </div>
              <div className="palette-hit-file">{hitBasename(hit)}</div>
              {hit.snippet && (
                <div className="palette-hit-snippet">
                  {hit.snippet.replace(/^@@[^\n]*\n?/, "").slice(0, 200)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="palette-footer">
          ↑↓ navigate · Enter open · Ctrl+Enter semantic search · Esc close
        </div>
      </div>
    </div>
  );
}
