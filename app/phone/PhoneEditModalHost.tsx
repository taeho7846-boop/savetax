"use client";

import { useEffect, useRef, useState } from "react";
import { ClientEditModal, type ClientEditModalTab } from "@/app/(main)/clients/ClientEditModal";

// 편집 모달이 열릴 때 팝업 창을 갤럭시폴드처럼 옆으로 펼치고, 닫으면 다시 접는다.
// 오른쪽 모서리를 고정한 채 왼쪽으로 펼쳐진다 (팝업이 화면 오른쪽에 붙어 있으므로).
const UNFOLDED_WIDTH = 860;

function animateResize(targetW: number) {
  const startW = window.outerWidth;
  const delta = targetW - startW;
  if (delta === 0) return;
  const steps = 14;
  let i = 0;
  let currentW = startW;
  const tick = () => {
    i++;
    const t = i / steps;
    const eased = 1 - Math.pow(1 - t, 3); // ease-out
    const w = Math.round(startW + delta * eased);
    window.resizeTo(w, window.outerHeight);
    window.moveBy(currentW - w, 0); // 오른쪽 모서리 고정
    currentW = w;
    if (i < steps) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function PhoneEditModalHost() {
  const [target, setTarget] = useState<{ clientId: number; tab?: ClientEditModalTab } | null>(null);
  const foldedWidth = useRef<number | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ clientId: number; tab?: ClientEditModalTab }>).detail;
      if (typeof detail?.clientId !== "number") return;
      if (foldedWidth.current == null) foldedWidth.current = window.outerWidth;
      animateResize(Math.max(UNFOLDED_WIDTH, window.outerWidth));
      setTarget({ clientId: detail.clientId, tab: detail.tab });
    }
    window.addEventListener("savetax-open-client-edit", onOpen);
    return () => window.removeEventListener("savetax-open-client-edit", onOpen);
  }, []);

  if (target === null) return null;
  return (
    <ClientEditModal
      key={`${target.clientId}-${target.tab ?? "edit"}`}
      clientId={target.clientId}
      initialTab={target.tab}
      onClose={() => {
        setTarget(null);
        const w = foldedWidth.current ?? 350;
        foldedWidth.current = null;
        animateResize(w);
      }}
    />
  );
}
