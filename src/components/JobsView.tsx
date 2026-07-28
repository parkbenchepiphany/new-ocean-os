import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Config } from "../types";
import { buildFitPrompt, buildIntakeDraft, parseFitResult, type FitResult } from "../apply/fit";

interface Props {
  config: Config;
}

type Status = "idle" | "scoring" | "done" | "error";

const VERDICT_LABELS: Record<FitResult["verdict"], string> = {
  apply: "Apply",
  maybe: "Maybe",
  "network-first": "Network first",
  skip: "Skip",
};

export default function JobsView({ config }: Props) {
  const targetingFile = config.applyEngine?.targetingFile;
  const [jd, setJd] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<FitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function score() {
    if (!targetingFile || !jd.trim() || status === "scoring") return;
    setStatus("scoring");
    setResult(null);
    setError(null);
    setRaw(null);
    setCopied(false);
    try {
      const targeting = await invoke<string>("read_note", {
        vaultPath: config.vaultPath,
        relPath: targetingFile,
      });
      const response = await invoke<string>("run_claude", {
        prompt: buildFitPrompt(targeting, jd),
      });
      setRaw(response);
      setResult(parseFitResult(response));
      setStatus("done");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  async function copyIntakeDraft() {
    if (!result) return;
    const isoDate = new Date().toISOString().slice(0, 10);
    await navigator.clipboard.writeText(buildIntakeDraft(result, isoDate));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!targetingFile) {
    return (
      <div className="jobs">
        <header className="home-header">
          <h1>Apply Engine</h1>
        </header>
        <p className="home-card-empty">
          Set <code>applyEngine.targetingFile</code> in your config to a targeting YAML inside the
          vault to enable fit scoring. See the example config.
        </p>
      </div>
    );
  }

  return (
    <div className="jobs">
      <header className="home-header">
        <h1>Apply Engine</h1>
        <span className="home-date">intake &amp; fit scoring</span>
      </header>

      <section className="home-card jobs-intake">
        <div className="home-card-title">
          <h2>Role intake</h2>
          <span className="home-card-sub">paste a job description, get a verdict against your targeting profile</span>
        </div>
        <textarea
          className="jobs-jd"
          placeholder="Paste the full job description here, including title, company, location and salary if shown…"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          spellCheck={false}
        />
        <div className="jobs-actions">
          <button
            className="note-toolbar-btn jobs-score-btn"
            onClick={score}
            disabled={!jd.trim() || status === "scoring"}
          >
            {status === "scoring" ? "Scoring…" : "Score fit"}
          </button>
          {status === "scoring" && (
            <span className="home-card-sub">running the fit model, this can take up to a minute</span>
          )}
        </div>
      </section>

      {status === "error" && (
        <section className="home-card jobs-result">
          <div className="home-card-title">
            <h2>Scoring failed</h2>
          </div>
          <p className="note-toolbar-error">{error}</p>
          {raw && <pre className="jobs-raw">{raw}</pre>}
        </section>
      )}

      {result && (
        <section className="home-card jobs-result">
          <div className="home-card-title">
            <h2>{result.role.title ?? "Untitled role"}</h2>
            <span className="home-card-sub">{result.role.company ?? "company unknown"}</span>
            <span className={`verdict verdict-${result.verdict}`}>{VERDICT_LABELS[result.verdict]}</span>
          </div>

          <dl className="jobs-record">
            {result.laneId && (
              <>
                <dt>Lane</dt>
                <dd>{result.laneId}</dd>
              </>
            )}
            {result.role.location && (
              <>
                <dt>Location</dt>
                <dd>
                  {result.role.location}
                  {result.role.workMode ? `, ${result.role.workMode}` : ""}
                </dd>
              </>
            )}
            {result.role.compensation && (
              <>
                <dt>Compensation</dt>
                <dd>{result.role.compensation}</dd>
              </>
            )}
            {result.role.source && (
              <>
                <dt>Source</dt>
                <dd>{result.role.source}</dd>
              </>
            )}
            {result.flags.length > 0 && (
              <>
                <dt>Flags</dt>
                <dd>{result.flags.join(", ")}</dd>
              </>
            )}
          </dl>

          <p className="jobs-explanation">{result.explanation}</p>

          {result.gaps.length > 0 && (
            <div className="jobs-list-block">
              <h3>Honest gaps</h3>
              <ul>
                {result.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {result.unknowns.length > 0 && (
            <div className="jobs-list-block">
              <h3>Unknowns to resolve</h3>
              <ul>
                {result.unknowns.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="jobs-actions">
            <button className="note-toolbar-btn" onClick={copyIntakeDraft}>
              {copied ? "Copied" : "Copy intake note draft"}
            </button>
            <span className="home-card-sub">
              engine read only; the human read and any application remain yours
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
