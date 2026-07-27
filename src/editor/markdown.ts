/* eslint-disable @typescript-eslint/no-explicit-any */
import { Extension } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import Blockquote from "@tiptap/extension-blockquote";
import Italic from "@tiptap/extension-italic";
import Bold from "@tiptap/extension-bold";
import HardBreak from "@tiptap/extension-hard-break";
import Link from "@tiptap/extension-link";
import { defaultMarkdownSerializer } from "prosemirror-markdown";

// ---------------------------------------------------------------------------
// Verbatim text
//
// tiptap-markdown's default text serializer rewrites vault bytes twice over:
// its own escapeHTML turns < and > into &lt; / &gt;, and prosemirror-markdown's
// state.text() backslash-escapes ` * \ ~ [ ] _ and start-of-line characters.
//
// Any literal special character sitting in a text node is literal precisely
// because markdown-it parsed it that way from the original source, so writing
// it back verbatim reproduces the original bytes. The risk that an EDIT
// creates newly ambiguous text (e.g. typing *stars* as prose) is covered by
// the save-time reparse check in safeMarkdown(), not by escaping.
// ---------------------------------------------------------------------------
export const VaultText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.text(node.text ?? "", false);
        },
        parse: {},
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tight blocks
//
// Vault notes freely mix "## Heading\n- item" (no blank line) with spaced
// styles, but prosemirror-markdown unconditionally writes a blank line
// between blocks. To round-trip both styles byte-identically:
//
//  parse:     a markdown-it core rule stamps data-tight-before="true" on any
//             top-level block that starts on the line immediately after the
//             previous block (no blank line between them in the source);
//  attribute: block nodes carry a hidden tightBefore attr read from that DOM
//             attribute (never rendered back into the editor DOM);
//  serialize: tightAware() collapses the pending blank line to a single
//             newline before writing a tightBefore block.
// ---------------------------------------------------------------------------
const tightBeforeAttribute = {
  tightBefore: {
    default: false,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-tight-before") === "true",
    renderHTML: () => ({}),
  },
};

const indentAttribute = {
  indent: {
    default: 0,
    parseHTML: (el: HTMLElement) => parseInt(el.getAttribute("data-indent") ?? "0", 10) || 0,
    renderHTML: () => ({}),
  },
};

// Applies the source-level leading indent around a list renderer. The stored
// indent is absolute (column in the source line); whatever the current
// serializer context already provides (nesting delim) is subtracted.
function withIndent(state: any, node: any, render: () => void) {
  const contextIndent = typeof state.delim === "string" ? state.delim.length : 0;
  const n = Math.max(0, (node.attrs?.indent || 0) - contextIndent);
  if (n > 0) {
    // wrapBlock's write() flushes with the default TWO newlines; inside a
    // tight list that would inject a blank line renderList itself avoids
    // (it calls flushClose(1) explicitly). Match that behavior first.
    if (state.inTightList) state.flushClose(1);
    state.wrapBlock(" ".repeat(n), null, node, render);
  } else {
    render();
  }
}

function tightAware(serialize: (state: any, node: any, parent: any, index: number) => void) {
  return function (this: unknown, state: any, node: any, parent: any, index: number) {
    if (node.attrs?.tightBefore) state.flushClose(1);
    serialize.call(this, state, node, parent, index);
  };
}

export const VaultTightness = Extension.create({
  name: "vaultTightness",
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(md: any) {
            // Keep backslash escapes literal. Sources in the vault contain
            // generator artifacts like \~ and \&; markdown-it would silently
            // unescape them, and since the serializer never re-emits
            // backslash escapes the bytes would change on save. Keeping the
            // backslash in the text round-trips exactly and reparses the
            // same way. The backslash-newline hard break keeps its meaning.
            md.inline.ruler.at("escape", (state: any, silent: boolean) => {
              const pos = state.pos;
              const max = state.posMax;
              if (state.src.charCodeAt(pos) !== 0x5c /* \ */ || pos + 1 >= max) return false;
              const ch = state.src[pos + 1];
              if (ch === "\n") {
                if (!silent) state.push("hardbreak", "br", 0);
                state.pos += 2;
                while (state.pos < max && state.src.charCodeAt(state.pos) === 0x20) state.pos++;
                return true;
              }
              if (!silent) {
                const token = state.push("text", "", 0);
                token.content = "\\" + ch;
              }
              state.pos += 2;
              return true;
            });
            md.core.ruler.push("vault_mark_markup", (state: any) => {
              for (const blockTok of state.tokens) {
                if (blockTok.type !== "inline" || !blockTok.children) continue;
                for (const tok of blockTok.children) {
                  if (tok.type === "em_open" || tok.type === "strong_open") {
                    tok.attrSet("data-markup", tok.markup);
                  }
                }
              }
            });
            md.core.ruler.push("vault_tight_blocks", (state: any) => {
              // A top-level block is "tight" when the source line directly
              // above it is non-blank (markdown-it block maps can overshoot
              // trailing blank lines, so prev-line inspection is the reliable
              // signal).
              const lines: string[] = state.src.split("\n");
              for (const tok of state.tokens) {
                if (tok.hidden || !tok.map) continue;
                // Lists at any depth: record the absolute leading-space indent
                // of their first line so serialization can reproduce source
                // indents that differ from the serializer's 2-space ladder
                // (top-level "  - x" under headings, 6-space third levels).
                if (tok.type === "bullet_list_open" || tok.type === "ordered_list_open") {
                  const indent = ((lines[tok.map[0]] ?? "").match(/^ */) ?? [""])[0].length;
                  if (indent > 0) tok.attrSet("data-indent", String(indent));
                }
                if (tok.level !== 0) continue;
                const opener =
                  tok.type.endsWith("_open") || tok.type === "fence" || tok.type === "hr";
                if (!opener) continue;
                const startLine = tok.map[0];
                if (startLine > 0 && (lines[startLine - 1] ?? "").trim() !== "") {
                  tok.attrSet("data-tight-before", "true");
                }
              }
            });
          },
          // With preserveWhitespace "full", markdown-it's formatting newlines
          // between HTML tags would survive into text nodes (e.g. "Parent\n"
          // before a nested <ul>). Strip whitespace that touches block-element
          // boundaries; newlines inside real prose (<p>a\nb</p>) stay.
          updateDOM(element: HTMLElement) {
            const BLOCK = new Set([
              "P",
              "UL",
              "OL",
              "LI",
              "BLOCKQUOTE",
              "PRE",
              "TABLE",
              "HR",
              "DIV",
              "H1",
              "H2",
              "H3",
              "H4",
              "H5",
              "H6",
            ]);
            const isBlock = (n: Node | null) =>
              n !== null && n.nodeType === 1 && BLOCK.has((n as Element).nodeName);
            const doc = element.ownerDocument;
            const walker = doc.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT */);
            const texts: Node[] = [];
            while (walker.nextNode()) texts.push(walker.currentNode);
            for (const t of texts) {
              const value = t.nodeValue ?? "";
              if (value.trim() === "") {
                // whitespace-only node against a block boundary is formatting
                if (isBlock(t.nextSibling) || isBlock(t.previousSibling)) t.nodeValue = "";
                continue;
              }
              if (/\n\s*$/.test(value) && (t.nextSibling === null || isBlock(t.nextSibling))) {
                t.nodeValue = value.replace(/\n\s*$/, "");
              }
              if (/^\s*\n/.test(value) && (t.previousSibling === null || isBlock(t.previousSibling))) {
                t.nodeValue = (t.nodeValue ?? "").replace(/^\s*\n/, "");
              }
            }
          },
        },
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Delimiter-preserving emphasis
//
// The vault mixes *em* with _em_ and **strong** with __strong__. markdown-it
// knows which delimiter was used (token.markup) but the HTML hop discards it.
// A core rule stamps data-markup on em/strong tokens; the marks carry it and
// serialize back with the original delimiter.
// ---------------------------------------------------------------------------
const markupAttribute = (fallback: string) => ({
  markup: {
    default: fallback,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-markup") ?? fallback,
    renderHTML: () => ({}),
  },
});

export const VaultItalic = Italic.extend({
  addAttributes() {
    return { ...this.parent?.(), ...markupAttribute("*") };
  },
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_state: any, mark: any) => mark.attrs.markup || "*",
          close: (_state: any, mark: any) => mark.attrs.markup || "*",
          mixable: true,
          expelEnclosingWhitespace: true,
        },
        parse: {},
      },
    };
  },
});

export const VaultBold = Bold.extend({
  addAttributes() {
    return { ...this.parent?.(), ...markupAttribute("**") };
  },
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_state: any, mark: any) => mark.attrs.markup || "**",
          close: (_state: any, mark: any) => mark.attrs.markup || "**",
          mixable: true,
          expelEnclosingWhitespace: true,
        },
        parse: {},
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Autolinks
//
// prosemirror-markdown writes <url> for links whose text equals their href,
// but a mailto autolink like <hello@example.com> has href
// "mailto:hello@example.com" and text "hello@example.com", so it fell
// through to [text](mailto:...). Treat that pair as plain too.
// ---------------------------------------------------------------------------
function isPlainLink(mark: any, parent: any, index: number): boolean {
  if (mark.attrs.title || !/^\w+:/.test(mark.attrs.href)) return false;
  const content = parent.child(index);
  if (
    !content.isText ||
    (content.text !== mark.attrs.href && `mailto:${content.text}` !== mark.attrs.href) ||
    content.marks[content.marks.length - 1] !== mark
  ) {
    return false;
  }
  return index === parent.childCount - 1 || !mark.isInSet(parent.child(index + 1).marks);
}

export const VaultLink = Link.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open(state: any, mark: any, parent: any, index: number) {
            state.vaultInAutolink = isPlainLink(mark, parent, index);
            return state.vaultInAutolink ? "<" : "[";
          },
          close(state: any, mark: any) {
            const auto = state.vaultInAutolink;
            state.vaultInAutolink = undefined;
            if (auto) return ">";
            return (
              "](" +
              mark.attrs.href.replace(/[()"]/g, "\\$&") +
              (mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : "") +
              ")"
            );
          },
          mixable: false,
        },
        parse: {},
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Soft line breaks
//
// The editor runs markdown-it with breaks: true, so single newlines inside a
// paragraph become hardBreak nodes. Serializing them back as a bare "\n"
// reproduces the source exactly (a two-space hard break loses its trailing
// spaces, which normalizeMd ignores by design). This also sidesteps
// tiptap-markdown's normalizeDOM, which eats a leading "\n" in text that
// follows an inline element and was silently merging soft-wrapped lines.
// ---------------------------------------------------------------------------
export const VaultHardBreak = HardBreak.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any, parent: any, index: number) {
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) {
              state.write(state.inTable ? "<br>" : "\n");
              return;
            }
          }
        },
        parse: {},
      },
    };
  },
});

export const VaultParagraph = Paragraph.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tightBeforeAttribute };
  },
  addStorage() {
    return {
      markdown: {
        serialize: tightAware(defaultMarkdownSerializer.nodes.paragraph),
        parse: {},
      },
    };
  },
});

export const VaultHeading = Heading.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tightBeforeAttribute };
  },
  addStorage() {
    return {
      markdown: {
        serialize: tightAware(defaultMarkdownSerializer.nodes.heading),
        parse: {},
      },
    };
  },
});

export const VaultBlockquote = Blockquote.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tightBeforeAttribute };
  },
  addStorage() {
    return {
      markdown: {
        serialize: tightAware(defaultMarkdownSerializer.nodes.blockquote),
        parse: {},
      },
    };
  },
});

// List serializers replicated from tiptap-markdown (they are not exported),
// wrapped with tightness awareness. Keep in sync with tiptap-markdown's
// BulletList / OrderedList markdown specs if that package is upgraded.
export const VaultBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tightBeforeAttribute, ...indentAttribute };
  },
  addStorage() {
    return {
      markdown: {
        serialize: tightAware(function (this: any, state: any, node: any) {
          const marker = this.editor.storage.markdown.options.bulletListMarker || "-";
          withIndent(state, node, () => state.renderList(node, "  ", () => marker + " "));
        }),
        parse: {},
      },
    };
  },
});

function findIndexOfAdjacentNode(node: any, parent: any, index: number): number {
  let i = 0;
  for (; index - i > 0; i++) {
    if (parent.child(index - i - 1).type.name !== node.type.name) break;
  }
  return i;
}

export const VaultOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tightBeforeAttribute, ...indentAttribute };
  },
  addStorage() {
    return {
      markdown: {
        serialize: tightAware(function (state: any, node: any, parent: any, index: number) {
          const start = node.attrs.start || 1;
          const maxW = String(start + node.childCount - 1).length;
          const space = state.repeat(" ", maxW + 2);
          const adjacentIndex = findIndexOfAdjacentNode(node, parent, index);
          const separator = adjacentIndex % 2 ? ") " : ". ";
          withIndent(state, node, () =>
            state.renderList(node, space, (i: number) => {
              const nStr = String(start + i);
              return state.repeat(" ", maxW - nStr.length) + nStr + separator;
            })
          );
        }),
        parse: {},
      },
    };
  },
});
