import { describe, expect, it } from "vitest";
import { buildFitPrompt, buildIntakeDraft, parseFitResult } from "./fit";

const VALID = {
  role: {
    title: "Head of Operations",
    company: "Acme Media",
    location: "Leeds",
    workMode: "hybrid",
    compensation: "£80,000-90,000",
    source: "https://example.com/jobs/123",
  },
  laneId: "ops-transformation",
  verdict: "apply",
  explanation: "In-lane, clears the floor, requirements majority-met.",
  gaps: ["No formal finance qualification"],
  unknowns: ["Whether the posting is still live"],
  flags: [],
};

describe("parseFitResult", () => {
  it("parses a bare JSON response", () => {
    const result = parseFitResult(JSON.stringify(VALID));
    expect(result.verdict).toBe("apply");
    expect(result.role.company).toBe("Acme Media");
    expect(result.gaps).toHaveLength(1);
  });

  it("parses JSON wrapped in markdown fences or prose", () => {
    const wrapped = "Here is the result:\n```json\n" + JSON.stringify(VALID) + "\n```\nDone.";
    expect(parseFitResult(wrapped).verdict).toBe("apply");
  });

  it("normalises missing optional fields", () => {
    const result = parseFitResult(JSON.stringify({ verdict: "skip" }));
    expect(result.role.title).toBeNull();
    expect(result.gaps).toEqual([]);
    expect(result.explanation).toBe("");
  });

  it("rejects an unknown verdict", () => {
    expect(() => parseFitResult(JSON.stringify({ ...VALID, verdict: "yes" }))).toThrow(/verdict/);
  });

  it("rejects a response with no JSON", () => {
    expect(() => parseFitResult("I could not score this role.")).toThrow(/no JSON/);
  });
});

describe("buildFitPrompt", () => {
  it("embeds the targeting profile and the JD verbatim", () => {
    const prompt = buildFitPrompt("lanes:\n  - id: ops", "We need an operations lead in Leeds.");
    expect(prompt).toContain("lanes:\n  - id: ops");
    expect(prompt).toContain("We need an operations lead in Leeds.");
    expect(prompt).toContain("untrusted data");
  });
});

describe("buildIntakeDraft", () => {
  it("renders a markdown intake note with verdict and sections", () => {
    const md = buildIntakeDraft(parseFitResult(JSON.stringify(VALID)), "2026-07-28");
    expect(md).toContain("# Head of Operations, Acme Media");
    expect(md).toContain("**Verdict: apply**");
    expect(md).toContain("### Honest gaps");
    expect(md).toContain("### Unknowns to resolve");
  });

  it("omits empty sections and handles a sparse record", () => {
    const md = buildIntakeDraft(parseFitResult(JSON.stringify({ verdict: "skip" })), "2026-07-28");
    expect(md).toContain("# Untitled role");
    expect(md).not.toContain("### Honest gaps");
  });
});
