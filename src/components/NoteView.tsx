import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface Props {
  vaultPath: string;
  relPath: string;
  onOpenWikilink: (target: string) => void;
}

function stripFrontmatter(md: string): { body: string; frontmatter: string | null } {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: md, frontmatter: null };
  return { body: md.slice(match[0].length), frontmatter: match[1] };
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEditing(false);
    invoke<string>("read_note", { vaultPath, relPath })
      .then((content) => {
        if (cancelled) return;
        setRaw(content);
        setDraft(content);
        setError(null);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [vaultPath, relPath]);

  const rendered = useMemo(() => {
    if (raw === null) return { html: "", frontmatter: null as string | null };
    const { body, frontmatter } = stripFrontmatter(raw);
    const html = DOMPurify.sanitize(
      marked.parse(wikilinksToAnchors(body), { async: false }) as string
    );
    return { html, frontmatter };
  }, [raw]);

  const dirty = editing && draft !== raw;

  function save() {
    if (!dirty || saving) return;
    setSaving(true);
    invoke("write_note", { vaultPath, relPath, content: draft })
      .then(() => {
        setRaw(draft);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setSaving(false));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "e") {
        e.preventDefault();
        setEditing((v) => !v);
      } else if (key === "s" && editing) {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (error && raw === null) return <div className="note-error">{error}</div>;

  return (
    <div className="note-view-wrap">
      <div className="note-toolbar">
        <span className="note-toolbar-status">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : ""}
        </span>
        {error && <span className="note-toolbar-error">{error}</span>}
        {editing && (
          <button className="note-toolbar-btn" disabled={!dirty || saving} onClick={save}>
            Save (Ctrl+S)
          </button>
        )}
        <button className="note-toolbar-btn" onClick={() => setEditing((v) => !v)}>
          {editing ? "Preview (Ctrl+E)" : "Edit (Ctrl+E)"}
        </button>
      </div>
      {editing ? (
        <textarea
          className="note-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
      ) : (
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
          {rendered.frontmatter && (
            <details className="note-properties">
              <summary>Properties</summary>
              <pre>{rendered.frontmatter}</pre>
            </details>
          )}
          <article className="note-body" dangerouslySetInnerHTML={{ __html: rendered.html }} />
        </div>
      )}
    </div>
  );
}
