import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Editor as HeadlessEditor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { Wikilink } from "../editor/Wikilink";
import {
  VaultBlockquote,
  VaultBold,
  VaultBulletList,
  VaultHardBreak,
  VaultHeading,
  VaultItalic,
  VaultLink,
  VaultOrderedList,
  VaultParagraph,
  VaultText,
  VaultTightness,
} from "../editor/markdown";

interface Props {
  body: string;
  onReady: (editor: Editor, roundTripOk: boolean) => void;
  onDirty: () => void;
}

// tiptap-markdown's Storage augmentation targets TipTap v2 typings
export function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

export function normalizeMd(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const editorExtensions = [
  StarterKit.configure({
    link: false,
    text: false,
    paragraph: false,
    heading: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    italic: false,
    bold: false,
    hardBreak: false,
  }),
  VaultText,
  VaultParagraph,
  VaultHeading,
  VaultBulletList,
  VaultOrderedList,
  VaultBlockquote,
  VaultItalic,
  VaultBold,
  VaultHardBreak,
  VaultLink.configure({ openOnClick: false }),
  VaultTightness,
  Markdown.configure({ html: false, breaks: true, transformPastedText: true }),
  Wikilink,
];

// Vault notes are whitespace-sensitive: soft-wrapped paragraphs (single
// newlines) and multiple inner spaces must survive the round trip byte-for-byte.
export const editorParseOptions = { preserveWhitespace: "full" as const };

// Serialize for saving. Because VaultText writes text verbatim (no escaping),
// an edit could in principle produce markdown that parses differently than
// what is on screen. Reparse the output and serialize again: if the second
// pass differs, the markdown is ambiguous and must not be written to the vault.
export function safeMarkdown(editor: Editor): { md: string; stable: boolean } {
  const md = getMarkdown(editor);
  const probe = new HeadlessEditor({
    element: document.createElement("div"),
    extensions: editorExtensions,
    content: md,
    parseOptions: editorParseOptions,
  });
  const again = getMarkdown(probe as unknown as Editor);
  probe.destroy();
  return { md, stable: normalizeMd(again) === normalizeMd(md) };
}

export default function RichEditor({ body, onReady, onDirty }: Props) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: body,
    parseOptions: editorParseOptions,
    editorProps: {
      attributes: { class: "note-body rich-editor-content" },
    },
    onUpdate: onDirty,
  });

  useEffect(() => {
    if (!editor) return;
    const serialized = getMarkdown(editor);
    onReady(editor, normalizeMd(serialized) === normalizeMd(body));
    // gate once per mount; body is fixed for the lifetime of this editor instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;
  return <EditorContent editor={editor} className="rich-editor" />;
}
