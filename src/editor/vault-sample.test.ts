// @vitest-environment jsdom
// Round-trips a deterministic sample of REAL vault notes through the rich
// editor and measures the pass rate of the byte-identical gate. Requires
// new-ocean.config.json (gitignored) pointing at a vault; skips cleanly
// when absent so CI and fresh clones are unaffected.
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import fs from "node:fs";
import path from "node:path";
import {
  editorExtensions,
  editorParseOptions,
  getMarkdown,
  normalizeMd,
} from "../components/RichEditor";
import { splitFrontmatter } from "./frontmatter";

const SAMPLE_SIZE = Number(process.env.VAULT_SAMPLE_SIZE ?? 40);
const REQUIRED_PASS_RATE = Number(process.env.VAULT_SAMPLE_THRESHOLD ?? 0.6);
const IGNORED_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);

function findVaultPath(): string | null {
  const configPath = path.resolve(process.cwd(), "new-ocean.config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (typeof config.vaultPath === "string" && fs.existsSync(config.vaultPath)) {
      return config.vaultPath;
    }
  } catch {
    // fall through
  }
  return null;
}

function listMarkdownFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".md")) {
        out.push(path.join(dir, entry.name));
      }
    }
  };
  walk(root);
  return out.sort();
}

function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

function firstDiffLine(a: string, b: string): string {
  const al = a.split("\n");
  const bl = b.split("\n");
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) {
      return `line ${i + 1}:\n  original:   ${JSON.stringify(al[i] ?? "<none>")}\n  serialized: ${JSON.stringify(bl[i] ?? "<none>")}`;
    }
  }
  return "(no line diff found; whitespace-only difference)";
}

const vaultPath = findVaultPath();

describe.skipIf(!vaultPath)("real vault sample round-trip", () => {
  it(`>= ${REQUIRED_PASS_RATE * 100}% of ${SAMPLE_SIZE} sampled notes pass the gate`, () => {
    const files = sampleEvenly(listMarkdownFiles(vaultPath!), SAMPLE_SIZE);
    const failures: { file: string; diff: string }[] = [];
    let passed = 0;

    for (const file of files) {
      const { body } = splitFrontmatter(fs.readFileSync(file, "utf-8"));
      if (!body.trim()) {
        passed++; // empty body trivially round-trips
        continue;
      }
      const editor = new Editor({
        element: document.createElement("div"),
        extensions: editorExtensions,
        content: body,
        parseOptions: editorParseOptions,
      });
      const out = getMarkdown(editor as never);
      editor.destroy();
      if (normalizeMd(out) === normalizeMd(body)) {
        passed++;
      } else {
        failures.push({
          file: path.relative(vaultPath!, file),
          diff: firstDiffLine(normalizeMd(body), normalizeMd(out)),
        });
      }
    }

    const rate = passed / files.length;
    console.log(`\nvault sample: ${passed}/${files.length} pass (${Math.round(rate * 100)}%)`);
    for (const f of failures.slice(0, 15)) {
      console.log(`\nFAIL ${f.file}\n${f.diff}`);
    }
    if (failures.length > 15) console.log(`\n...and ${failures.length - 15} more failures`);

    expect(rate, `pass rate ${Math.round(rate * 100)}% below target`).toBeGreaterThanOrEqual(
      REQUIRED_PASS_RATE
    );
  });
});
