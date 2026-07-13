export interface FrontmatterParts {
  body: string;
  frontmatter: string | null;
  fmBlock: string;
}

export function splitFrontmatter(md: string): FrontmatterParts {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: md, frontmatter: null, fmBlock: "" };
  return { body: md.slice(match[0].length), frontmatter: match[1], fmBlock: match[0] };
}
