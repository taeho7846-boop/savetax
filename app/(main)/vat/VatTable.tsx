"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setVatStage, toggleVatCheck, setVatCheckValue, setVatNoticeTax, setVatFee, toggleVatExcluded, setVatMemo, type VatStage } from "@/app/actions/vat";
import { VatRejectModal } from "./VatRejectModal";

// 홈택스 부가세 신고자료 업로드 데이터 (모든 금액은 공급가액 기준)
type HtxData = {
  v: number;
  bizType: string;
  taxationType: string;
  sales: { ti: number; tiVat: number; inv: number; card: number; cardGross: number; cardNontax: number; cash: number; cashVat: number; zeropay: number; zeropayGross: number; online: number; onlineGross: number; export: number; supplyTotal: number };
  buy: { ti: number; tiVat: number; inv: number; card: number; cardVat: number; cash: number; cashVat?: number; freight: number; freightVat?: number; cardAll?: number; cardAllVat?: number; cashAll?: number; cashAllVat?: number; freightAll?: number; freightAllVat?: number; supplyTotal: number };
  notice: { target: string; amount: number; excludeReason: string; filingDuty: string; prevSupply: number };
  collect: string | null;
  sheetTitle?: string;
};

type ImportResult = {
  ok: boolean;
  sheetTitle: string;
  periodWarning: string | null;
  totalRows: number;
  matchedCount: number;
  autoCheckedCount: number;
  unmatchedCount: number;
  unmatched: { name: string; biz: string; manager: string }[];
  collectErrors: { name: string; biz: string }[];
  collectErrorCount: number;
};

type Rec = {
  stage: VatStage;
  checklist: Record<string, boolean>;
  fee: number | null;
  noticeTax: number | null;
  excluded: boolean;
  memo: string | null;
  htx: HtxData | null;
  rejectionCount: number;
  lastRejectedAt: Date | string | null;
};

type ClientRow = {
  id: number;
  name: string;
  bizNumber: string | null;
  ceoName: string | null;
  clientType: string;
  taxationType: string | null;
  vatTypeDetail: string | null;
  assignedUserName: string | null;
  record: { stage: string; checklist: string | null; fee: number | null; noticeTax: number | null; excluded: boolean; memo: string | null; htxData: string | null; htxImportedAt: Date | string | null; rejectionCount: number; lastRejectedAt: Date | string | null } | null;
};

interface Props {
  clients: ClientRow[];
  period: string;
  activeTab: "bookkeeping" | "single";
  showAssignedUser: boolean;
}

const STAGES: { key: VatStage; label: string; color: string; tint: string }[] = [
  { key: "collect",  label: "자료수집",  color: "#92400E", tint: "#FEF3C7" },
  { key: "writing",  label: "작성중",    color: "#1B64DA", tint: "#E8F3FF" },
  { key: "approval", label: "결재",      color: "#B45309", tint: "#FEF3C7" },
  { key: "confirm",  label: "컨펌+보수", color: "#7C3AED", tint: "#F5E8FF" },
  { key: "done",     label: "신고완료",  color: "#15803D", tint: "#E7F7EE" },
];
const STAGE_INDEX: Record<VatStage, number> = { collect: 0, writing: 1, approval: 2, confirm: 3, done: 4 };

// 단계별 체크리스트 (그룹 + 항목). 보수는 confirm 단계에서 별도 입력.
const CHECKLIST: Record<VatStage, { group?: string; items: { key: string; label: string }[] }[]> = {
  collect: [
    { group: "1단계", items: [
      { key: "card_request", label: "카드수집요청" },
    ] },
    { group: "2단계", items: [
      { key: "card_register", label: "카드등록" },
      { key: "card_excel", label: "카드엑셀자료 수취" },
      { key: "no_response", label: "무응답" },
    ] },
  ],
  writing: [
    { group: "매출", items: [
      { key: "sales_tax_invoice", label: "세금계산서" },
      { key: "sales_invoice", label: "계산서" },
      { key: "sales_card", label: "신용카드" },
      { key: "sales_cash", label: "현금영수증" },
      { key: "sales_pg", label: "PG" },
    ] },
    { group: "매입", items: [
      { key: "buy_rent", label: "임차료" },
      { key: "buy_telecom", label: "통신비" },
      { key: "buy_car_deduct", label: "차량유지비(공제)" },
      { key: "buy_car_nondeduct", label: "차량유지비(불공제)" },
    ] },
  ],
  approval: [],
  confirm: [],
  done: [],
};

const TAXATION_CHIP: Record<string, string> = {
  "과세": "border-[#3182F6] text-[#1B64DA] bg-[#F5F9FF] font-bold",
  "간이": "border-[#FDE68A] text-[#92400E] bg-[#FFFBEB]",
  "간이(세금계산서발행)": "border-[#FDE68A] text-[#92400E] bg-[#FFFBEB]",
  "상가임대업": "border-[#99F6E4] text-[#0F766E] bg-[#F0FDFA]",
};

function fmtWon(n: number) { return n.toLocaleString("ko-KR") + "원"; }
/** 홈택스 '과세유형 상세' 문구 파싱 → 유형 뱃지 + 전환 정보 */
function parseVatTypeDetail(raw: string) {
  const abbr = (t: string) =>
    t.replace(/부가가치세\s*/g, "").replace(/간이과세자\(세금계산서\s*발급사업자\)/g, "간이(세금계산서발행)").replace(/간이과세자/g, "간이").replace(/일반과세자/g, "일반").replace(/면세사업자/g, "면세").trim();
  const isClosed = raw.includes("폐업자");
  const closedDate = raw.match(/폐업일자\s*:?\s*([\d.-]+)/)?.[1] ?? null;
  let label: string, bg: string, text: string;
  if (isClosed) { label = "폐업"; bg = "#FEF2F2"; text = "#DC2626"; }
  else if (raw.includes("간이과세자(세금계산서")) { label = "간이(세금계산서발행)"; bg = "#FEF3C7"; text = "#B45309"; }
  else if (raw.includes("간이과세자")) { label = "간이과세자"; bg = "#FEF3C7"; text = "#B45309"; }
  else if (raw.includes("일반과세자")) { label = "일반과세자"; bg = "#E8F3FF"; text = "#1B64DA"; }
  else if (raw.includes("면세사업자")) { label = "면세사업자"; bg = "#F0FDFA"; text = "#0F766E"; }
  else { label = abbr(raw).slice(0, 16); bg = "#F2F4F6"; text = "#4E5968"; }
  const m = raw.match(/(\d{4})년\s*(\d{2})월\s*(\d{2})일\s*(.*?)에서\s*(.*?)(?:으로|로)\s*전환/);
  let trans: { date: string; from: string; to: string; recent: boolean } | null = null;
  if (m) {
    const date = `${m[1]}.${m[2]}.${m[3]}`;
    // 최근 2년 내 전환만 강조 (신고 시 주의 필요), 오래된 전환은 회색으로
    const recent = Date.now() - new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime() < 730 * 24 * 3600 * 1000;
    trans = { date, from: abbr(m[4]), to: abbr(m[5]), recent };
  }
  return { label, bg, text, isClosed, closedDate, trans };
}
function normStage(s: string | undefined): VatStage { return (STAGES.some(st => st.key === s) ? s : "collect") as VatStage; }
function parseChecklist(s: string | null | undefined): Record<string, boolean> {
  if (!s) return {};
  try { return JSON.parse(s) as Record<string, boolean>; } catch { return {}; }
}
function parseHtx(s: string | null | undefined): HtxData | null {
  if (!s) return null;
  try { return JSON.parse(s) as HtxData; } catch { return null; }
}
function stageItemKeys(stage: VatStage): string[] {
  return CHECKLIST[stage].flatMap(g => g.items.map(i => i.key));
}

function buildMap(clients: ClientRow[], activeTab: string): Map<number, Rec> {
  const m = new Map<number, Rec>();
  for (const c of clients) {
    m.set(c.id, {
      stage: normStage(c.record?.stage),
      checklist: parseChecklist(c.record?.checklist),
      fee: c.record?.fee ?? (activeTab === "bookkeeping" ? 0 : null),
      noticeTax: c.record?.noticeTax ?? null,
      excluded: c.record?.excluded ?? false,
      memo: c.record?.memo ?? null,
      htx: parseHtx(c.record?.htxData),
      rejectionCount: c.record?.rejectionCount ?? 0,
      lastRejectedAt: c.record?.lastRejectedAt ?? null,
    });
  }
  return m;
}

/** 사업자등록번호 복사 버튼 (HTTPS 아닌 환경 fallback 포함) */
function CopyBizBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = value; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* 무시 */ }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).catch(fallback);
    else fallback();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="사업자등록번호 복사"
      className={`inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors ${
        copied ? "bg-[#E7F7EE] text-[#15803D]" : "bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E8F3FF] hover:text-[#3182F6]"
      }`}
    >
      {copied ? "✓ 복사됨" : value}
      {!copied && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

/**
 * 예상세액 추정 (일반과세자만). 어디까지나 참고용.
 * 매출세액 − 매입세액 − 신용카드발행세액공제(개인만) − 예정고지세액(확정 시 기납부)
 * best=true: 카드·현금·화물 매입을 "전체"(공제대상 외 포함)로 반영 → 베스트예상세액
 */
function estimateVat(htx: HtxData, isCorp: boolean, isConfirm: boolean, best = false) {
  if (htx.taxationType !== "과세") return null; // 간이·면세·폐업 등은 계산구조가 달라 제외
  const s = htx.sales, b = htx.buy;
  // 매출세액: 실제 세액(세계·현금) + 카드/PG/제로페이(공급가액×10%)
  const salesVat = (s.tiVat || 0) + (s.cashVat || 0) + Math.round(((s.card || 0) + (s.zeropay || 0) + (s.online || 0)) * 0.1);
  // 매입세액. 전체 세액은 공급가액×10%가 아니라 실제 세액 컬럼 사용. 구버전 업로드(전체 없음)는 공제 기준으로 폴백.
  const cardVat = best ? (b.cardAllVat ?? b.cardVat ?? 0) : (b.cardVat ?? Math.round((b.card || 0) * 0.1));
  const cashVat = best ? (b.cashAllVat ?? b.cashVat ?? Math.round((b.cash || 0) * 0.1)) : (b.cashVat ?? Math.round((b.cash || 0) * 0.1));
  const freightVat = best ? (b.freightAllVat ?? b.freightVat ?? Math.round((b.freight || 0) * 0.1)) : (b.freightVat ?? Math.round((b.freight || 0) * 0.1));
  const buyVat = (b.tiVat || 0) + cardVat + cashVat + freightVat; // 계산서매입(면세) 제외
  // 신용카드발행세액공제: 개인사업자만. (신용카드 + 현금영수증 + PG, 전부 공급대가) × 1.3%
  const isIndiv = htx.bizType ? htx.bizType !== "법인" : !isCorp;
  const cardBase = (s.cardGross || 0) + (s.cash || 0) + (s.cashVat || 0) + (s.onlineGross || 0) + (s.zeropayGross || 0);
  const cardCredit = isIndiv ? Math.round(cardBase * 0.013) : 0;
  const prepaid = isConfirm ? (htx.notice?.amount || 0) : 0; // 확정신고 시 예정고지 기납부 차감
  const est = salesVat - buyVat - cardCredit - prepaid;
  return { est, salesVat, buyVat, cardCredit, prepaid };
}

/** 홈택스 업로드 자료 표시 (매출·매입 공급가액 / 예정고지 / 예상세액) */
function HtxSummary({ htx, isCorp, isConfirm }: { htx: HtxData | null; isCorp: boolean; isConfirm: boolean }) {
  if (!htx) return <span className="text-[11px] text-[#B0B8C1]">자료 없음</span>;
  const s = htx.sales, b = htx.buy, n = htx.notice;
  const won = (v: number) => v.toLocaleString("ko-KR");
  const est = estimateVat(htx, isCorp, isConfirm);
  const estBest = estimateVat(htx, isCorp, isConfirm, true);
  const hasBestData = (b.cardAllVat ?? 0) > 0 || (b.cashAllVat ?? 0) > 0 || (b.freightAllVat ?? 0) > 0;
  const saleEtc = (s.zeropay ?? 0) + (s.online ?? 0) + (s.export ?? 0);
  const part = (label: string, v: number, color: string) =>
    v > 0 ? <span className="whitespace-nowrap" style={{ color }}>{label} {won(v)}</span> : null;
  const isNoticeTarget = n.target === "여";
  return (
    <div className="flex flex-col gap-1.5 min-w-[230px]">
      {/* 매출 */}
      <div className="rounded-lg bg-[#F5F9FF]/70 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-bold text-[#1B64DA]">매출 공급가액</span>
          <span className="text-[13px] font-extrabold text-[#191F28]">{won(s.supplyTotal)}</span>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[#6B7684] mt-0.5 leading-tight">
          {part("세계", s.ti, "#1B64DA")}
          {part("카드", s.card, "#6B7684")}
          {part("현금", s.cash, "#6B7684")}
          {part("계산서", s.inv, "#0F766E")}
          {part("기타", saleEtc, "#6B7684")}
        </div>
      </div>
      {/* 매입 */}
      <div className="rounded-lg bg-[#F9FAFB] px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-bold text-[#92400E]">매입 공급가액</span>
          <span className="text-[13px] font-extrabold text-[#191F28]">{won(b.supplyTotal)}</span>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[#6B7684] mt-0.5 leading-tight">
          {part("세계", b.ti, "#92400E")}
          {part("계산서", b.inv, "#0F766E")}
          {part("카드", b.card, "#6B7684")}
          {part("현금", b.cash, "#6B7684")}
          {part("화물", b.freight, "#6B7684")}
        </div>
      </div>
      {/* 예정고지 + 수집상태 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 ${isNoticeTarget ? "bg-[#F5E8FF] text-[#6D28D9]" : "bg-[#F2F4F6] text-[#8B95A1]"}`}>
          예정고지 {isNoticeTarget ? "대상" : "비대상"}
        </span>
        {isNoticeTarget && n.amount > 0 && <span className="text-[11px] font-bold text-[#6D28D9]">{won(n.amount)}원</span>}
        {!isNoticeTarget && n.excludeReason && n.excludeReason !== "없음" && (
          <span className="text-[10px] text-[#B0B8C1]">{n.excludeReason}</span>
        )}
        {htx.collect === "오류" && (
          <span className="text-[10px] font-bold text-[#DC2626] bg-[#FEF2F2] rounded-md px-1.5 py-0.5">⚠ 수집오류</span>
        )}
      </div>
      {/* 예상세액 (참고용 추정) */}
      {est ? (
        <div className={`rounded-lg px-2 py-1.5 ${est.est >= 0 ? "bg-[#FFF7ED]" : "bg-[#ECFDF5]"}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold text-[#92400E]" title="매출세액 − 매입세액 − 신용카드발행세액공제(개인 1.3%) − 예정고지(확정 시). 간이·면세 제외, 의제매입·각종공제·한도 미반영. 참고용 추정치입니다.">
              예상세액 <span className="text-[#B0B8C1] font-medium">참고 ⓘ</span>
            </span>
            <span className={`text-[13px] font-extrabold ${est.est >= 0 ? "text-[#C2410C]" : "text-[#047857]"}`}>
              {est.est >= 0 ? `${won(est.est)}원` : `환급 ${won(-est.est)}원`}
            </span>
          </div>
          <div className="text-[10px] text-[#8B95A1] mt-0.5 leading-tight">
            매출 {won(est.salesVat)} − 매입 {won(est.buyVat)}
            {est.cardCredit > 0 ? ` − 카드공제 ${won(est.cardCredit)}` : ""}
            {est.prepaid > 0 ? ` − 예정고지 ${won(est.prepaid)}` : ""}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-[#B0B8C1]">예상세액: 일반과세만 추정 ({htx.taxationType || "유형미상"})</div>
      )}
      {/* 베스트예상세액 (카드·현금·화물 매입 전체 반영) */}
      {estBest && (
        <div className={`rounded-lg px-2 py-1.5 border ${estBest.est >= 0 ? "bg-[#FFFBEB] border-[#FDE68A]" : "bg-[#ECFDF5] border-[#A7F3D0]"}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold text-[#B45309]" title="카드·현금영수증·화물복지카드 매입을 '공제대상'이 아닌 '전체'로 반영한 추정. 실무에서 카드내역을 최대한 반영하는 경우. 불공제분이 섞여 있을 수 있어 실제와 차이날 수 있습니다.">
              ⭐ 베스트예상세액 <span className="text-[#B0B8C1] font-medium">전체매입 ⓘ</span>
            </span>
            <span className={`text-[13px] font-extrabold ${estBest.est >= 0 ? "text-[#B45309]" : "text-[#047857]"}`}>
              {estBest.est >= 0 ? `${won(estBest.est)}원` : `환급 ${won(-estBest.est)}원`}
            </span>
          </div>
          <div className="text-[10px] text-[#8B95A1] mt-0.5 leading-tight">
            매출 {won(estBest.salesVat)} − 매입 {won(estBest.buyVat)}
            {estBest.cardCredit > 0 ? ` − 카드공제 ${won(estBest.cardCredit)}` : ""}
            {estBest.prepaid > 0 ? ` − 예정고지 ${won(estBest.prepaid)}` : ""}
          </div>
          {!hasBestData && <div className="text-[10px] text-[#C2410C] mt-0.5">※ 전체매입 데이터 없음 — 엑셀 재업로드 시 반영됩니다</div>}
        </div>
      )}
    </div>
  );
}

export function VatTable({ clients, period, activeTab, showAssignedUser }: Props) {
  const router = useRouter();
  const [recMap, setRecMap] = useState<Map<number, Rec>>(() => buildMap(clients, activeTab));
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<VatStage | null>(null);

  // 담당자 필터 (관리자 화면에서만 노출)
  const [assignFilter, setAssignFilter] = useState<string[]>([]);
  const [assignFilterOpen, setAssignFilterOpen] = useState(false);
  const assignFilterRef = useRef<HTMLDivElement>(null);
  const assignOptions = [...new Set(clients.map(c => c.assignedUserName).filter(Boolean))] as string[];

  // 홈택스 자료 업로드
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // 결재 반려 모달 대상 (readOnly: 사유 확인 전용)
  const [rejectTarget, setRejectTarget] = useState<{ clientId: number; clientName: string; readOnly?: boolean } | null>(null);

  // 마지막 업로드 시각
  const lastImport = clients.reduce<Date | null>((acc, c) => {
    const t = c.record?.htxImportedAt ? new Date(c.record.htxImportedAt) : null;
    return t && (!acc || t > acc) ? t : acc;
  }, null);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("period", period);
      const res = await fetch("/api/vat/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "업로드에 실패했습니다."); return; }
      setImportResult(data as ImportResult);
      router.refresh();
    } catch (err) {
      alert("업로드 중 오류가 발생했습니다.\n\n" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  }

  // 신고리스트관리 엑셀 업로드 (과세유형 상세)
  const taxTypeFileRef = useRef<HTMLInputElement>(null);
  const [taxTypeUploading, setTaxTypeUploading] = useState(false);

  async function onTaxTypeFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setTaxTypeUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/vat/import-taxtype", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "업로드에 실패했습니다."); return; }
      const unmatchedMsg = data.unmatchedCount > 0
        ? `\n\n매칭 안 된 거래처 ${data.unmatchedCount}건:\n` + data.unmatched.map((u: { name: string; biz: string }) => `· ${u.name} (${u.biz || "사업자번호 없음"})`).join("\n")
        : "";
      alert(`✅ 과세유형 상세 업로드 완료${data.sheetTitle ? ` — ${data.sheetTitle}` : ""}\n\n반영된 거래처: ${data.updatedCount}건${unmatchedMsg}`);
      router.refresh();
    } catch (err) {
      alert("업로드 중 오류가 발생했습니다.\n\n" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTaxTypeUploading(false);
    }
  }

  useEffect(() => { setRecMap(buildMap(clients, activeTab)); }, [clients, activeTab]);

  // 담당자 필터 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (assignFilterRef.current && !assignFilterRef.current.contains(e.target as Node)) setAssignFilterOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function getRec(id: number): Rec {
    return recMap.get(id) ?? { stage: "collect", checklist: {}, fee: activeTab === "bookkeeping" ? 0 : null, noticeTax: null, excluded: false, memo: null, htx: null, rejectionCount: 0, lastRejectedAt: null };
  }
  function update(id: number, patch: Partial<Rec>) {
    setRecMap(prev => { const n = new Map(prev); n.set(id, { ...getRec(id), ...patch }); return n; });
  }
  // 서버 저장을 확실히 await + 실패 시 알림 (fire-and-forget 으로 조용히 누락되는 것 방지)
  function save(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        console.error("[VAT 저장 실패]", e);
        alert("저장에 실패했습니다. 새로고침 후 다시 시도해주세요.\n\n" + (e instanceof Error ? e.message : String(e)));
      }
    });
  }

  function moveStage(clientId: number, dir: 1 | -1) {
    const cur = STAGE_INDEX[getRec(clientId).stage];
    const next = STAGES[Math.max(0, Math.min(STAGES.length - 1, cur + dir))].key;
    update(clientId, { stage: next });
    save(() => setVatStage(clientId, period, next));
  }
  function toggleCheck(clientId: number, key: string) {
    const r = getRec(clientId);
    update(clientId, { checklist: { ...r.checklist, [key]: !r.checklist[key] } });
    save(() => toggleVatCheck(clientId, period, key));
  }
  function setCheckVal(clientId: number, key: string, value: boolean) {
    const r = getRec(clientId);
    update(clientId, { checklist: { ...r.checklist, [key]: value } });
    save(() => setVatCheckValue(clientId, period, key, value));
  }
  function changeNoticeTax(clientId: number, value: string) {
    const num = value.trim() === "" ? null : parseInt(value.replace(/[^0-9]/g, ""), 10);
    update(clientId, { noticeTax: Number.isNaN(num as number) ? null : num });
  }
  function commitNoticeTax(clientId: number) { save(() => setVatNoticeTax(clientId, period, getRec(clientId).noticeTax)); }
  function toggleExcluded(clientId: number) {
    update(clientId, { excluded: !getRec(clientId).excluded });
    save(() => toggleVatExcluded(clientId, period));
  }
  function changeFee(clientId: number, value: string) {
    const num = value.trim() === "" ? null : parseInt(value.replace(/[^0-9]/g, ""), 10);
    update(clientId, { fee: Number.isNaN(num as number) ? null : num });
  }
  function commitFee(clientId: number) { save(() => setVatFee(clientId, period, getRec(clientId).fee)); }
  function changeMemo(clientId: number, value: string) { update(clientId, { memo: value }); }
  function commitMemo(clientId: number) { save(() => setVatMemo(clientId, period, getRec(clientId).memo ?? "")); }
  // 매출 불일치 알림 끄기 (체크는 유지, 알림만 확인 처리)
  function dismissSalesMismatch(clientId: number, keys: string[]) {
    const r = getRec(clientId);
    const next = { ...r.checklist };
    for (const k of keys) next[`mismatch_ack_${k}`] = true;
    update(clientId, { checklist: next });
    save(async () => { for (const k of keys) await setVatCheckValue(clientId, period, `mismatch_ack_${k}`, true); });
  }

  const qt = q.trim();
  const searched = clients.filter(c => {
    if (qt && !(c.name.includes(qt) || (c.ceoName ?? "").includes(qt))) return false;
    if (assignFilter.length > 0 && !assignFilter.includes(c.assignedUserName || "")) return false;
    return true;
  });
  const active = searched.filter(c => !getRec(c.id).excluded);
  const excluded = searched.filter(c => getRec(c.id).excluded);

  const stageCounts: Record<VatStage, number> = { collect: 0, writing: 0, approval: 0, confirm: 0, done: 0 };
  for (const c of active) stageCounts[getRec(c.id).stage]++;

  const shown = stageFilter ? active.filter(c => getRec(c.id).stage === stageFilter) : active;
  const feeSum = active.reduce((s, c) => s + (getRec(c.id).fee ?? 0), 0);

  const isPrelim = period.endsWith("예정"); // 1·2기 예정 기간
  const isConfirm = period.endsWith("확정"); // 확정신고 (예정고지 기납부 차감)

  // 예상세액 합계 (참고용) — 일반과세 + 홈택스 자료 있는 대상만
  const estTotal = active.reduce((sum, c) => {
    const h = getRec(c.id).htx;
    if (!h) return sum;
    const e = estimateVat(h, c.clientType === "corporate", isConfirm);
    return sum + (e ? e.est : 0);
  }, 0);
  const estBestTotal = active.reduce((sum, c) => {
    const h = getRec(c.id).htx;
    if (!h) return sum;
    const e = estimateVat(h, c.clientType === "corporate", isConfirm, true);
    return sum + (e ? e.est : 0);
  }, 0);
  const colCount = 1 + (showAssignedUser ? 1 : 0) + 5; // 거래처+[담당자]+홈택스자료+체크리스트+메모+제외+진행

  function row(client: ClientRow, dim: boolean) {
    const r = getRec(client.id);
    const cur = STAGE_INDEX[r.stage];
    const meta = STAGES[cur];
    const isCorp = client.clientType === "corporate";
    // 예정 처리: report_notice 토글값 우선, 미설정 시에만 추정(개인=예정고지, 법인=예정신고)
    const rn = r.checklist["report_notice"];
    const isNotice = rn === undefined ? !isCorp : rn; // true=예정고지(확정 6개월) / false=예정신고(확정 3개월)
    const isPrelimNotice = isPrelim && isNotice; // 예정 기간 + 예정고지형 = 신고 불필요
    const isCorpCollect = r.stage === "collect" && isCorp;
    const keys = isCorpCollect ? [] : stageItemKeys(r.stage);
    const doneN = keys.filter(k => r.checklist[k]).length;
    // 매출 불일치: 체크돼 있으나 홈택스 매출 금액이 0이고, 아직 확인(끄기) 안 한 항목
    const salesAmt: Record<string, number> | null = r.htx ? {
      sales_tax_invoice: r.htx.sales.ti,
      sales_invoice: r.htx.sales.inv,
      sales_card: r.htx.sales.card,
      sales_cash: r.htx.sales.cash,
      sales_pg: r.htx.sales.online + r.htx.sales.zeropay,
    } : null;
    const salesMismatches = salesAmt
      ? CHECKLIST.writing[0].items.filter(it => r.checklist[it.key] && (salesAmt[it.key] ?? 0) === 0 && !r.checklist[`mismatch_ack_${it.key}`])
      : [];
    const chip = client.taxationType ? (TAXATION_CHIP[client.taxationType] ?? "border-[#D1D6DB] text-[#6B7684] bg-[#F9FAFB]") : null;
    const chipLabel = client.taxationType === "간이(세금계산서발행)" ? "간이(세계발행)" : client.taxationType;
    // 작성중 체크 칩 (checklist 토글)
    const checkChip = (key: string, label: string, color: string, title?: string) => {
      const on = !!r.checklist[key];
      return (
        <button
          key={key}
          type="button"
          onClick={() => toggleCheck(client.id, key)}
          disabled={dim}
          title={title}
          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-40 whitespace-nowrap ${
            on ? "border-transparent text-white" : "border-[#E5E8EB] text-[#6B7684] bg-white/60 hover:border-[#B0B8C1]"
          }`}
          style={on ? { background: color } : undefined}
        >
          {on ? "✓ " : ""}{label}
        </button>
      );
    };
    return (
      <tr key={client.id} className={`align-top transition-colors ${dim ? "opacity-40" : "hover:bg-white/60"}`} style={dim ? undefined : { background: `${meta.tint}44` }}>
        {/* 거래처 */}
        <td className="sticky left-0 z-10 px-4 py-3 whitespace-nowrap bg-white/85 backdrop-blur-md">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium ${dim ? "text-[#8B95A1] line-through" : "text-[#191F28]"}`}>{client.name}</span>
            {chip && <span className={`inline-flex items-center border ${chip} rounded-md px-1.5 py-0.5 text-[11px]`}>{chipLabel}</span>}
            {client.bizNumber && <CopyBizBtn value={client.bizNumber} />}
          </div>
          <div className="text-[11px] text-[#8B95A1] mt-0.5">{client.clientType === "corporate" ? "법인" : "개인"}{client.ceoName ? ` · ${client.ceoName}` : ""}</div>
          {client.vatTypeDetail && (() => {
            const v = parseVatTypeDetail(client.vatTypeDetail);
            return (
              <div className="mt-1 space-y-1 max-w-[250px]" title={client.vatTypeDetail}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: v.bg, color: v.text }}>
                    {v.label}
                  </span>
                  {v.closedDate && <span className="text-[10.5px] font-bold text-[#DC2626]">폐업 {v.closedDate}</span>}
                </div>
                {v.trans && (
                  v.trans.recent ? (
                    <div className="inline-flex items-center flex-wrap gap-x-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA] whitespace-normal leading-snug">
                      <span>{v.trans.from} → {v.trans.to} 전환</span>
                      <span className="font-medium text-[#EA580C]">{v.trans.date}</span>
                    </div>
                  ) : (
                    <div className="text-[10.5px] text-[#8B95A1] whitespace-normal leading-snug">
                      {v.trans.from} → {v.trans.to} 전환 · {v.trans.date}
                    </div>
                  )
                )}
              </div>
            );
          })()}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* 예정고지(6개월) / 예정신고(3개월) */}
            <div className="inline-flex rounded-md overflow-hidden border border-[#E5E8EB]">
              <button type="button" disabled={dim} onClick={() => setCheckVal(client.id, "report_notice", true)}
                title="예정고지 · 확정 6개월"
                className={`px-1.5 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${isNotice ? "bg-[#6D28D9] text-white" : "bg-white text-[#8B95A1] hover:bg-[#F9FAFB]"}`}>6개월</button>
              <button type="button" disabled={dim} onClick={() => setCheckVal(client.id, "report_notice", false)}
                title="예정신고 · 확정 3개월"
                className={`px-1.5 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40 border-l border-[#E5E8EB] ${!isNotice ? "bg-[#1B64DA] text-white" : "bg-white text-[#8B95A1] hover:bg-[#F9FAFB]"}`}>3개월</button>
            </div>
            <button
              type="button"
              onClick={() => toggleCheck(client.id, "early_refund")}
              disabled={dim}
              title="조기환급 대상 (영세율·시설투자 등)"
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${
                r.checklist["early_refund"]
                  ? "bg-[#0EA5E9] text-white"
                  : "bg-[#F2F4F6] text-[#B0B8C1] hover:text-[#6B7684]"
              }`}
            >
              💧 조기환급{r.checklist["early_refund"] ? "" : "?"}
            </button>
          </div>
        </td>

        {/* 담당자 */}
        {showAssignedUser && (
          <td className="px-3 py-3 text-center text-xs text-[#4E5968] whitespace-nowrap">{client.assignedUserName || <span className="text-[#B0B8C1]">-</span>}</td>
        )}

        {/* 매출·매입 (홈택스 업로드 자료) */}
        <td className="px-3 py-3 align-top">
          <HtxSummary htx={r.htx} isCorp={isCorp} isConfirm={isConfirm} />
        </td>

        {/* 체크리스트 — 예정고지(개인 예정) / 신고 체크리스트 */}
        <td className="px-3 py-3">
          {isPrelimNotice ? (
            <div className="flex items-center gap-2 flex-wrap py-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6D28D9] bg-[#F5E8FF] rounded-md px-2 py-1">📋 예정고지 · 신고 불필요</span>
              <span className="text-[11px] text-[#6B7684]">고지세액</span>
              <div className="flex items-center bg-white/80 rounded-lg border border-[#E5E8EB] px-2 h-7">
                <input
                  value={r.noticeTax == null ? "" : r.noticeTax.toLocaleString("ko-KR")}
                  onChange={(e) => changeNoticeTax(client.id, e.target.value)}
                  onBlur={() => commitNoticeTax(client.id)}
                  disabled={dim}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-[100px] bg-transparent text-[12px] text-right text-[#191F28] outline-none disabled:opacity-40"
                />
                <span className="text-[11px] text-[#8B95A1] ml-1">원</span>
              </div>
            </div>
          ) : (
          <>
          <div className="flex flex-row items-start gap-2">
            {/* 자료수집 열 */}
            <div className={`rounded-lg transition-colors shrink-0 p-1.5 ${r.stage === "collect" ? "ring-1 ring-[#FDE68A] bg-white/40" : ""}`}>
              <div className="text-[10px] font-bold mb-1 flex items-center gap-1" style={{ color: STAGES[0].color }}>
                자료수집{r.stage === "collect" && <span className="w-1.5 h-1.5 rounded-full" style={{ background: STAGES[0].color }} />}
              </div>
              {isCorp ? (
                <div className="flex flex-col items-start gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#6D28D9] bg-[#F5E8FF] rounded-md px-1.5 py-0.5">🏢 법인 · 자료수집 불필요</span>
                  {r.stage === "collect" ? (
                    <button
                      onClick={() => moveStage(client.id, 1)}
                      disabled={dim}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-40 shadow-sm whitespace-nowrap"
                      style={{ background: STAGES[1].color }}
                    >
                      작성중으로 →
                    </button>
                  ) : (
                    <span className="text-[10px] text-[#B0B8C1]">해당없음</span>
                  )}
                </div>
              ) : (
                <div className="flex flex-row items-start gap-3">
                  {CHECKLIST.collect.map((grp, gi) => (
                    <div key={gi} className="flex flex-col items-start gap-1">
                      {grp.group && <span className="text-[9px] font-bold text-[#B45309] tracking-wide">{grp.group}</span>}
                      {grp.items.map((it) => checkChip(it.key, it.label, STAGES[0].color))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 구분선 */}
            <div className="w-px bg-[#E5E8EB] self-stretch shrink-0" />

            {/* 작성중 열 (매출·매입·세액공제·고정자산·예정고지) */}
            <div className={`rounded-lg transition-colors flex-1 min-w-0 p-1.5 ${r.stage === "writing" ? "ring-1 ring-[#BFDBFE] bg-white/40" : ""}`}>
              <div className="text-[10px] font-bold mb-1.5 flex items-center gap-1" style={{ color: STAGES[1].color }}>
                작성중{r.stage === "writing" && <span className="w-1.5 h-1.5 rounded-full" style={{ background: STAGES[1].color }} />}
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 items-start">
                {/* 매출 + 겸영·영세 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[#6B7684] w-7 shrink-0">매출</span>
                  {CHECKLIST.writing[0].items.map((it) => checkChip(it.key, it.label, STAGES[1].color))}
                  <span className="text-[#D1D6DB] px-0.5 select-none">|</span>
                  {checkChip("sales_dual", "겸영", "#475569")}
                  {checkChip("sales_zero", "영세", "#475569")}
                </div>
                {/* 세액공제 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[#0F766E] w-7 shrink-0">공제</span>
                  {checkChip("credit_etax", "전자(세)발행", "#0F766E", "전자세금계산서발행세액공제")}
                  {checkChip("credit_card", "신용카드발행", "#0F766E", "신용카드매출전표등발행세액공제")}
                  {checkChip("credit_deemed", "의제매입", "#0F766E", "의제매입세액공제")}
                </div>
                {/* 매입 + 고정자산매입 O/X */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[#6B7684] w-7 shrink-0">매입</span>
                  {CHECKLIST.writing[1].items.map((it) => checkChip(it.key, it.label, STAGES[1].color))}
                  <span className="text-[#D1D6DB] px-0.5 select-none">|</span>
                  <span className="text-[11px] text-[#6B7684]">고정자산매입</span>
                  <div className="inline-flex rounded-lg overflow-hidden border border-[#E5E8EB]">
                    <button type="button" disabled={dim} onClick={() => setCheckVal(client.id, "fixed_asset", true)}
                      className={`px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${r.checklist["fixed_asset"] === true ? "bg-[#15803D] text-white" : "bg-white/60 text-[#8B95A1] hover:bg-[#F9FAFB]"}`}>O</button>
                    <button type="button" disabled={dim} onClick={() => setCheckVal(client.id, "fixed_asset", false)}
                      className={`px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 border-l border-[#E5E8EB] ${r.checklist["fixed_asset"] === false ? "bg-[#94A3B8] text-white" : "bg-white/60 text-[#8B95A1] hover:bg-[#F9FAFB]"}`}>X</button>
                  </div>
                </div>
                {/* 예정고지세액 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#6B7684] shrink-0">예정고지</span>
                  <div className="flex items-center bg-white/80 rounded-lg border border-[#E5E8EB] px-2 h-7">
                    <input
                      value={r.noticeTax == null ? "" : r.noticeTax.toLocaleString("ko-KR")}
                      onChange={(e) => changeNoticeTax(client.id, e.target.value)}
                      onBlur={() => commitNoticeTax(client.id)}
                      disabled={dim}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-[90px] bg-transparent text-[12px] text-right text-[#191F28] outline-none disabled:opacity-40"
                    />
                    <span className="text-[11px] text-[#8B95A1] ml-1">원</span>
                  </div>
                </div>
                {/* 매출 불일치 알림: 체크됐지만 홈택스 매출 없음 */}
                {salesMismatches.length > 0 && (
                  <div className="col-span-2 flex items-center gap-2 flex-wrap rounded-lg bg-[#FEF2F2] border border-[#FECACA] px-2 py-1.5">
                    <span className="text-[11px] font-bold text-[#DC2626]">⚠ 체크됨인데 홈택스 매출 없음</span>
                    <span className="text-[11px] text-[#991B1B]">{salesMismatches.map(m => m.label).join(", ")}</span>
                    <button
                      type="button"
                      onClick={() => dismissSalesMismatch(client.id, salesMismatches.map(m => m.key))}
                      disabled={dim}
                      title="알림만 끕니다 (체크는 그대로 유지됩니다)"
                      className="ml-auto text-[10px] font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-md px-2 py-0.5 disabled:opacity-40"
                    >
                      확인 ✓
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 컨펌+보수 단계: 보수료 입력 */}
          {r.stage === "confirm" && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[12px] font-bold text-[#7C3AED]">보수료</span>
              <input
                value={r.fee == null ? "" : r.fee.toLocaleString("ko-KR")}
                onChange={(e) => changeFee(client.id, e.target.value)}
                onBlur={() => commitFee(client.id)}
                disabled={dim}
                inputMode="numeric"
                placeholder={activeTab === "bookkeeping" ? "0" : "입력"}
                className="w-[110px] bg-white/80 rounded-lg px-2 py-1.5 text-[13px] text-right text-[#191F28] outline-none focus:ring-2 focus:ring-purple-200 disabled:opacity-40"
              />
              <span className="text-[12px] text-[#8B95A1]">원</span>
            </div>
          )}
          </>
          )}
        </td>

        {/* 메모 */}
        <td className="px-3 py-3">
          <input
            value={r.memo ?? ""}
            onChange={(e) => changeMemo(client.id, e.target.value)}
            onBlur={() => commitMemo(client.id)}
            disabled={dim}
            placeholder="-"
            className="w-full min-w-[100px] bg-transparent rounded-lg px-2 py-1.5 text-[13px] text-[#191F28] outline-none focus:bg-white/80 focus:ring-2 focus:ring-blue-200 disabled:opacity-40"
          />
        </td>

        {/* 제외 */}
        <td className="px-3 py-3 text-center">
          <button onClick={() => toggleExcluded(client.id)} className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-colors ${dim ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]" : "glass-strong text-[#8B95A1] hover:text-[#4E5968]"}`}>
            {dim ? "포함" : "제외"}
          </button>
        </td>

        {/* 진행 단계 — 예정고지(개인 예정)는 단계 없음 / 그 외 스텝퍼 */}
        <td className="px-3 py-3 whitespace-nowrap">
          {isPrelimNotice ? (
            <div className="flex flex-col gap-1 items-end">
              <span className="text-[12px] font-bold text-[#6D28D9]">📋 예정고지</span>
              <span className="text-[10px] text-[#8B95A1]">신고 불필요 · 고지서 확인</span>
            </div>
          ) : (
          <div className="flex flex-col gap-2 items-end">
            {/* 가로 스텝퍼 (왼쪽 자료수집 → 오른쪽 신고완료) */}
            <div className="flex items-center">
              {STAGES.map((s, i) => (
                <span key={s.key} className="flex items-center">
                  {i > 0 && <span className="w-4 h-[2px]" style={{ background: i <= cur ? s.color : "#E5E8EB" }} />}
                  <span
                    className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${i === cur ? "ring-2 ring-offset-1" : ""}`}
                    title={s.label}
                    style={{ background: i <= cur ? s.color : "#E5E8EB", color: i <= cur ? "#fff" : "#B0B8C1", ...(i === cur ? ({ ["--tw-ring-color" as any]: `${s.color}66` }) : {}) }}
                  >
                    {i < cur ? "✓" : i + 1}
                  </span>
                </span>
              ))}
            </div>
            <span className="text-[12px] font-bold flex items-center gap-1.5" style={{ color: meta.color }}>
              {cur + 1}. {meta.label}{keys.length > 0 ? <span className="text-[#8B95A1] font-medium"> {doneN}/{keys.length}</span> : null}
              {r.rejectionCount > 0 && (
                <button
                  onClick={() => setRejectTarget({ clientId: client.id, clientName: client.name, readOnly: true })}
                  className="text-[10px] font-bold text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FECACA] rounded-md px-1.5 py-0.5 transition-colors"
                  title={`클릭하면 반려 사유를 확인합니다${r.lastRejectedAt ? ` (최근 반려: ${new Date(r.lastRejectedAt).toLocaleString("ko-KR")})` : ""}`}
                >
                  🔴 {r.rejectionCount}차반려
                </button>
              )}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => moveStage(client.id, -1)} disabled={dim || cur === 0} className="px-2 py-1 rounded-lg text-[11px] font-bold glass-strong text-[#8B95A1] hover:text-[#4E5968] disabled:opacity-30">← 이전</button>
              {r.stage === "approval" && (
                <button
                  onClick={() => setRejectTarget({ clientId: client.id, clientName: client.name })}
                  disabled={dim}
                  title="반려 (작성중 단계로 되돌림)"
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-40"
                >
                  반려
                </button>
              )}
              {cur < STAGES.length - 1 ? (
                <button onClick={() => moveStage(client.id, 1)} disabled={dim} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-40 shadow-sm" style={{ background: STAGES[cur + 1].color }}>{STAGES[cur + 1].label} →</button>
              ) : (
                <span className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#15803D] bg-[#E7F7EE]">완료 ✓</span>
              )}
            </div>
          </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 5단계 칸반 카드 (왼→오) */}
      <div className="grid grid-cols-5 gap-2.5">
        {STAGES.map((s) => {
          const activeCard = stageFilter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setStageFilter(activeCard ? null : s.key)}
              className={`glass rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 ${activeCard ? "ring-2" : ""}`}
              style={activeCard ? ({ ["--tw-ring-color" as any]: s.color, borderColor: s.color }) : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-[11px] font-bold uppercase" style={{ color: s.color }}>{s.label}</span>
              </div>
              <div className="text-[24px] font-extrabold text-[#191F28] mt-1">{stageCounts[s.key]}<span className="text-[13px] text-[#B0B8C1] font-bold">곳</span></div>
            </button>
          );
        })}
      </div>

      {/* 통계 + 검색 */}
      <div className="glass rounded-2xl p-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] bg-white/80 rounded-xl flex items-center gap-2 px-3 h-9">
          <svg width={14} height={14} fill="none" stroke="#6B7684" strokeWidth={2.2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처명 · 대표자 검색" className="flex-1 bg-transparent outline-none text-[13px] text-[#191F28] placeholder:text-[#8B95A1]" />
        </div>
        <span className="text-[12px] text-[#6B7684] px-1">대상 <b className="text-[#191F28]">{active.length}곳</b> · 신고완료 <b className="text-[#15803D]">{stageCounts.done}</b> · 보수합계 <b className="text-[#191F28]">{fmtWon(feeSum)}</b></span>
        {estTotal !== 0 && (
          <span className="text-[12px] text-[#6B7684] px-1" title="일반과세 + 홈택스 자료 있는 거래처의 예상세액 합계 (참고용 추정치)">
            예상세액 합계 <b className={estTotal >= 0 ? "text-[#C2410C]" : "text-[#047857]"}>{estTotal >= 0 ? fmtWon(estTotal) : `환급 ${fmtWon(-estTotal)}`}</b> <span className="text-[#B0B8C1]">참고</span>
          </span>
        )}
        {estBestTotal !== 0 && (
          <span className="text-[12px] text-[#6B7684] px-1" title="카드·현금·화물 매입 전체 반영 시 예상세액 합계 (참고용)">
            ⭐ 베스트 합계 <b className={estBestTotal >= 0 ? "text-[#B45309]" : "text-[#047857]"}>{estBestTotal >= 0 ? fmtWon(estBestTotal) : `환급 ${fmtWon(-estBestTotal)}`}</b>
          </span>
        )}
        {stageFilter && <button onClick={() => setStageFilter(null)} className="text-[12px] font-bold text-[#3182F6] hover:underline">필터 해제</button>}
        {activeTab === "bookkeeping" && <span className="text-[11px] text-[#8B95A1]">기장은 보수 기본 0원</span>}

        {/* 홈택스 자료 업로드 */}
        <div className="ml-auto flex items-center gap-2">
          {lastImport && (
            <span className="text-[11px] text-[#8B95A1]">
              마지막 업로드 {lastImport.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })} {lastImport.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <input ref={taxTypeFileRef} type="file" accept=".xlsx,.xls" onChange={onTaxTypeFileSelected} className="hidden" />
          <button
            onClick={() => taxTypeFileRef.current?.click()}
            disabled={taxTypeUploading}
            className="flex items-center gap-1.5 rounded-xl px-3.5 h-9 text-[13px] font-bold glass-strong text-[#6B7684] hover:text-[#191F28] transition disabled:opacity-50"
            title="홈택스 신고리스트관리 엑셀을 업로드하면 거래처별 '과세유형 상세'가 거래처명 아래에 표시됩니다"
          >
            {taxTypeUploading ? (
              <><span className="w-3.5 h-3.5 border-2 border-[#B0B8C1] border-t-[#6B7684] rounded-full animate-spin" /> 업로드 중…</>
            ) : (
              <>🏷️ 과세유형 업로드</>
            )}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileSelected} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-xl px-3.5 h-9 text-[13px] font-bold text-white bg-[#3182F6] hover:bg-[#1B64DA] transition disabled:opacity-50"
            title="홈택스 부가세 신고자료 조회 엑셀을 업로드하면 거래처별 매출·매입이 자동 매칭됩니다"
          >
            {uploading ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 업로드 중…</>
            ) : (
              <>📊 홈택스 자료 업로드</>
            )}
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="glass rounded-3xl overflow-hidden">
        <div className="overflow-auto max-h-[64vh]">
          <table className="text-sm border-collapse w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-white/90 backdrop-blur-md border-b border-white/60">
                <th className="sticky left-0 top-0 z-30 bg-white/90 backdrop-blur-md text-left px-4 py-3 text-[#333D4B] font-medium min-w-[170px]">거래처명</th>
                {showAssignedUser && (
                  <th className="text-center px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap">
                    <div className="relative inline-block" ref={assignFilterRef}>
                      <button
                        onClick={() => setAssignFilterOpen(o => !o)}
                        className={`flex items-center gap-1 mx-auto hover:text-[#191F28] ${assignFilter.length > 0 ? "text-[#191F28] font-bold" : ""}`}
                      >
                        담당자
                        {assignFilter.length > 0 && (
                          <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{assignFilter.length}</span>
                        )}
                        <span className="text-[#8B95A1] text-[10px]">▼</span>
                      </button>
                      {assignFilterOpen && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#F2F4F6] rounded-[10px] shadow-lg z-30 p-2 min-w-[120px]">
                          {assignOptions.length === 0 ? (
                            <p className="text-xs text-[#8B95A1] px-2 py-1">데이터 없음</p>
                          ) : (
                            assignOptions.map(name => (
                              <label key={name} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap font-normal">
                                <input
                                  type="checkbox"
                                  checked={assignFilter.includes(name)}
                                  onChange={() => setAssignFilter(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name])}
                                  className="accent-[#3182F6]"
                                />
                                {name}
                              </label>
                            ))
                          )}
                          {assignFilter.length > 0 && (
                            <button onClick={() => setAssignFilter([])} className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]">초기화</button>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                )}
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[240px]">매출·매입 (홈택스)</th>
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium min-w-[280px]">체크리스트</th>
                <th className="text-left px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[100px]">메모</th>
                <th className="text-center px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap">제외</th>
                <th className="text-right px-3 py-3 text-[#333D4B] font-medium whitespace-nowrap min-w-[180px]">진행 단계 →</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {shown.length === 0 && excluded.length === 0 && (
                <tr><td colSpan={colCount} className="text-center py-12 text-[#8B95A1]">대상 거래처가 없습니다</td></tr>
              )}
              {shown.map((c) => row(c, false))}
              {!stageFilter && excluded.length > 0 && (
                <tr><td colSpan={colCount} className="px-4 py-2 text-[11px] font-bold text-[#8B95A1] bg-[#F9FAFB]/60">제외됨 ({excluded.length}곳)</td></tr>
              )}
              {!stageFilter && excluded.map((c) => row(c, true))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 결재 반려 모달 */}
      {rejectTarget && (
        <VatRejectModal
          clientId={rejectTarget.clientId}
          clientName={rejectTarget.clientName}
          period={period}
          readOnly={rejectTarget.readOnly}
          onClose={() => setRejectTarget(null)}
          onRejected={() => router.refresh()}
        />
      )}

      {/* 업로드 결과 모달 */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setImportResult(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-bold text-[#191F28]">📊 홈택스 자료 업로드 완료</h3>
                <p className="text-[12px] text-[#8B95A1] mt-1">{importResult.sheetTitle}</p>
              </div>
              <button onClick={() => setImportResult(null)} className="text-[#B0B8C1] hover:text-[#4E5968] text-xl leading-none">✕</button>
            </div>

            {importResult.periodWarning && (
              <div className="mt-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2 text-[12px] text-[#92400E]">
                ⚠ {importResult.periodWarning}
              </div>
            )}

            {importResult.autoCheckedCount > 0 && (
              <div className="mt-3 rounded-xl bg-[#F5F9FF] border border-[#BFDBFE] px-3 py-2 text-[12px] text-[#1B64DA]">
                ✓ 매출·공제 항목 자동 체크: <b>{importResult.autoCheckedCount}곳</b> (매출 항목 + 신용카드발행세액공제 자동 체크, 예정고지세액 자동 입력)
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-2xl bg-[#F5F9FF] p-3 text-center">
                <div className="text-[22px] font-extrabold text-[#1B64DA]">{importResult.matchedCount}</div>
                <div className="text-[11px] text-[#6B7684] font-bold">매칭 완료</div>
              </div>
              <div className="rounded-2xl bg-[#F9FAFB] p-3 text-center">
                <div className="text-[22px] font-extrabold text-[#8B95A1]">{importResult.unmatchedCount}</div>
                <div className="text-[11px] text-[#6B7684] font-bold">미매칭</div>
              </div>
              <div className="rounded-2xl bg-[#FEF2F2] p-3 text-center">
                <div className="text-[22px] font-extrabold text-[#DC2626]">{importResult.collectErrorCount}</div>
                <div className="text-[11px] text-[#6B7684] font-bold">수집오류</div>
              </div>
            </div>

            {importResult.unmatched.length > 0 && (
              <div className="mt-4">
                <div className="text-[12px] font-bold text-[#4E5968] mb-1.5">미매칭 거래처 <span className="text-[#8B95A1] font-medium">(시스템에 없거나 사업자번호 불일치)</span></div>
                <div className="rounded-xl border border-[#F2F4F6] divide-y divide-[#F2F4F6] max-h-[200px] overflow-auto">
                  {importResult.unmatched.map((u, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                      <span className="text-[#191F28]">{u.name || <span className="text-[#B0B8C1]">(이름없음)</span>}</span>
                      <span className="text-[#8B95A1]">{u.biz}{u.manager ? ` · ${u.manager}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importResult.collectErrors.length > 0 && (
              <div className="mt-4">
                <div className="text-[12px] font-bold text-[#DC2626] mb-1.5">⚠ 홈택스 수집오류 거래처 <span className="text-[#8B95A1] font-medium">(자료 재수집 필요)</span></div>
                <div className="rounded-xl border border-[#FEE2E2] divide-y divide-[#FEE2E2] max-h-[160px] overflow-auto">
                  {importResult.collectErrors.map((u, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                      <span className="text-[#191F28]">{u.name}</span>
                      <span className="text-[#8B95A1]">{u.biz}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setImportResult(null)} className="mt-5 w-full rounded-2xl py-3 text-[14px] font-bold text-white bg-[#191F28] hover:bg-black transition">확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
