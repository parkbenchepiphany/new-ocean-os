import type { Bookmark, TreeNode } from "../types";
import VaultTree from "./VaultTree";

interface Props {
  bookmarks: Bookmark[];
  tree: TreeNode[];
  activePath?: string;
  onOpenNote: (path: string, name: string) => void;
  onOpenBookmark: (bookmark: Bookmark) => void;
  onOpenHome: () => void;
}

export default function Sidebar({ bookmarks, tree, activePath, onOpenNote, onOpenBookmark, onOpenHome }: Props) {
  const categories = new Map<string, Bookmark[]>();
  for (const bm of bookmarks) {
    const cat = bm.category ?? "Bookmarks";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(bm);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand clickable" onClick={onOpenHome} title="Home">
        <span className="brand-mark">◍</span>
        <span className="brand-name">New Ocean OS</span>
      </div>

      <div className="sidebar-scroll">
        {[...categories.entries()].map(([cat, items]) => (
          <section key={cat} className="sidebar-section">
            <h3 className="section-title">{cat}</h3>
            {items.map((bm) => (
              <button key={bm.id} className="tree-row bookmark-row" onClick={() => onOpenBookmark(bm)}>
                <span className="bookmark-dot" />
                <span className="tree-label">{bm.label}</span>
              </button>
            ))}
          </section>
        ))}

        <section className="sidebar-section">
          <h3 className="section-title">Vault</h3>
          <VaultTree nodes={tree} activePath={activePath} onOpenNote={onOpenNote} />
        </section>
      </div>
    </aside>
  );
}
