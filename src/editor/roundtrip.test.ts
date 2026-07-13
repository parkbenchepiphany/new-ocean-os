// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import {
  editorExtensions,
  editorParseOptions,
  getMarkdown,
  normalizeMd,
} from "../components/RichEditor";

function roundTrip(body: string): { ok: boolean; out: string } {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: editorExtensions,
    content: body,
    parseOptions: editorParseOptions,
  });
  const out = getMarkdown(editor);
  editor.destroy();
  return { ok: normalizeMd(out) === normalizeMd(body), out };
}

describe("rich editor markdown round-trip gate", () => {
  it("passes a typical vault note", () => {
    const body = [
      "# Session summary",
      "",
      "Some intro text with **bold** and *italic* and `code`.",
      "",
      "## What happened",
      "",
      "- First thing",
      "- Second thing with a [link](https://example.com)",
      "- Third thing",
      "",
      "> A quote for good measure.",
    ].join("\n");
    const r = roundTrip(body);
    expect(r.out).toBeTruthy();
    expect(r.ok, `serialized:\n${r.out}`).toBe(true);
  });

  it("passes wikilinks, plain and aliased", () => {
    const body = [
      "Linked to [[Job Search Hub]] and [[2026-07-03_90-day-campaign-review|the campaign review]].",
      "",
      "- [[AGENTS.md]] carries the rules",
    ].join("\n");
    const r = roundTrip(body);
    expect(r.ok, `serialized:\n${r.out}`).toBe(true);
  });

  it("fails (gates to raw) on markdown tables", () => {
    const body = [
      "## Pipeline",
      "",
      "| Role | Company |",
      "|---|---|",
      "| MD | CNS Media |",
    ].join("\n");
    expect(roundTrip(body).ok).toBe(false);
  });

  it("passes numbered lists and 2-space nested lists", () => {
    const body = [
      "1. First",
      "2. Second",
      "",
      "- Parent",
      "  - Child",
      "  - Child two",
    ].join("\n");
    const r = roundTrip(body);
    expect(r.ok, `serialized:\n${r.out}`).toBe(true);
  });

  it("passes 4-space nested lists (source indent preserved)", () => {
    const body = ["- Parent", "    - Child"].join("\n");
    const r = roundTrip(body);
    expect(r.ok, `serialized:\n${r.out}`).toBe(true);
  });

  it("passes tight heading-list adjacency and indented top-level lists", () => {
    const body = [
      "## Calendar invitees",
      "- greg@chillhop.com (internal)",
      "",
      "### Topics",
      "  - [linked item](https://example.com)",
      "      - deeper item",
    ].join("\n");
    const r = roundTrip(body);
    expect(r.ok, `serialized:\n${r.out}`).toBe(true);
  });

  it("passes soft-wrapped paragraphs and underscore emphasis", () => {
    const body = [
      "**Bold lead**",
      "Continuation on the next line with _underscore em_ kept.",
      "",
      "Text with literal chars: 5 < 10, ~approx, a_b_c.",
    ].join("\n");
    const r = roundTrip(body);
    expect(r.ok, `serialized:\n${r.out}`).toBe(true);
  });

  it("gate result is deterministic for headings with trailing spaces", () => {
    const body = "# Title  \n\nBody text.";
    // normalizeMd trims line ends, so this should still pass
    expect(roundTrip(body).ok).toBe(true);
  });
});
