import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { Wikilink } from "../editor/Wikilink";

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
  StarterKit.configure({ link: { openOnClick: false } }),
  Markdown.configure({ html: false, transformPastedText: true }),
  Wikilink,
];

export default function RichEditor({ body, onReady, onDirty }: Props) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: body,
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
