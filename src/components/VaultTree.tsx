import { useState } from "react";
import type { TreeNode } from "../types";

interface Props {
  nodes: TreeNode[];
  depth?: number;
  activePath?: string;
  onOpenNote: (path: string, name: string) => void;
}

function Folder({ node, depth, activePath, onOpenNote }: { node: TreeNode; depth: number; activePath?: string; onOpenNote: Props["onOpenNote"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        className="tree-row tree-folder"
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => setOpen(!open)}
      >
        <span className={`chevron ${open ? "open" : ""}`}>›</span>
        <span className="tree-label">{node.name}</span>
      </button>
      {open && (
        <VaultTree nodes={node.children} depth={depth + 1} activePath={activePath} onOpenNote={onOpenNote} />
      )}
    </div>
  );
}

export default function VaultTree({ nodes, depth = 0, activePath, onOpenNote }: Props) {
  return (
    <div>
      {nodes.map((node) =>
        node.isDir ? (
          <Folder key={node.path} node={node} depth={depth} activePath={activePath} onOpenNote={onOpenNote} />
        ) : (
          <button
            key={node.path}
            className={`tree-row tree-note ${activePath === node.path ? "active" : ""}`}
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => onOpenNote(node.path, node.name)}
          >
            <span className="tree-label">{node.name}</span>
          </button>
        )
      )}
    </div>
  );
}
