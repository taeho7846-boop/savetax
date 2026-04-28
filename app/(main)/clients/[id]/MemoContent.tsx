"use client";

import { useState, useRef, useEffect } from "react";

export function MemoContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setIsClamped(el.scrollHeight > el.clientHeight + 1);
  }, [content]);

  return (
    <div className="mt-1">
      <p
        ref={ref}
        className={`text-xs text-[#6B7684] whitespace-pre-wrap ${expanded ? "" : "line-clamp-5"}`}
      >
        {content}
      </p>
      {(isClamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-[11px] text-[#3182F6] hover:underline mt-1"
        >
          {expanded ? "접기" : "더보기"}
        </button>
      )}
    </div>
  );
}
