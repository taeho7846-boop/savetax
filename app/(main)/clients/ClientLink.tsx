"use client";

import type { ClientEditModalTab } from "@/app/(main)/clients/ClientEditModal";

// 거래처 수정 모달(GlobalClientEditModal) 열기 — 프로필 모달의 '수정' 버튼, 슬래시 검색 등에서 사용.
export function openClientEditModal(clientId: number, tab?: ClientEditModalTab) {
  window.dispatchEvent(new CustomEvent("savetax-open-client-edit", { detail: { clientId, tab } }));
}

// 거래처 프로필 모달(GlobalClientProfileModal) 열기 — 거래처 한 곳의 요약·경고·이력·매출매입을 한 장으로.
// tab 은 프로필 안 '수정' 버튼이 열 수정 모달의 탭 (예: "history" = 메모·이력 탭).
export function openClientProfile(clientId: number, tab?: ClientEditModalTab) {
  window.dispatchEvent(new CustomEvent("savetax-open-client-profile", { detail: { clientId, tab } }));
}

// 거래처명 클릭 → 거래처 프로필 모달. (2026-10-19 이전엔 수정 모달을 바로 열었음 — 그 동작은 프로필 안 '수정' 버튼으로 이어진다)
// 서버 컴포넌트(할 일 목록 등)에서도 쓸 수 있다.
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
      title="거래처 프로필 보기"
      onClick={(e) => {
        e.stopPropagation();
        openClientProfile(clientId, tab);
      }}
    >
      {children}
    </button>
  );
}
