import { Node, mergeAttributes } from "@tiptap/core";

// markdown-it plugin: [[Target]] / [[Target|Alias]] -> <span data-wikilink>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wikilinkMarkdownIt(md: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  md.inline.ruler.before("link", "wikilink", (state: any, silent: boolean) => {
    const src: string = state.src;
    const pos: number = state.pos;
    if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
    const end = src.indexOf("]]", pos + 2);
    if (end === -1) return false;
    const inner = src.slice(pos + 2, end);
    if (!inner || inner.includes("[") || inner.includes("]") || inner.includes("\n")) return false;
    if (!silent) {
      const token = state.push("wikilink", "", 0);
      token.content = inner;
    }
    state.pos = end + 2;
    return true;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  md.renderer.rules.wikilink = (tokens: any[], idx: number) => {
    const inner: string = tokens[idx].content;
    const pipe = inner.indexOf("|");
    const target = pipe === -1 ? inner : inner.slice(0, pipe);
    const alias = pipe === -1 ? null : inner.slice(pipe + 1);
    const esc = md.utils.escapeHtml;
    const aliasAttr = alias === null ? "" : ` data-alias="${esc(alias)}"`;
    return `<span data-wikilink="${esc(target)}"${aliasAttr}>${esc(alias ?? target)}</span>`;
  };
}

export const Wikilink = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      target: { default: "" },
      alias: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wikilink]",
        getAttrs: (el) => ({
          target: (el as HTMLElement).getAttribute("data-wikilink") ?? "",
          alias: (el as HTMLElement).getAttribute("data-alias"),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    const target = node.attrs.target as string;
    const alias = node.attrs.alias as string | null;
    return [
      "span",
      mergeAttributes(
        { "data-wikilink": target, class: "wikilink" },
        alias === null ? {} : { "data-alias": alias }
      ),
      alias ?? target,
    ];
  },

  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          const target = node.attrs.target as string;
          const alias = node.attrs.alias as string | null;
          state.write(alias === null ? `[[${target}]]` : `[[${target}|${alias}]]`);
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(markdownit: any) {
            markdownit.use(wikilinkMarkdownIt);
          },
        },
      },
    };
  },
});
