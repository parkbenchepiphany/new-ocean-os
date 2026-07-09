import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Config, RecentFile } from "../types";

interface Props {
  config: Config;
  onOpenNote: (path: string, name: string) => void;
}

interface PipelineRow {
  cells: string[];
  active: boolean;
}

interface Pipeline {
  headers: string[];
  rows: PipelineRow[];
  closedCount: number;
}

const CLOSED_RE = /rejected|closed|lapsed/i;

function stripInlineMd(cell: string): string {
  return cell
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

function parsePipeline(md: string, heading: string): Pipeline | null {
  const sectionRe = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const start = md.search(sectionRe);
  if (start === -1) return null;
  const rest = md.slice(start);
  const end = rest.slice(3).search(/^##\s/m);
  const section = end === -1 ? rest : rest.slice(0, end + 3);

  const lines = section.split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
  if (lines.length < 3) return null;
  const parseRow = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => stripInlineMd(c));
  const headers = parseRow(lines[0]);
  const stageIdx = headers.findIndex((h) => /stage|status/i.test(h));
  const rows: PipelineRow[] = lines.slice(2).map((line) => {
    const cells = parseRow(line);
    const stage = stageIdx >= 0 ? cells[stageIdx] ?? "" : cells.join(" ");
    return { cells, active: !CLOSED_RE.test(stage) };
  });
  return {
    headers,
    rows: rows.filter((r) => r.active),
    closedCount: rows.filter((r) => !r.active).length,
  };
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function HomeView({ config, onOpenNote }: Props) {
  const home = config.home ?? {};
  const [pipelineMd, setPipelineMd] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentFile[]>([]);

  useEffect(() => {
    if (home.pipelineNote) {
      invoke<string>("read_note", { vaultPath: config.vaultPath, relPath: home.pipelineNote })
        .then(setPipelineMd)
        .catch(console.error);
    }
    if (home.activityDirs?.length) {
      invoke<RecentFile[]>("recent_files", {
        vaultPath: config.vaultPath,
        dirs: home.activityDirs,
        limit: home.activityLimit ?? 12,
      })
        .then(setRecent)
        .catch(console.error);
    }
    // config is loaded once at boot; re-run only if it were reloaded
  }, [config]);

  const pipeline = useMemo(
    () => (pipelineMd ? parsePipeline(pipelineMd, home.pipelineHeading ?? "Pipeline") : null),
    [pipelineMd, home.pipelineHeading]
  );

  const pipelineCols = useMemo(() => {
    if (!pipeline) return [];
    const wanted = [/role/i, /company/i, /stage|status/i, /next|trigger/i];
    return wanted
      .map((re) => pipeline.headers.findIndex((h) => re.test(h)))
      .filter((i) => i >= 0);
  }, [pipeline]);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const pipelineName = home.pipelineNote?.split("/").pop()?.replace(/\.md$/, "") ?? "";

  return (
    <div className="home">
      <header className="home-header">
        <h1>Today</h1>
        <span className="home-date">{today}</span>
      </header>

      <div className="home-grid">
        {home.pipelineNote && (
          <section className="home-card home-card-wide">
            <div
              className="home-card-title clickable"
              onClick={() => onOpenNote(home.pipelineNote!, pipelineName)}
            >
              <h2>Pipeline</h2>
              <span className="home-card-sub">
                {pipeline
                  ? `${pipeline.rows.length} active · ${pipeline.closedCount} closed`
                  : "loading…"}
              </span>
            </div>
            {pipeline && (
              <table className="home-table">
                <thead>
                  <tr>
                    {pipelineCols.map((i) => (
                      <th key={i}>{pipeline.headers[i]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pipeline.rows.map((row, ri) => (
                    <tr key={ri}>
                      {pipelineCols.map((i) => (
                        <td key={i}>{row.cells[i] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {pipelineMd && !pipeline && (
              <p className="home-card-empty">
                No table found under "{home.pipelineHeading ?? "Pipeline"}".
              </p>
            )}
          </section>
        )}

        <section className="home-card">
          <div className="home-card-title">
            <h2>Agent activity</h2>
            <span className="home-card-sub">latest across the vault</span>
          </div>
          {recent.length === 0 && <p className="home-card-empty">No recent files.</p>}
          <ul className="home-feed">
            {recent.map((f) => (
              <li key={f.path} onClick={() => onOpenNote(f.path, f.name)}>
                <span className="feed-dir">{f.dir}</span>
                <span className="feed-name">{f.name}</span>
                <span className="feed-time">{relativeTime(f.modifiedMs)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
