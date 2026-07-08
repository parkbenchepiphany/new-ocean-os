import { useEffect, useState } from "react";
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
  const [html, setHtml] = useState<string>("");
  const [frontmatter, setFrontmatter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<string>("read_note", { vaultPath, relPath })
      .then((raw) => {
        if (cancelled) return;
        const { body, frontmatter } = stripFrontmatter(raw);
        const rendered = marked.parse(wikilinksToAnchors(body), { async: false }) as string;
        setHtml(DOMPurify.sanitize(rendered));
        setFrontmatter(frontmatter);
        setError(null);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [vaultPath, relPath]);

  if (error) return <div className="note-error">{error}</div>;

  return (
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
      {frontmatter && (
        <details className="note-properties">
          <summary>Properties</summary>
          <pre>{frontmatter}</pre>
        </details>
      )}
      <article className="note-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
