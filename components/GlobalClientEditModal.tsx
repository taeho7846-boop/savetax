"use client";

import { useEffect, useState } from "react";
import { ClientEditModal, type ClientEditModalTab } from "@/app/(main)/clients/ClientEditModal";

// 전역 거래처 수정 모달 — 어느 페이지에서든 'savetax-open-client-edit' 이벤트로 연다.
// 기장대리 목록의 행 클릭과 동일한 모달/저장 로직을 슬래시 검색 등에서도 재사용하기 위함.
// detail.tab을 주면 해당 탭이 열린 상태로 시작 (예: "withholding" = 원천세 탭)
export function GlobalClientEditModal() {
  const [target, setTarget] = useState<{ clientId: number; tab?: ClientEditModalTab } | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ clientId: number; tab?: ClientEditModalTab }>).detail;
      if (typeof detail?.clientId === "number") setTarget({ clientId: detail.clientId, tab: detail.tab });
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
      onClose={() => setTarget(null)}
    />
  );
}
