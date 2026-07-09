export interface Bookmark {
  id: string;
  label: string;
  url: string;
  category?: string;
}

export interface HomeConfig {
  pipelineNote?: string;
  pipelineHeading?: string;
  activityDirs?: string[];
  activityLimit?: number;
}

export interface Config {
  vaultPath: string;
  bookmarks: Bookmark[];
  home?: HomeConfig;
}

export interface RecentFile {
  name: string;
  path: string;
  dir: string;
  modifiedMs: number;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

export interface SearchHit {
  docid: string;
  score: number;
  file: string;
  line?: number;
  title?: string;
  snippet?: string;
}

export type Tab =
  | { id: string; kind: "home"; title: string }
  | { id: string; kind: "note"; title: string; path: string }
  | { id: string; kind: "bookmark"; title: string; url: string };
