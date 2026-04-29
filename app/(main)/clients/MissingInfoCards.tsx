"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type ClientItem = {
  id: number;
  name: string;
  ceoName: string | null;
  clientType: string | null;
  cmsStatus?: "pending" | "none";
  firstWithdrawalMonth?: string | null; // "YYYY-MM"
};

// "2026-04" → "2026년 4월"
function formatYM(ym: string | null | undefined): string | null {
  if (!ym) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(ym);
  if (!m) return ym;
  return `${m[1]}년 ${parseInt(m[2], 10)}월`;
}

// 현재 연월 (YYYY-MM 문자열)
function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  totalCount: number;
  noCmsCount: number;
  noDocsCount: number;
  cmsPendingCount: number;
  cmsNoneCount: number;
  noCmsList: ClientItem[];
  noDocsList: ClientItem[];
};

export function MissingInfoCards({
  totalCount,
  noCmsCount,
  noDocsCount,
  cmsPendingCount,
  cmsNoneCount,
  noCmsList,
  noDocsList,
}: Props) {
  const [modal, setModal] = useState<null | "cms" | "hometax">(null);

  // ESC로 닫기
  useEffect(() => {
    if (!modal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModal(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal]);

  return (
    <>
      {/* ── CMS 미등록 카드 ── */}
      <button
        type="button"
        onClick={() => setModal("cms")}
        className="stat-card glass rounded-2xl p-5 relative overflow-hidden text-left hover:bg-white/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="absolute left-0 top-5 bottom-5 w-1 bg-[#92400E] rounded-r" />
        <div className="flex items-center justify-between pl-2">
          <div className="text-[11px] font-bold text-[#8B95A1] tracking-wide uppercase">CMS 자동이체 미완료</div>
          <span className="text-[10px] text-[#92400E] font-bold opacity-60 group-hover:opacity-100">자세히 →</span>
        </div>
        <div className="flex items-end gap-1.5 mt-1.5 pl-2">
          <div className="text-[26px] font-extrabold text-[#92400E] leading-none">{noCmsCount}</div>
          <div className="text-[11px] text-[#8B95A1] mb-1">/ {totalCount}</div>
        </div>
        <div className="text-[11px] text-[#8B95A1] mt-1.5 pl-2">
          {noCmsCount > 0 ? (
            <>
              <span className="text-[#B45309] font-semibold">요청중 {cmsPendingCount}</span>
              <span className="mx-1 text-[#D1D6DB]">·</span>
              <span className="text-[#92400E] font-semibold">미등록 {cmsNoneCount}</span>
            </>
          ) : (
            "모두 등록 완료"
          )}
        </div>
      </button>

      {/* ── 홈택스 정보 없음 카드 ── */}
      <button
        type="button"
        onClick={() => setModal("hometax")}
        className="stat-card glass rounded-2xl p-5 relative overflow-hidden text-left hover:bg-white/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="absolute left-0 top-5 bottom-5 w-1 bg-[#DC2626] rounded-r" />
        <div className="flex items-center justify-between pl-2">
          <div className="text-[11px] font-bold text-[#8B95A1] tracking-wide uppercase">홈택스 정보 없음</div>
          <span className="text-[10px] text-[#DC2626] font-bold opacity-60 group-hover:opacity-100">자세히 →</span>
        </div>
        <div className="flex items-end gap-1.5 mt-1.5 pl-2">
          <div className="text-[26px] font-extrabold text-[#DC2626] leading-none">{noDocsCount}</div>
        </div>
        <div className="text-[11px] text-[#8B95A1] mt-1.5 pl-2">홈택스 ID/PW 등록 필요</div>
      </button>

      {/* ── 모달 ── */}
      {modal && (
        <ClientListModal
          variant={modal}
          items={modal === "cms" ? noCmsList : noDocsList}
          totalCount={totalCount}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────
function ClientListModal({
  variant,
  items,
  totalCount,
  onClose,
}: {
  variant: "cms" | "hometax";
  items: ClientItem[];
  totalCount: number;
  onClose: () => void;
}) {
  const meta =
    variant === "cms"
      ? {
          title: "CMS 자동이체 미완료",
          subtitle: "등록요청중 + 미등록 거래처",
          accent: "#92400E",
          accentBg: "from-[#FEF3C7]/80 via-[#FDE68A]/40",
          ringColor: "ring-[#92400E]/15",
          gradientDot: "from-[#FBBF24] to-[#92400E]",
          icon: <CmsIcon />,
          actionLabel: "상세 열기",
        }
      : {
          title: "홈택스 정보 없음",
          subtitle: "홈택스 ID/PW 등록이 필요해요",
          accent: "#DC2626",
          accentBg: "from-[#FEE2E2]/80 via-[#FECACA]/40",
          ringColor: "ring-[#DC2626]/15",
          gradientDot: "from-[#F87171] to-[#DC2626]",
          icon: <HometaxIcon />,
          actionLabel: "상세 열기",
        };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.18s_ease-out]"
      onClick={onClose}
      style={{
        background: "rgba(15, 23, 42, 0.32)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-[560px] max-h-[80vh] rounded-[28px] overflow-hidden flex flex-col shadow-2xl ring-1 ${meta.ringColor}`}
        style={{
          background: "rgba(255, 255, 255, 0.78)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.6)",
        }}
      >
        {/* 헤더: 컬러 그라디언트 글래스 */}
        <div
          className={`relative px-7 pt-6 pb-5 bg-gradient-to-br ${meta.accentBg} to-transparent`}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full hover:bg-white/60 flex items-center justify-center text-[#4E5968] hover:text-[#191F28] transition-colors"
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex items-start gap-3.5">
            <div
              className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${meta.gradientDot} flex items-center justify-center text-white shadow-lg shrink-0`}
            >
              {meta.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[18px] font-bold text-[#191F28] tracking-tight">
                {meta.title}
              </h2>
              <p className="text-[12.5px] text-[#4E5968] mt-0.5">{meta.subtitle}</p>
            </div>
          </div>

          {/* 카운트 칩 */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {variant === "cms" ? (
              <>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FEF3C7]/80 border border-[#FCD34D]/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B45309]" />
                  <span className="text-[12px] font-bold tabular-nums text-[#B45309]">
                    {items.filter((i) => i.cmsStatus === "pending").length}
                  </span>
                  <span className="text-[11px] text-[#92400E]">요청중</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FEE2E2]/80 border border-[#FCA5A5]/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#92400E]" />
                  <span className="text-[12px] font-bold tabular-nums text-[#92400E]">
                    {items.filter((i) => i.cmsStatus === "none").length}
                  </span>
                  <span className="text-[11px] text-[#92400E]">미등록</span>
                </div>
                <span className="text-[11px] text-[#8B95A1]">
                  전체 {totalCount}곳 중
                </span>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 border border-white/60">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: meta.accent }}
                  />
                  <span className="text-[12px] font-bold tabular-nums" style={{ color: meta.accent }}>
                    {items.length}
                  </span>
                  <span className="text-[11px] text-[#6B7684]">곳</span>
                </div>
                <span className="text-[11px] text-[#8B95A1]">
                  전체 {totalCount}곳 중
                </span>
              </>
            )}
          </div>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-1.5 min-h-[160px]">
          {items.length === 0 ? (
            <div className="py-14 text-center">
              <div className="text-[36px] mb-2">🎉</div>
              <div className="text-[14px] font-bold text-[#191F28]">모두 등록 완료</div>
              <div className="text-[11.5px] text-[#8B95A1] mt-1">처리해야 할 거래처가 없어요</div>
            </div>
          ) : (
            items.map((c) => {
              const ym = c.firstWithdrawalMonth || null;
              const isOverdue = !!ym && ym < currentYM();
              const isThisMonth = !!ym && ym === currentYM();
              return (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}/edit`}
                  onClick={onClose}
                  className="group flex items-center gap-3 px-3.5 py-3 rounded-2xl hover:bg-white/80 transition-all duration-150 ring-1 ring-transparent hover:ring-white/80"
                >
                  <span
                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap ${
                      c.clientType === "corporate"
                        ? "bg-[#EAF2FF] text-[#1B64DA]"
                        : "bg-[#F2F4F6] text-[#4E5968]"
                    }`}
                  >
                    {c.clientType === "corporate" ? "법인" : "개인"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="text-[13.5px] font-bold text-[#191F28] truncate">
                        {c.name}
                      </div>
                      {variant === "cms" && c.cmsStatus && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0 ${
                            c.cmsStatus === "pending"
                              ? "bg-[#FEF3C7] text-[#B45309] border border-[#FCD34D]/40"
                              : "bg-[#FEE2E2] text-[#92400E] border border-[#FCA5A5]/40"
                          }`}
                        >
                          {c.cmsStatus === "pending" ? "요청중" : "미등록"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#8B95A1]">
                      {c.ceoName && <span className="truncate">{c.ceoName}</span>}
                      {variant === "cms" && (
                        <>
                          {c.ceoName && <span className="text-[#D1D6DB]">·</span>}
                          <span
                            className={`whitespace-nowrap font-semibold ${
                              isOverdue
                                ? "text-[#DC2626]"
                                : isThisMonth
                                  ? "text-[#D97706]"
                                  : ym
                                    ? "text-[#4E5968]"
                                    : "text-[#B0B8C1]"
                            }`}
                          >
                            {ym ? (
                              <>
                                최초출금 {formatYM(ym)}
                                {isOverdue && (
                                  <span className="ml-1 text-[10px]">⚠ 지연</span>
                                )}
                                {isThisMonth && (
                                  <span className="ml-1 text-[10px]">이번달</span>
                                )}
                              </>
                            ) : (
                              "최초출금월 미설정"
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    className="text-[10.5px] font-bold px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap"
                    style={{
                      color: meta.accent,
                      backgroundColor: "rgba(255, 255, 255, 0.85)",
                      border: `1px solid ${meta.accent}33`,
                    }}
                  >
                    {meta.actionLabel} →
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* 푸터 */}
        <div
          className="px-7 py-3.5 border-t border-white/50 flex items-center justify-between"
          style={{ background: "rgba(255, 255, 255, 0.4)" }}
        >
          <div className="text-[11px] text-[#6B7684]">
            클릭하면 해당 거래처 수정 페이지로 이동
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-bold text-[#6B7684] hover:text-[#191F28] px-3 py-1 rounded-lg hover:bg-white/60 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function CmsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h2" />
    </svg>
  );
}

function HometaxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="16" r="1" />
    </svg>
  );
}
