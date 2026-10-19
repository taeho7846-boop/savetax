"use client";

import type { ClientEditModalTab } from "@/app/(main)/clients/ClientEditModal";

// 거래처명 클릭 → 전역 거래처 수정 모달(GlobalClientEditModal)을 연다.
// 예전의 /clients/[id] 상세 페이지를 대신하며, 서버 컴포넌트(할 일 목록 등)에서도 쓸 수 있다.
export function openClientEditModal(clientId: number, tab?: ClientEditModalTab) {
  window.dispatchEvent(new CustomEvent("savetax-open-client-edit", { detail: { clientId, tab } }));
}

export function ClientLink({
  clientId,
  tab,
  className,
  children,
}: {
  clientId: number;
  tab?: ClientEditModalTab;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`text-left ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        openClientEditModal(clientId, tab);
      }}
    >
      {children}
    </button>
  );
}
