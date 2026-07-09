import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Editor } from "@tiptap/react";
import RichEditor, { getMarkdown, normalizeMd } from "./RichEditor";

interface Props {
  vaultPath: string;
  relPath: string;
  onOpenWikilink: (target: string) => void;
}

type Mode = "preview" | "rich" | "raw";

function splitFrontmatter(md: string): { body: string; frontmatter: string | null; fmBlock: string } {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: md, frontmatter: null, fmBlock: "" };
  return { body: md.slice(match[0].length), frontmatter: match[1], fmBlock: match[0] };
}

function wikilinksToAnchors(md: string): string {
  return md.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
    const label = (alias ?? target).trim();
    const safeTarget = String(target).trim().replace(/"/g, "&quot;");
    return `<a href="#" data-wikilink="${safeTarget}">${label}</a>`;
  });
}

export default function NoteView({ vaultPath, relPath, onOpenWikilink }: Props) {
  const [raw, setRaw] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("preview");
  const [richDirty, setRichDirty] = useState(false);
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMode("preview");
    setGateNotice(null);
    invoke<string>("read_note", { vaultPath, relPath })
      .then((content) => {
        if (cancelled) return;
        setRaw(content);
        setDraft(content);
        setRichDirty(false);
        setError(null);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [vaultPath, relPath]);

  const parts = useMemo(() => (raw === null ? null : splitFrontmatter(raw)), [raw]);

  const rendered = useMemo(() => {
    if (!parts) return "";
    return DOMPurify.sanitize(
      marked.parse(wikilinksToAnchors(parts.body), { async: false }) as string
    );
  }, [parts]);

  const dirty = mode === "raw" ? draft !== raw : mode === "rich" ? richDirty : false;

  function persist(content: string) {
    setSaving(true);
    invoke("write_note", { vaultPath, relPath, content })
      .then(() => {
        setRaw(content);
        setDraft(content);
        setRichDirty(false);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setSaving(false));
  }

  function save() {
    if (!dirty || saving || !parts) return;
    if (mode === "raw") {
      persist(draft);
    } else if (mode === "rich" && editorRef.current) {
      const body = getMarkdown(editorRef.current);
      persist(parts.fmBlock + body.trimEnd() + "\n");
    }
  }

  function enterEdit() {
    // try rich first; RichEditor's round-trip gate demotes to raw if the note
    // doesn't serialize back identically (tables, embeds, unusual syntax)
    setGateNotice(null);
    setMode("rich");
  }

  function exitEdit() {
    editorRef.current = null;
    setRichDirty(false);
    setDraft(raw ?? "");
    setGateNotice(null);
    setMode("preview");
  }

  function onEditorReady(editor: Editor, roundTripOk: boolean) {
    if (roundTripOk) {
      editorRef.current = editor;
    } else {
      setGateNotice("Rich editing unavailable: this note doesn't round-trip losslessly yet. Raw editor opened instead.");
      setMode("raw");
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "e") {
        e.preventDefault();
        if (mode === "preview") enterEdit();
        else exitEdit();
      } else if (key === "s" && mode !== "preview") {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (error && raw === null) return <div className="note-error">{error}</div>;
  if (!parts) return null;

  return (
    <div className="note-view-wrap">
      <div className="note-toolbar">
        <span className="note-toolbar-status">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : gateNotice ?? ""}
        </span>
        {error && <span className="note-toolbar-error">{error}</span>}
        {mode === "rich" && (
          <button
            className="note-toolbar-btn"
            onClick={() => {
              setDraft(
                editorRef.current && richDirty
                  ? parts.fmBlock + getMarkdown(editorRef.current).trimEnd() + "\n"
                  : raw ?? ""
              );
              editorRef.current = null;
              setMode("raw");
            }}
          >
            Raw
          </button>
        )}
        {mode !== "preview" && (
          <button className="note-toolbar-btn" disabled={!dirty || saving} onClick={save}>
            Save (Ctrl+S)
          </button>
        )}
        <button
          className="note-toolbar-btn"
          onClick={() => (mode === "preview" ? enterEdit() : exitEdit())}
        >
          {mode === "preview" ? "Edit (Ctrl+E)" : "Preview (Ctrl+E)"}
        </button>
      </div>

      {mode === "rich" && (
        <div className="rich-editor-wrap">
          {parts.frontmatter && (
            <details className="note-properties">
              <summary>Properties</summary>
              <pre>{parts.frontmatter}</pre>
            </details>
          )}
          <RichEditor
            body={parts.body}
            onReady={onEditorReady}
            onDirty={() => setRichDirty(true)}
          />
        </div>
      )}

      {mode === "raw" && (
        <textarea
          className="note-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
      )}

      {mode === "preview" && (
        <div
          className="note-view"
          onClick={(e) => {
            const link = (e.target as HTMLElement).closest("a[data-wikilink]");
            if (link) {
              e.preventDefault();
              onOpenWikilink(link.getAttribute("data-wikilink")!);
            }
          }}
        >
          {parts.frontmatter && (
            <details className="note-properties">
              <summary>Properties</summary>
              <pre>{parts.frontmatter}</pre>
            </details>
          )}
          <article className="note-body" dangerouslySetInnerHTML={{ __html: rendered }} />
        </div>
      )}
    </div>
  );
}

export { normalizeMd };
