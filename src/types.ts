export interface Bookmark {
  id: string;
  label: string;
  url: string;
  category?: string;
}

export interface Config {
  vaultPath: string;
  bookmarks: Bookmark[];
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

export type Tab =
  | { id: string; kind: "note"; title: string; path: string }
  | { id: string; kind: "bookmark"; title: string; url: string };
