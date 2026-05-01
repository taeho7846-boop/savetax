"use client";

import { useEffect, useState, useTransition } from "react";
import { applyNoticeAnalysis } from "@/app/actions/income-tax";

type Analysis = {
  id: number;
  clientId: number;
  taxYear: string;
  analyzedAt: string;
  filingType: string | null;
  totalSales: number | null;
  businessSales: number | null;
  freelanceSales: number | null;
  hasOtherIncome: boolean;
  otherIncomeFlags: Record<string, string>;
  incomeHistory: Array<{ year: number; totalIncome: number | null; taxBase: number | null; calculatedTax: number | null; decidedTax: number | null; effectiveRate: number | null }>;
  raw: any;
  reviewedByStaffAt: string | null;
  reviewedByAccountantAt: string | null;
};

type ReductionInfo = {
  bizCode: string;
  startupReduction: string | null;
  smeReduction: string | null;
  found: boolean;
} | null;

type Props = {
  clientId: number;
  clientName: string;
  ceoName: string | null;
  taxYear: string;
  systemFilingType: string | null;
  systemCurrSales: string | null; // BigInt 문자열
  systemPrevSales: string | null;
  systemPrevTax: string | null;
  onClose: () => void;
};

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : n.toLocaleString("ko-KR");

const FLAG_LABEL: Record<string, string> = {
  interest: "이자",
  dividend: "배당",
  salarySingle: "근로(단일)",
  salaryMulti: "근로(복수)",
  pension: "연금",
  etc: "기타",
  religion: "종교인기타",
};

function mapFilingType(t: string | null): string | null {
  if (!t) return null;
  if (t.includes("기준")) return "추계-기준율";
  if (t.includes("단순")) return "추계-단순율";
  return t;
}

export function NoticeCompareModal({
  clientId,
  clientName,
  ceoName,
  taxYear,
  systemFilingType,
  systemCurrSales,
  systemPrevSales,
  systemPrevTax,
  onClose,
}: Props) {
  const [data, setData] = useState<Analysis | null>(null);
  const [reduction, setReduction] = useState<ReductionInfo>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [appliedFlash, setAppliedFlash] = useState<string | null>(null);

  // 처음 로드: 캐시 조회
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/income-tax/notice-analyze?clientId=${clientId}&taxYear=${taxYear}`
        );
        const j = await res.json();
        if (!alive) return;
        if (j.data) setData(j.data);
        if (j.reductionInfo) setReduction(j.reductionInfo);
      } catch {
        // ignore
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId, taxYear]);

  async function runAnalyze(force = false) {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/income-tax/notice-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, taxYear, force }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(
          j.error === "PDF_NOT_FOUND"
            ? "이 거래처의 드라이브에 종합소득세 신고안내문 PDF가 없습니다. 먼저 업로드해 주세요."
            : j.error === "NO_DRIVE_FOLDER"
            ? "거래처의 구글드라이브 폴더가 연결되어 있지 않습니다."
            : j.error || "분석 실패"
        );
        return;
      }
      setData(j.data);
      setReduction(j.reductionInfo ?? null);
    } catch (e: any) {
      setError(e?.message || "네트워크 오류");
    } finally {
      setAnalyzing(false);
    }
  }

  const sysSales = systemCurrSales ? Number(systemCurrSales) : null;
  const sysPrevSales = systemPrevSales ? Number(systemPrevSales) : null;
  const sysPrevTax = systemPrevTax ? Number(systemPrevTax) : null;

  const noticeFiling = data ? mapFilingType(data.filingType) : null;
  const filingMatch =
    !data || !systemFilingType || !noticeFiling
      ? null
      : systemFilingType === noticeFiling;

  const businessSalesMatch =
    !data || sysSales === null || data.businessSales === null
      ? null
      : sysSales === data.businessSales;

  const totalDiff = data && sysSales !== null && data.totalSales
    ? Number(data.totalSales) - sysSales
    : null;

  // 전기(작년) 데이터 추출 — taxYear-1 기준
  const prevYear = parseInt(taxYear) - 1;
  const noticePrevSales = data?.raw?.salesHistory?.find?.((s: any) => s.year === prevYear)?.sales ?? null;
  const noticePrevTax = data?.incomeHistory?.find?.((s: any) => s.year === prevYear)?.decidedTax ?? null;
  const prevSalesMatch =
    !data || sysPrevSales === null || noticePrevSales === null
      ? null
      : sysPrevSales === noticePrevSales;
  const prevTaxMatch =
    !data || sysPrevTax === null || noticePrevTax === null
      ? null
      : sysPrevTax === noticePrevTax;

  // 액션
  function applyFilingType() {
    if (!data || !noticeFiling) return;
    startTransition(async () => {
      await applyNoticeAnalysis(clientId, taxYear, { filingType: noticeFiling });
      setAppliedFlash("유형 적용 완료");
      setTimeout(() => setAppliedFlash(null), 1500);
    });
  }

  function applyCurrSales() {
    if (!data?.businessSales) return;
    startTransition(async () => {
      await applyNoticeAnalysis(clientId, taxYear, { currSales: String(data.businessSales) });
      setAppliedFlash("당기 매출(사업장) 적용 완료");
      setTimeout(() => setAppliedFlash(null), 1500);
    });
  }

  function applyPrevSales() {
    if (!noticePrevSales) return;
    startTransition(async () => {
      await applyNoticeAnalysis(clientId, taxYear, { prevSales: String(noticePrevSales) });
      setAppliedFlash("전기 매출 적용 완료");
      setTimeout(() => setAppliedFlash(null), 1500);
    });
  }

  function applyPrevTax() {
    if (!noticePrevTax) return;
    startTransition(async () => {
      await applyNoticeAnalysis(clientId, taxYear, { prevTax: String(noticePrevTax) });
      setAppliedFlash("전기 결정세액 적용 완료");
      setTimeout(() => setAppliedFlash(null), 1500);
    });
  }

  function appendOtherIncomeMemo() {
    if (!data) return;
    const lines: string[] = [];
    if (data.freelanceSales) lines.push(`인적용역 사업소득 ${fmt(Number(data.freelanceSales))}원`);
    Object.entries(data.otherIncomeFlags || {}).forEach(([k, v]) => {
      if (v === "O") lines.push(`${FLAG_LABEL[k] ?? k} 소득 있음`);
    });
    if (lines.length === 0) return;
    const memoLine = `[안내문 ${taxYear}년] ${lines.join(", ")}`;
    startTransition(async () => {
      await applyNoticeAnalysis(clientId, taxYear, { memoAppend: memoLine });
      setAppliedFlash("메모에 추가됨");
      setTimeout(() => setAppliedFlash(null), 1500);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center pt-[6vh] px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#0F172A]/35 backdrop-blur-md" />

      <div
        className="relative w-full max-w-[760px] max-h-[88vh] flex flex-col overflow-hidden rounded-[28px]"
        style={{
          background: "rgba(255,255,255,0.78)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          boxShadow: "0 24px 60px -16px rgba(15,23,42,0.35), 0 8px 24px -8px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.6) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-7 pt-6 pb-4 border-b border-white/40">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11.5px] font-bold text-[#3182F6] uppercase tracking-[0.12em] mb-1.5">
                Notice Service · {taxYear}
              </div>
              <h2 className="text-[22px] font-bold text-[#191F28] tracking-tight truncate">
                {clientName}
                {ceoName && <span className="ml-2 text-[15px] font-medium text-[#6B7684]">· {ceoName}</span>}
              </h2>
              <div className="text-[12px] text-[#6B7684] mt-0.5">
                신고도움서비스 분석 결과를 시스템 데이터와 비교합니다
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-full bg-white/60 hover:bg-white text-[#6B7684] hover:text-[#191F28] text-xl leading-none flex items-center justify-center transition-all"
              style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.06)" }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          {/* 로딩 / 에러 / 분석 전 / 분석 후 */}
          {loading ? (
            <div className="py-16 text-center text-[#6B7684] text-sm">불러오는 중...</div>
          ) : !data ? (
            <div className="py-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3182F6] to-[#1B64DA] mb-3 shadow-lg shadow-[#3182F6]/30">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <div className="text-[15px] font-bold text-[#191F28] mb-1">아직 분석되지 않았습니다</div>
              <div className="text-[12.5px] text-[#6B7684] mb-5">
                구글드라이브에 업로드된 신고안내문 PDF를 AI가 분석합니다 (~5초)
              </div>
              {error && (
                <div className="mb-3 px-4 py-2.5 rounded-xl bg-[#FEF2F2] text-[#DC2626] text-[12.5px] inline-block">
                  {error}
                </div>
              )}
              <div>
                <button
                  onClick={() => runAnalyze(false)}
                  disabled={analyzing}
                  className="px-5 py-2.5 rounded-2xl bg-[#191F28] text-white text-[13px] font-bold hover:bg-black disabled:opacity-50 transition-all"
                  style={{ boxShadow: "0 8px 20px -6px rgba(15,23,42,0.4)" }}
                >
                  {analyzing ? "분석 중..." : "🔍 분석 시작"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 메타 정보 */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/70 text-[#4E5968] font-medium">
                  분석: {new Date(data.analyzedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                {data.reviewedByStaffAt && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#10B981]/15 text-[#059669] font-bold">
                    ✓ 직원 검토됨
                  </span>
                )}
                <button
                  onClick={() => runAnalyze(true)}
                  disabled={analyzing}
                  className="ml-auto text-[11px] px-2.5 py-1 rounded-full bg-white/70 text-[#6B7684] hover:bg-white hover:text-[#191F28] font-medium disabled:opacity-50"
                >
                  {analyzing ? "다시 분석 중..." : "↻ 재분석"}
                </button>
              </div>

              {/* 1. 핵심 비교: 유형 + 사업장 매출 + 전기 데이터 */}
              <Section title="시스템 ↔ 안내문 비교" icon="⚖">
                <CompareRow
                  label="신고 유형"
                  systemValue={systemFilingType ?? "-"}
                  noticeValue={noticeFiling ?? "-"}
                  match={filingMatch}
                  action={
                    !filingMatch && noticeFiling ? (
                      <ApplyButton onClick={applyFilingType} />
                    ) : null
                  }
                />
                <CompareRow
                  label="당기 사업장 매출 (부가세 신고분)"
                  systemValue={fmt(sysSales) + " 원"}
                  noticeValue={fmt(data.businessSales) + " 원"}
                  match={businessSalesMatch}
                  action={
                    businessSalesMatch === false && data.businessSales ? (
                      <ApplyButton onClick={applyCurrSales} />
                    ) : null
                  }
                />
                <CompareRow
                  label={`전기 매출 (${prevYear}년)`}
                  systemValue={fmt(sysPrevSales) + " 원"}
                  noticeValue={noticePrevSales ? fmt(noticePrevSales) + " 원" : "-"}
                  match={prevSalesMatch}
                  action={
                    prevSalesMatch === false && noticePrevSales ? (
                      <ApplyButton onClick={applyPrevSales} />
                    ) : null
                  }
                />
                <CompareRow
                  label={`전기 결정세액 (${prevYear}년)`}
                  systemValue={fmt(sysPrevTax) + " 원"}
                  noticeValue={noticePrevTax ? fmt(noticePrevTax) + " 원" : "-"}
                  match={prevTaxMatch}
                  action={
                    prevTaxMatch === false && noticePrevTax ? (
                      <ApplyButton onClick={applyPrevTax} />
                    ) : null
                  }
                />
              </Section>

              {/* 2. 합산 매출 — 그룹별 시각적 분리 + 비중 표시 */}
              <Section title="합산 사업소득" icon="∑" subtitle="종합소득세 신고 시 이 합산값으로 신고합니다">
                <CompositionView data={data} />
              </Section>

              {/* 3. AI 감면 판단 */}
              <Section title="AI 감면 판단" icon="🤖" subtitle="안내문의 업종코드 기반 자동 분석">
                <ReductionView reduction={reduction} />
              </Section>

              {/* 3. 타소득 합산대상 */}
              <Section title="타소득 합산대상" icon="◎" subtitle="이자/배당/근로/연금/기타 소득 유무">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Object.entries(FLAG_LABEL).map(([k, label]) => {
                    const v = data.otherIncomeFlags?.[k];
                    const has = v === "O";
                    return (
                      <div
                        key={k}
                        className={`px-3 py-2 rounded-xl text-center ${
                          has
                            ? "bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A] text-[#92400E] font-bold"
                            : "bg-white/50 text-[#B0B8C1]"
                        }`}
                        style={
                          has
                            ? { boxShadow: "0 2px 8px rgba(245,158,11,0.18), 0 0 0 1px rgba(245,158,11,0.25)" }
                            : { boxShadow: "0 0 0 1px rgba(229,232,235,0.7) inset" }
                        }
                      >
                        <div className="text-[10.5px] uppercase tracking-wider opacity-70">{label}</div>
                        <div className="text-[15px] font-bold mt-0.5">{has ? "있음" : "없음"}</div>
                      </div>
                    );
                  })}
                </div>
                {(data.hasOtherIncome || data.freelanceSales) && (
                  <div className="mt-3">
                    <button
                      onClick={appendOtherIncomeMemo}
                      className="w-full px-4 py-2.5 rounded-2xl bg-white/70 hover:bg-white text-[12.5px] font-bold text-[#191F28] transition-all"
                      style={{ boxShadow: "0 0 0 1px rgba(229,232,235,0.8) inset" }}
                    >
                      📋 타소득·인적용역 정보를 메모에 자동 추가
                    </button>
                  </div>
                )}
              </Section>

              {/* 4. 3년 추이 */}
              {data.incomeHistory.length > 0 && (
                <Section title="3년 신고 추이" icon="📈">
                  <div className="overflow-hidden rounded-2xl border border-white/40">
                    <table className="w-full text-[12px]">
                      <thead className="bg-white/60">
                        <tr className="text-[10.5px] uppercase tracking-wider text-[#6B7684]">
                          <th className="px-3 py-2 text-left">연도</th>
                          <th className="px-3 py-2 text-right">소득금액</th>
                          <th className="px-3 py-2 text-right">결정세액</th>
                          <th className="px-3 py-2 text-right">실효세율</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/40">
                        {data.incomeHistory.map((row) => (
                          <tr key={row.year} className="hover:bg-white/40">
                            <td className="px-3 py-2 font-bold text-[#191F28]">{row.year}년</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmt(row.totalIncome)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmt(row.decidedTax)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#6B7684]">
                              {row.effectiveRate !== null ? `${row.effectiveRate}%` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        {data && (
          <div className="px-7 py-4 border-t border-white/40 bg-white/30 flex items-center justify-between">
            <div className="text-[11.5px] text-[#6B7684]">
              {appliedFlash ? (
                <span className="text-[#059669] font-bold">✓ {appliedFlash}</span>
              ) : (
                "값을 적용하거나 그대로 참고만 사용해도 됩니다"
              )}
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-2xl bg-[#191F28] text-white text-[13px] font-bold hover:bg-black"
              style={{ boxShadow: "0 8px 20px -6px rgba(15,23,42,0.4)" }}
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-baseline gap-2 mb-2.5 px-1">
        {icon && <span className="text-[15px]">{icon}</span>}
        <span className="text-[13px] font-bold text-[#191F28]">{title}</span>
        {subtitle && <span className="text-[11px] text-[#8B95A1]">{subtitle}</span>}
      </div>
      <div
        className="rounded-2xl p-3 space-y-1"
        style={{
          background: "rgba(255,255,255,0.55)",
          boxShadow: "0 0 0 1px rgba(229,232,235,0.6) inset, 0 2px 12px -4px rgba(15,23,42,0.06)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ApplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] px-3 py-1 rounded-full bg-[#3182F6] text-white font-bold hover:bg-[#1B64DA] transition-all whitespace-nowrap"
      style={{ boxShadow: "0 4px 10px -2px rgba(49,130,246,0.35)" }}
    >
      → 적용
    </button>
  );
}

function CompareRow({
  label,
  systemValue,
  noticeValue,
  match,
  action,
}: {
  label: string;
  systemValue: string;
  noticeValue: string;
  match: boolean | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/40 transition-colors">
      <div>
        <div className="text-[10.5px] text-[#8B95A1] uppercase tracking-wider mb-0.5">{label}</div>
        <div className="text-[12.5px] text-[#4E5968]">시스템 입력값</div>
        <div className="text-[14px] font-bold text-[#191F28] tabular-nums">{systemValue}</div>
      </div>
      <div>
        <div className="text-[10.5px] text-[#8B95A1] uppercase tracking-wider mb-0.5 text-right">
          {match === true ? "✓ 일치" : match === false ? "⚠ 차이" : ""}
        </div>
        <div className="text-[12.5px] text-[#4E5968] text-right">안내문</div>
        <div
          className={`text-[14px] font-bold tabular-nums text-right ${
            match === false ? "text-[#3182F6]" : "text-[#191F28]"
          }`}
        >
          {noticeValue}
        </div>
      </div>
      <div className="flex items-center">{action}</div>
    </div>
  );
}

function ReductionView({ reduction }: { reduction: ReductionInfo }) {
  if (!reduction) {
    return (
      <div className="px-3 py-3 text-[12px] text-[#8B95A1]">
        업종코드를 추출하지 못했습니다. [↻ 재분석] 후 다시 확인해 주세요.
      </div>
    );
  }
  if (!reduction.found) {
    return (
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/70 text-[#6B7684] font-bold">
            업종코드 {reduction.bizCode}
          </span>
        </div>
        <div className="text-[12px] text-[#8B95A1]">
          감면 코드 테이블에 등록되지 않은 업종입니다. 직접 확인이 필요합니다.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#F5F9FF] text-[#3182F6] font-bold">
          업종코드 {reduction.bizCode}
        </span>
        <span className="text-[10.5px] text-[#8B95A1]">DB 매칭 OK</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ReductionCard label="창업중소기업감면" status={reduction.startupReduction} />
        <ReductionCard label="중소기업특별세액감면" status={reduction.smeReduction} />
      </div>
      <div className="text-[10.5px] text-[#8B95A1] mt-2.5 px-1 leading-relaxed">
        ※ 업종코드 매핑 결과로, 실제 적용은 사업개시일·기업규모·연령·지역 등 추가 조건 확인 필요
      </div>
    </div>
  );
}

function ReductionCard({ label, status }: { label: string; status: string | null }) {
  const isYes = status === "O";
  const isNo = status === "X";
  const isUnknown = !isYes && !isNo;

  return (
    <div
      className={`rounded-2xl p-3 transition-all`}
      style={
        isYes
          ? {
              background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))",
              boxShadow: "0 0 0 1px rgba(16,185,129,0.3) inset, 0 4px 12px -4px rgba(16,185,129,0.2)",
            }
          : isNo
          ? {
              background: "rgba(255,255,255,0.55)",
              boxShadow: "0 0 0 1px rgba(229,232,235,0.7) inset",
            }
          : {
              background: "rgba(255,255,255,0.4)",
              boxShadow: "0 0 0 1px rgba(229,232,235,0.6) inset",
            }
      }
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className={`text-[11.5px] font-bold ${isYes ? "text-[#059669]" : isNo ? "text-[#6B7684]" : "text-[#B0B8C1]"}`}>
          {label}
        </div>
        <div
          className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${
            isYes
              ? "bg-[#10B981] text-white"
              : isNo
              ? "bg-white text-[#B0B8C1] border border-[#E5E8EB]"
              : "bg-white/60 text-[#B0B8C1] border border-[#E5E8EB]"
          }`}
          style={isYes ? { boxShadow: "0 2px 6px rgba(16,185,129,0.4)" } : undefined}
        >
          {isYes ? "✓" : isNo ? "·" : "?"}
        </div>
      </div>
      <div className={`text-[15px] font-bold tracking-tight ${isYes ? "text-[#059669]" : isNo ? "text-[#6B7684]" : "text-[#B0B8C1]"}`}>
        {isYes ? "대상" : isNo ? "비대상" : "정보 없음"}
      </div>
    </div>
  );
}

function CompositionView({ data }: { data: Analysis }) {
  const business = Number(data.businessSales ?? 0);
  const taxCredit = Number(data.raw?.currYearTaxCreditSales ?? 0);
  const cardCredit = Number(data.raw?.currYearCardCreditSales ?? 0);
  const otherBiz = Number(data.raw?.currYearOtherBusinessSales ?? 0);
  const businessGroupTotal = business + taxCredit + cardCredit + otherBiz;
  const freelance = Number(data.freelanceSales ?? 0);
  const total = Number(data.totalSales ?? businessGroupTotal + freelance);
  const businessPct = total > 0 ? (businessGroupTotal / total) * 100 : 0;
  const freelancePct = total > 0 ? (freelance / total) * 100 : 0;

  const subItems: { label: string; value: number; src: string }[] = [];
  if (taxCredit) subItems.push({ label: "전자신고세액공제 등", value: taxCredit, src: "안내문 1p · 사업장별 수입금액" });
  if (cardCredit) subItems.push({ label: "신용카드매출전표 등 발행세액공제", value: cardCredit, src: "안내문 1p · 사업장별 수입금액" });
  if (otherBiz) subItems.push({ label: "기타 사업장 관련", value: otherBiz, src: "안내문 1p" });

  return (
    <div className="space-y-2.5">
      {/* 사업장 그룹 */}
      <div
        className="rounded-2xl p-3"
        style={{
          background: "linear-gradient(180deg, rgba(49,130,246,0.06), rgba(49,130,246,0.02))",
          boxShadow: "0 0 0 1px rgba(49,130,246,0.15) inset",
        }}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3182F6]" />
            <span className="text-[11.5px] font-bold text-[#3182F6] uppercase tracking-wider">사업장 소득</span>
          </div>
          <span className="text-[10.5px] font-bold text-[#3182F6] tabular-nums">{businessPct.toFixed(1)}%</span>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-baseline justify-between px-2 py-1.5">
            <div>
              <div className="text-[12.5px] text-[#191F28] font-medium">부가가치세 업종별 수입금액</div>
              <div className="text-[10px] text-[#8B95A1] mt-0.5">위하고/홈택스에서 입력한 매출과 동일 기준</div>
            </div>
            <div className="text-[14px] font-bold text-[#191F28] tabular-nums">
              {fmt(business)} <span className="text-[10.5px] text-[#8B95A1] font-medium">원</span>
            </div>
          </div>
          {subItems.map((it) => (
            <div key={it.label} className="flex items-baseline justify-between px-2 py-1 pl-7">
              <div>
                <div className="text-[12px] text-[#6B7684]">└ {it.label}</div>
                <div className="text-[9.5px] text-[#B0B8C1] mt-0.5">{it.src}</div>
              </div>
              <div className="text-[12.5px] text-[#6B7684] tabular-nums">
                +{fmt(it.value)} <span className="text-[10px] text-[#B0B8C1]">원</span>
              </div>
            </div>
          ))}
          {subItems.length > 0 && (
            <div className="flex items-baseline justify-between px-2 py-1.5 mt-1 border-t border-[#3182F6]/15">
              <div className="text-[11.5px] font-bold text-[#3182F6]">사업장 합계</div>
              <div className="text-[13px] font-bold text-[#3182F6] tabular-nums">
                {fmt(businessGroupTotal)} <span className="text-[10.5px] font-medium">원</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 인적용역 그룹 (값 있을 때만) */}
      {freelance > 0 && (
        <div
          className="rounded-2xl p-3"
          style={{
            background: "linear-gradient(180deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))",
            boxShadow: "0 0 0 1px rgba(245,158,11,0.2) inset",
          }}
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
              <span className="text-[11.5px] font-bold text-[#92400E] uppercase tracking-wider">기타 사업소득</span>
            </div>
            <span className="text-[10.5px] font-bold text-[#92400E] tabular-nums">{freelancePct.toFixed(1)}%</span>
          </div>
          <div className="flex items-baseline justify-between px-2 py-1.5">
            <div>
              <div className="text-[12.5px] text-[#191F28] font-medium">인적용역 (프리랜서) 사업소득</div>
              <div className="text-[10px] text-[#8B95A1] mt-0.5">다른 사업자가 발급한 사업소득 지급명세서 합산</div>
            </div>
            <div className="text-[14px] font-bold text-[#92400E] tabular-nums">
              {fmt(freelance)} <span className="text-[10.5px] text-[#92400E]/70 font-medium">원</span>
            </div>
          </div>
        </div>
      )}

      {/* 비중 미니 막대 */}
      {total > 0 && (
        <div className="px-2 py-1">
          <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: "rgba(229,232,235,0.5)" }}>
            <div
              className="h-full"
              style={{
                width: `${businessPct}%`,
                background: "linear-gradient(90deg, #3182F6, #1B64DA)",
              }}
            />
            {freelancePct > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${freelancePct}%`,
                  background: "linear-gradient(90deg, #F59E0B, #D97706)",
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* 총 합계 */}
      <div
        className="rounded-2xl p-4 mt-1"
        style={{
          background: "linear-gradient(135deg, #191F28, #2D3748)",
          boxShadow: "0 12px 28px -8px rgba(15,23,42,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset",
        }}
      >
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10.5px] text-white/60 uppercase tracking-[0.12em] font-bold">Total · 종합소득세 신고용</div>
            <div className="text-[12.5px] text-white/90 font-medium mt-0.5">총 합산 사업소득</div>
          </div>
          <div className="text-right">
            <div className="text-[20px] font-bold text-white tabular-nums leading-none">
              {fmt(total)}
            </div>
            <div className="text-[11px] text-white/60 mt-1">원</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  bold,
  emphasize,
  diff,
  indent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  emphasize?: boolean;
  diff?: number | null;
  indent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/40 transition-colors ${indent ? "pl-7" : ""}`}>
      <div className={`text-[12.5px] ${bold ? "font-bold text-[#191F28]" : indent ? "text-[#8B95A1]" : "text-[#4E5968]"}`}>
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <div
          className={`tabular-nums ${
            bold ? "text-[16px] font-bold text-[#191F28]" : emphasize ? "text-[14px] font-bold text-[#3182F6]" : indent ? "text-[12.5px] text-[#6B7684]" : "text-[13.5px] text-[#191F28]"
          }`}
        >
          {value} <span className="text-[11px] text-[#8B95A1] font-medium">원</span>
        </div>
        {diff !== null && diff !== undefined && (
          <span className="text-[11px] font-bold text-[#3182F6]">+{fmt(diff)}</span>
        )}
      </div>
    </div>
  );
}
