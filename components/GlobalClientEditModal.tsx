"use client";

import { useEffect, useState } from "react";
import { ClientEditModal } from "@/app/(main)/clients/ClientEditModal";

// 전역 거래처 수정 모달 — 어느 페이지에서든 'savetax-open-client-edit' 이벤트로 연다.
// 기장대리 목록의 행 클릭과 동일한 모달/저장 로직을 슬래시 검색 등에서도 재사용하기 위함.
export function GlobalClientEditModal() {
  const [clientId, setClientId] = useState<number | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ clientId: number }>).detail?.clientId;
      if (typeof id === "number") setClientId(id);
    }
    window.addEventListener("savetax-open-client-edit", onOpen);
    return () => window.removeEventListener("savetax-open-client-edit", onOpen);
  }, []);

  if (clientId === null) return null;
  return <ClientEditModal clientId={clientId} onClose={() => setClientId(null)} />;
}
