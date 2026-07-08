import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  id: string;
  url: string;
}

export default function WebPane({ id, url }: Props) {
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    const rect = pane.getBoundingClientRect();
    invoke("show_bookmark", {
      id,
      url,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }).catch(console.error);

    const observer = new ResizeObserver(() => {
      const r = pane.getBoundingClientRect();
      invoke("set_bookmark_bounds", {
        id,
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
      }).catch(console.error);
    });
    observer.observe(pane);

    return () => {
      observer.disconnect();
      invoke("hide_bookmark", { id }).catch(console.error);
    };
  }, [id, url]);

  return (
    <div ref={paneRef} className="web-pane">
      <div className="web-pane-loading">Loading {url}…</div>
    </div>
  );
}
