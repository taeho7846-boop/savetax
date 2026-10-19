"use client";

import { useCallback, useEffect, useState } from "react";
import { ClientProfileModal } from "@/app/(main)/clients/ClientProfileModal";
import type { ClientEditModalTab } from "@/app/(main)/clients/ClientEditModal";

// 전역 거래처 프로필 모달 — 어느 페이지에서든 'savetax-open-client-profile' 이벤트로 연다.
// ClientLink(거래처명 클릭)가 이 이벤트를 보낸다. detail.tab 은 모달 안 '수정' 버튼이 열 수정 모달 탭.
export function GlobalClientProfileModal() {
  const [target, setTarget] = useState<{ clientId: number; tab?: ClientEditModalTab } | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ clientId: number; tab?: ClientEditModalTab }>).detail;
      if (typeof detail?.clientId === "number") setTarget({ clientId: detail.clientId, tab: detail.tab });
    }
    window.addEventListener("savetax-open-client-profile", onOpen);
    return () => window.removeEventListener("savetax-open-client-profile", onOpen);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  if (target === null) return null;
  return <ClientProfileModal key={target.clientId} clientId={target.clientId} editTab={target.tab} onClose={close} />;
}
