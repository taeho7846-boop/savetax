"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ClientProfile, LedgerMonth, ProfileTile, ProfileWarning } from "@/lib/client-profile";
import { openClientEditModal } from "@/app/(main)/clients/ClientLink";
import type { ClientEditModalTab } from "@/app/(main)/clients/ClientEditModal";

/**
 * 거래처 프로필 모달 — 거래처 한 곳의 모든 정보를 한 장으로.
 * 데이터: GET /api/clients/[id]/profile (lib/client-profile.getClientProfile)
 * 구역: 헤더 → 경고 칩 → 숫자 타일 6 → 월별 매출·매입 막대(24개월) → 부가세/종소세/원천세 이력 → 최근 메모 → 바로가기
 */

const won = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("ko-KR"));
/** 억/만 단위 짧은 금액 (축 라벨·툴팁용) */
function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "")}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}
const fmtBiz = (v: string | null) => (v && /^\d{10}$/.test(v) ? v.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3") : v ?? "");
/** 홈택스 '과세유형 상세'는 "부가가치세 일반과세자 입니다." 같은 문장이라 핵심만 남긴다 */
function cleanVatDetail(v: string | null): string | null {
  if (!v) return null;
  const t = v.replace(/부가가치세|입니다|\.|^\s*[·:]\s*/g, "").replace(/\s+/g, " ").trim();
  return t || null;
}
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

/* ───────── 작은 부품 ───────── */

function Pill({ color, children, muted }: { color: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${muted ? "opacity-60" : ""}`}
      style={{ background: `${color}1F`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "blue" | "green" | "red" | "amber" | "purple" }) {
  const cls = {
    gray: "bg-[#F2F4F6] text-[#4E5968]",
    blue: "bg-[#E8F3FF] text-[#1B64DA]",
    green: "bg-[#E7F7EE] text-[#15803D]",
    red: "bg-[#FEF2F2] text-[#DC2626]",
    amber: "bg-[#FFFBEB] text-[#B45309]",
    purple: "bg-[#F5E8FF] text-[#7C3AED]",
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{children}</span>;
}

function CopyChip({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy(e: React.MouseEvent) {
    e.stopPropagation();
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = value; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* 무시 */ }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).catch(fallback); else fallback();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="복사"
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums transition-colors ${
        copied ? "bg-[#E7F7EE] text-[#15803D]" : "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E8F3FF] hover:text-[#3182F6]"
      }`}
    >
      {copied ? "✓ 복사됨" : (label ?? value)}
      {!copied && (
        <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

function ActionBtn({ onClick, href, children, primary, title }: { onClick?: () => void; href?: string; children: React.ReactNode; primary?: boolean; title?: string }) {
  const cls = `inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-bold transition-colors whitespace-nowrap ${
    primary ? "bg-[#191F28] text-white hover:bg-[#333D4B]" : "border border-[#E5E8EB] bg-white/80 text-[#4E5968] hover:bg-[#F2F4F6] hover:text-[#191F28]"
  }`;
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls} title={title}>{children}</a>;
  return <button type="button" onClick={onClick} className={cls} title={title}>{children}</button>;
}

function SectionTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-widest text-[#8B95A1]">{eyebrow}</div>
        <h3 className="mt-0.5 text-[15px] font-bold tracking-tight text-[#191F28]">{title}</h3>
      </div>
      {right}
    </div>
  );
}

function MoreLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  const cls = "text-[12px] font-bold text-[#3182F6] hover:underline whitespace-nowrap";
  if (href) return <Link href={href} className={cls}>{children} →</Link>;
  return <button type="button" onClick={onClick} className={cls}>{children} →</button>;
}

/* ───────── 경고 칩 ───────── */

function WarningChips({ warnings, onNavigate }: { warnings: ProfileWarning[]; onNavigate: () => void }) {
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#D1FAE5] bg-[#ECFDF5]/70 px-4 py-2.5 text-[12.5px] font-bold text-[#047857]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#10B981] text-[11px] text-white">✓</span>
        특이사항 없음 — 미수·기장·신고 모두 정상 범위예요
      </div>
    );
  }
  const tone = {
    danger: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
    warn: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    info: "border-[#E5E8EB] bg-[#F9FAFB] text-[#4E5968]",
  };
  const dot = { danger: "bg-[#DC2626]", warn: "bg-[#F59E0B]", info: "bg-[#8B95A1]" };
  return (
    <div className="flex flex-wrap gap-2">
      {warnings.map(w => {
        const inner = (
          <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot[w.level]} ${w.level === "danger" ? "ring-pulse" : ""}`} />
            <span className="font-bold">{w.label}</span>
            {w.detail && <span className="truncate font-medium opacity-75">· {w.detail}</span>}
          </>
        );
        const cls = `inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] ${tone[w.level]}`;
        return w.href ? (
          <Link key={w.key} href={w.href} onClick={onNavigate} className={`${cls} hover:brightness-95`}>{inner}</Link>
        ) : (
          <span key={w.key} className={cls}>{inner}</span>
        );
      })}
    </div>
  );
}

/* ───────── 숫자 타일 ───────── */

function Tile({ t, onNavigate }: { t: ProfileTile; onNavigate: () => void }) {
  const toneCls = {
    neutral: "",
    good: "",
    warn: "ring-1 ring-[#FDE68A]",
    danger: "ring-1 ring-[#FECACA]",
  }[t.tone ?? "neutral"];
  const valueCls = {
    neutral: "text-[#191F28]",
    good: "text-[#15803D]",
    warn: "text-[#B45309]",
    danger: "text-[#DC2626]",
  }[t.tone ?? "neutral"];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11.5px] font-bold text-[#6B7684]">{t.title}</div>
        {t.color && <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />}
      </div>
      <div className="mt-2 flex items-baseline gap-1 min-w-0">
        <span className={`truncate text-[20px] font-extrabold leading-none tabular-nums tracking-tight ${valueCls}`}>{t.value}</span>
        {t.unit && <span className="text-[12px] font-bold text-[#8B95A1]">{t.unit}</span>}
      </div>
      {t.sub && <div className="mt-1.5 truncate text-[11px] text-[#8B95A1]" title={t.sub}>{t.sub}</div>}
    </>
  );
  const cls = `stat-card glass-strong block rounded-2xl p-3.5 transition hover:-translate-y-px ${toneCls}`;
  return t.href ? <Link href={t.href} onClick={onNavigate} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/* ───────── 월별 매출·매입 막대 ───────── */

const SALE = "#10B981";
const BUY = "#F59E0B";

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const r = v / p;
  const step = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return step * p;
}

function LedgerChart({ rows, today }: { rows: LedgerMonth[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = rows.length;
  const max = niceCeil(Math.max(0, ...rows.map(r => Math.max(r.saleSupply, r.buySupply))));
  const H = 168;
  const grid = [0.25, 0.5, 0.75, 1];

  const last12 = rows.slice(-12);
  const sumSale = last12.reduce((a, r) => a + r.saleSupply, 0);
  const sumBuy = last12.reduce((a, r) => a + r.buySupply, 0);
  const rate = sumSale > 0 ? Math.round((sumBuy / sumSale) * 100) : null;
  // 전년비는 아직 진행 중인 달(오늘이 속한 달)은 빼고, 마지막으로 끝난 달 기준
  const thisMonth = today.slice(0, 7);
  const latest = [...rows].reverse().find(r => r.yearMonth < thisMonth) ?? rows[n - 1];
  const prevYear = latest ? rows.find(r => r.yearMonth === `${parseInt(latest.yearMonth.slice(0, 4)) - 1}${latest.yearMonth.slice(4)}`) : undefined;
  const yoy = latest && prevYear && prevYear.saleSupply > 0 ? Math.round(((latest.saleSupply - prevYear.saleSupply) / prevYear.saleSupply) * 100) : null;

  if (n === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-2xl border border-dashed border-[#E5E8EB] text-[12.5px] text-[#B0B8C1]">
        세모리포트 월별 매입매출 데이터가 아직 없어요 · 기장대리 페이지의 ‘매입매출 수집’으로 가져올 수 있어요
      </div>
    );
  }

  return (
    <div>
      {/* 요약 숫자 */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="최근 12개월 매출" value={short(sumSale)} color={SALE} />
        <MiniStat label="최근 12개월 매입" value={short(sumBuy)} color={BUY} />
        <MiniStat label="매입률" value={rate == null ? "-" : `${rate}%`} color="#4E5968" />
        <MiniStat
          label={latest ? `${parseInt(latest.yearMonth.slice(5, 7))}월 매출 전년비` : "전년비"}
          value={yoy == null ? "-" : `${yoy > 0 ? "+" : ""}${yoy}%`}
          color={yoy == null ? "#8B95A1" : yoy >= 0 ? "#15803D" : "#DC2626"}
        />
      </div>

      <div className="relative select-none" onMouseLeave={() => setHover(null)}>
        {/* 격자 + 축 라벨 */}
        <div className="relative" style={{ height: H }}>
          {grid.map(g => (
            <div key={g} className="absolute left-0 right-0 flex items-end border-t border-dashed border-[#E5E8EB]" style={{ bottom: `${g * 100}%` }}>
              <span className="-translate-y-0.5 text-[9.5px] tabular-nums text-[#B0B8C1]">{short(max * g)}</span>
            </div>
          ))}
          <div className="absolute inset-x-0 bottom-0 border-t border-[#D1D6DB]" />
          {/* 막대 */}
          <div className="absolute inset-0 flex items-end gap-[3px] pl-8 pr-1 sm:gap-1">
            {rows.map((r, i) => {
              const sh = Math.max(r.saleSupply > 0 ? 2 : 0, (r.saleSupply / max) * H);
              const bh = Math.max(r.buySupply > 0 ? 2 : 0, (r.buySupply / max) * H);
              const dim = hover != null && hover !== i;
              return (
                <div
                  key={r.yearMonth}
                  className="group relative flex h-full flex-1 items-end justify-center gap-px cursor-crosshair"
                  onMouseEnter={() => setHover(i)}
                >
                  <div className={`absolute inset-x-[-2px] inset-y-0 rounded-md transition-colors ${hover === i ? "bg-[#191F28]/[.04]" : ""}`} />
                  <div className="relative w-[46%] rounded-t-[3px] transition-all duration-200" style={{ height: sh, background: SALE, opacity: dim ? 0.35 : 1 }} />
                  <div className="relative w-[46%] rounded-t-[3px] transition-all duration-200" style={{ height: bh, background: BUY, opacity: dim ? 0.35 : 1 }} />
                  {hover === i && (
                    <div className={`pointer-events-none absolute top-0 z-10 w-[230px] rounded-2xl border border-[#E5E8EB] bg-white/95 p-3 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur ${i < 4 ? "left-0" : i > n - 5 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                      <div className="mb-2 flex items-baseline justify-between">
                        <div className="text-[13px] font-extrabold text-[#191F28]">{r.yearMonth.slice(0, 4)}년 {parseInt(r.yearMonth.slice(5, 7))}월</div>
                        <div className="text-[11px] font-bold text-[#8B95A1]">매입률 {r.purchasingRate == null ? "-" : `${Math.round(r.purchasingRate)}%`}</div>
                      </div>
                      <TipRow color={SALE} label="매출" supply={r.saleSupply} vat={r.saleVat} count={r.saleCount} />
                      <TipRow color={BUY} label="매입" supply={r.buySupply} vat={r.buyVat} count={r.buyCount} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* x 라벨 */}
        <div className="mt-1.5 flex gap-[3px] pl-8 pr-1 sm:gap-1">
          {rows.map((r, i) => {
            const m = parseInt(r.yearMonth.slice(5, 7));
            const show = n <= 12 || m === 1 || m === 7 || i === n - 1 || i === 0;
            return (
              <div key={r.yearMonth} className="flex-1 text-center text-[9.5px] tabular-nums text-[#8B95A1]">
                {show ? (m === 1 ? <b className="text-[#4E5968]">{r.yearMonth.slice(0, 4)}</b> : `${m}월`) : ""}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 pl-8 text-[11px] text-[#6B7684]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: SALE }} />매출 공급가액</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: BUY }} />매입 공급가액</span>
        <span className="ml-auto text-[#B0B8C1]">세모리포트 고객 매입매출장 · {rows[0].yearMonth} ~ {rows[n - 1].yearMonth}</span>
      </div>
    </div>
  );
}

function TipRow({ color, label, supply, vat, count }: { color: string; label: string; supply: number; vat: number; count: number }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1 text-[12px]">
      <span className="inline-flex items-center gap-1.5 font-bold" style={{ color }}>
        <span className="h-2 w-2 rounded-sm" style={{ background: color }} />{label}
      </span>
      <div className="text-right">
        <div className="font-extrabold tabular-nums text-[#191F28]">{won(supply)}원</div>
        <div className="text-[10.5px] tabular-nums text-[#8B95A1]">세액 {won(vat)} · {count}건</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-[#F9FAFB] px-3 py-2">
      <div className="text-[10.5px] text-[#8B95A1]">{label}</div>
      <div className="mt-0.5 text-[15px] font-extrabold tabular-nums leading-none" style={{ color }}>{value}</div>
    </div>
  );
}

/* ───────── 이력 표 ───────── */

const TH = "px-3 py-2 text-left text-[10.5px] font-bold text-[#8B95A1] whitespace-nowrap";
const TD = "px-3 py-2 text-[12px] text-[#333D4B] whitespace-nowrap";
const NUM = `${TD} text-right tabular-nums`;

function HistoryCard({ id, title, eyebrow, href, children, empty, count }: { id: string; title: string; eyebrow: string; href: string; children: React.ReactNode; empty: boolean; count: number }) {
  return (
    <section id={id} data-section className="glass rounded-2xl p-4 scroll-mt-3">
      <SectionTitle eyebrow={eyebrow} title={title} right={<MoreLink href={href}>페이지로</MoreLink>} />
      {empty ? (
        <div className="py-6 text-center text-[12px] text-[#B0B8C1]">기록이 없어요</div>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-0">
            {children}
          </table>
          {count >= 6 && <div className="mt-2 text-right text-[10.5px] text-[#B0B8C1]">최근 {count}건만 표시</div>}
        </div>
      )}
    </section>
  );
}

const rowCls = (current: boolean) => `${current ? "bg-[#E8F3FF]/60" : "hover:bg-[#F9FAFB]"} transition-colors`;

/* ───────── 본체 ───────── */

export function ClientProfileModal({ clientId, editTab, onClose, preload }: {
  clientId: number;
  editTab?: ClientEditModalTab;
  onClose: () => void;
  /** 이미 받아둔 데이터가 있으면 API 호출 없이 바로 그린다 */
  preload?: ClientProfile;
}) {
  const [data, setData] = useState<ClientProfile | null>(preload ?? null);
  const [error, setError] = useState<string | null>(null);
  const [hometaxBusy, setHometaxBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState("sec-summary");

  // 스크롤 위치에 따라 활성 탭 갱신 — 보이는 영역 상단(+80px)을 지난 마지막 구역
  const onBodyScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const base = el.getBoundingClientRect().top;
    const line = 80;
    let cur = "sec-summary";
    el.querySelectorAll<HTMLElement>("[data-section]").forEach(sec => { if (sec.getBoundingClientRect().top - base <= line) cur = sec.id; });
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      const all = el.querySelectorAll<HTMLElement>("[data-section]");
      if (all.length) cur = all[all.length - 1].id;
    }
    setActiveSection(cur);
  }, []);

  const jumpTo = useCallback((id: string) => {
    const el = scrollRef.current;
    const sec = el?.querySelector<HTMLElement>(`#${id}`);
    if (!el || !sec) return;
    const top = sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 12;
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    setActiveSection(id);
  }, []);

  useEffect(() => {
    if (preload) return;
    let alive = true;
    setData(null); setError(null);
    fetch(`/api/clients/${clientId}/profile`, { cache: "no-store" })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "불러오지 못했어요");
        return j as ClientProfile;
      })
      .then(j => { if (alive) setData(j); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "불러오지 못했어요"); });
    return () => { alive = false; };
  }, [clientId, preload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function openEdit(tab?: ClientEditModalTab) {
    onClose();
    // 프로필이 닫힌 뒤 수정 모달이 열리도록 한 틱 뒤에
    setTimeout(() => openClientEditModal(clientId, tab), 0);
  }

  async function hometaxLogin() {
    if (hometaxBusy) return;
    setHometaxBusy(true);
    try {
      const res = await fetch("/api/automation/hometax-credentials", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error ?? "로그인 정보를 가져올 수 없어요"); return; }
      const isCorp = !!d.agentNumber;
      const credData: Record<string, string> = { mode: isCorp ? "corp_login" : "login", id: d.hometaxId, pw: d.hometaxPw, rn: d.residentNumber };
      if (isCorp) { credData.certName = d.certName; credData.certPw = d.certPw; credData.agentNumber = d.agentNumber; credData.agentPw = d.hometaxPw; }
      const creds = btoa(unescape(encodeURIComponent(JSON.stringify(credData)))).replace(/=/g, "");
      window.open(`https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`, "_blank");
    } catch {
      alert("네트워크 오류");
    } finally {
      setHometaxBusy(false);
    }
  }

  const c = data?.client;
  const isCorp = c?.clientType === "corporate";
  const terminated = c ? c.contractStatus !== "active" : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#191F28]/25 p-3 backdrop-blur-[3px] sm:p-5" onClick={onClose}>
      <div
        className="glass-strong flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* ── 헤더 ── */}
        <div className="border-b border-[#F2F4F6] px-5 pt-4 pb-4 sm:px-6">
          {!c ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 animate-pulse rounded-2xl bg-[#F2F4F6]" />
                <div>
                  <div className="h-5 w-40 animate-pulse rounded bg-[#F2F4F6]" />
                  <div className="mt-2 h-3.5 w-64 animate-pulse rounded bg-[#F2F4F6]" />
                </div>
              </div>
              <button onClick={onClose} className="text-xl leading-none text-[#8B95A1] hover:text-[#333D4B]">✕</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[18px] font-extrabold text-white shadow-md ${isCorp ? "gradient-purple" : "gradient-blue"} ${terminated ? "grayscale" : ""}`}>
                  {c.name.replace(/^\(?(주|유|사|재)\)?\s*/, "").charAt(0) || c.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="mr-1 truncate text-[20px] font-extrabold tracking-tight text-[#191F28]">{c.name}</h2>
                    <Badge tone={isCorp ? "purple" : "blue"}>{isCorp ? "법인" : "개인"}</Badge>
                    {(() => {
                      const detail = cleanVatDetail(c.vatTypeDetail);
                      const label = detail && detail !== c.taxationType ? (c.taxationType && !detail.includes(c.taxationType) ? `${c.taxationType} · ${detail}` : detail) : c.taxationType;
                      return label ? <Badge>{label}</Badge> : null;
                    })()}
                    {terminated ? (
                      <Badge tone="red">해지{c.terminationMonth ? ` · ${c.terminationMonth}` : ""}</Badge>
                    ) : (
                      <Badge tone="green">수임중{c.contractDate ? ` · ${c.contractDate.slice(0, 7)}~` : ""}</Badge>
                    )}
                    {c.taxTypes && <Badge>{c.taxTypes}</Badge>}
                    {c.affiliation && <Badge>{c.affiliation}</Badge>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#4E5968]">
                    {c.ceoName && <span>대표 <b className="text-[#191F28]">{c.ceoName}</b></span>}
                    {c.bizNumber && <CopyChip value={c.bizNumber} label={fmtBiz(c.bizNumber)} />}
                    {c.phone && (
                      <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1 rounded-md bg-[#F2F4F6] px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums text-[#4E5968] hover:bg-[#E8F3FF] hover:text-[#3182F6]">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
                        {c.phone}
                      </a>
                    )}
                    <span className="text-[#D1D6DB]">|</span>
                    <span>
                      담당 <b className="text-[#191F28]">{c.assignedUser ?? "-"}</b>
                      {c.subAssignedUser && <span className="text-[#8B95A1]"> · 부 {c.subAssignedUser}</span>}
                      {c.accountant && c.accountant !== c.assignedUser && c.accountant !== c.subAssignedUser && <span className="text-[#8B95A1]"> · {c.accountant} 세무사</span>}
                    </span>
                    {(c.bizType || c.bizItem) && (
                      <>
                        <span className="text-[#D1D6DB]">|</span>
                        <span className="truncate text-[#6B7684]" title={[c.bizType, c.bizItem].filter(Boolean).join(" / ")}>{[c.bizType, c.bizItem].filter(Boolean).join(" / ")}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {c.hasHometax && (
                  <ActionBtn onClick={hometaxLogin} title="거래처 홈택스 자동 로그인">
                    <span className="h-2 w-2 rounded-full bg-[#1B64DA]" />{hometaxBusy ? "여는 중…" : "홈택스"}
                  </ActionBtn>
                )}
                {c.wehagoUrl && (
                  <ActionBtn href={c.wehagoUrl} title="위하고 급여 화면">
                    <span className="h-2 w-2 rounded-full bg-[#0F9D77]" />위하고
                  </ActionBtn>
                )}
                {c.driveFolderId && (
                  <ActionBtn href={`https://drive.google.com/drive/folders/${c.driveFolderId}`} title="구글 드라이브 거래처 폴더">
                    <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />드라이브
                  </ActionBtn>
                )}
                {c.myboxLink && (
                  <ActionBtn href={c.myboxLink} title="마이박스">
                    <span className="h-2 w-2 rounded-full bg-[#A855F7]" />마이박스
                  </ActionBtn>
                )}
                <ActionBtn onClick={() => openEdit(editTab ?? "edit")} primary title="거래처 정보 수정">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  수정
                </ActionBtn>
                <button onClick={onClose} className="ml-1 flex h-8 w-8 items-center justify-center rounded-xl text-lg leading-none text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#333D4B]" aria-label="닫기">✕</button>
              </div>
            </div>
          )}
        </div>

        {/* ── 구역 이동 탭 (한 장 스크롤 + 점프) ── */}
        {data && !error && (
          <SectionTabs
            tabs={[
              { id: "sec-summary", label: "요약" },
              { id: "sec-ledger", label: "매출·매입" },
              { id: "sec-vat", label: "부가세" },
              ...(!isCorp ? [{ id: "sec-income", label: "종소세" }] : []),
              ...(c?.withholdingType !== "D" ? [{ id: "sec-wh", label: "원천세" }] : []),
              { id: "sec-notes", label: "메모" },
            ]}
            active={activeSection}
            onSelect={jumpTo}
          />
        )}

        {/* ── 본문 ── */}
        <div ref={scrollRef} onScroll={onBodyScroll} className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {error ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-6 text-center text-[13px] font-bold text-[#DC2626]">{error}</div>
          ) : !data ? (
            <Skeleton />
          ) : (
            <>
              <div id="sec-summary" data-section className="space-y-5 scroll-mt-3">
              <WarningChips warnings={data.warnings} onNavigate={onClose} />

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                {data.tiles.map(t => <Tile key={t.key} t={t} onNavigate={onClose} />)}
              </div>

              {/* 최근 6개월 기장 흐름 */}
              <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-[#8B95A1]">
                <span className="font-bold">최근 기장 흐름</span>
                <div className="flex items-center gap-1">
                  {data.bookkeeping.recent.map(r => {
                    const color = { none: "#E5E8EB", input: "#3182F6", booked: "#F59E0B", reviewed: "#A855F7", done: "#10B981" }[r.stage];
                    const label = { none: "미시작", input: "입력중", booked: "기장완료", reviewed: "검토완료", done: "세모 완료" }[r.stage];
                    return (
                      <span key={r.yearMonth} className="flex flex-col items-center gap-0.5" title={`${r.yearMonth} · ${label}`}>
                        <span className="h-2.5 w-7 rounded-sm" style={{ background: color }} />
                        <span className="text-[9.5px] tabular-nums">{parseInt(r.yearMonth.slice(5, 7))}월</span>
                      </span>
                    );
                  })}
                </div>
                <span className="ml-auto">{data.bookkeeping.semo ? "세모리포트 발송까지가 완료" : "세모리포트 미적용 · 기장완료가 마지막 단계"}</span>
              </div>

              </div>

              {/* 월별 매출·매입 */}
              <section id="sec-ledger" data-section className="glass rounded-2xl p-4 scroll-mt-3">
                <SectionTitle eyebrow="Monthly ledger" title="월별 매출 · 매입 (공급가액)" right={<span className="text-[11px] text-[#8B95A1]">최근 {data.ledger.length}개월 · 막대에 마우스를 올리면 상세</span>} />
                <LedgerChart rows={data.ledger} today={data.today} />
              </section>

              {/* 부가세 이력 */}
              <HistoryCard id="sec-vat" eyebrow="VAT" title="부가가치세 이력" href={data.links.vat} empty={data.vatHistory.length === 0} count={data.vatHistory.length}>
                <thead>
                  <tr className="border-b border-[#F2F4F6]">
                    <th className={TH}>기간</th><th className={TH}>단계</th>
                    <th className={`${TH} text-right`}>매출 공급가액</th><th className={`${TH} text-right`}>매입 공급가액</th>
                    <th className={`${TH} text-right`}>예정고지</th><th className={`${TH} text-right`}>신고수수료</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vatHistory.map(r => (
                    <tr key={r.period} className={rowCls(r.isCurrent)}>
                      <td className={`${TD} font-bold text-[#191F28]`}>{r.label}{r.isCurrent && <span className="ml-1.5 text-[10px] font-bold text-[#3182F6]">진행중</span>}</td>
                      <td className={TD}>
                        {r.excluded ? <Pill color="#8B95A1" muted>제외</Pill> : r.prelimNotice ? <Pill color="#8B95A1">예정고지 · 신고 불필요</Pill> : <Pill color={r.stageColor}>{r.stageLabel}</Pill>}
                      </td>
                      <td className={NUM}>{r.hasHtx ? won(r.salesSupply) : <span className="text-[#B0B8C1]">자료 없음</span>}</td>
                      <td className={NUM}>{r.hasHtx ? won(r.buySupply) : <span className="text-[#B0B8C1]">-</span>}</td>
                      <td className={NUM}>{r.noticeAmount > 0 ? won(r.noticeAmount) : <span className="text-[#B0B8C1]">-</span>}</td>
                      <td className={NUM}>{r.fee ? won(r.fee) : <span className="text-[#B0B8C1]">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </HistoryCard>

              {/* 종소세 이력 */}
              {!isCorp && (
                <HistoryCard id="sec-income" eyebrow="Income tax" title="종합소득세 이력" href={data.links.incomeTax} empty={data.incomeTaxHistory.length === 0} count={data.incomeTaxHistory.length}>
                  <thead>
                    <tr className="border-b border-[#F2F4F6]">
                      <th className={TH}>귀속</th><th className={TH}>단계</th><th className={TH}>유형</th>
                      <th className={`${TH} text-right`}>매출</th><th className={`${TH} text-right`}>소득금액</th><th className={`${TH} text-right`}>결정세액</th>
                      <th className={TH}>감면·공제</th><th className={`${TH} text-right`}>조정료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.incomeTaxHistory.map(r => {
                      const diff = r.currTax != null && r.prevTax != null && r.prevTax > 0 ? Math.round(((r.currTax - r.prevTax) / r.prevTax) * 100) : null;
                      return (
                        <tr key={r.taxYear} className={rowCls(r.isCurrent)}>
                          <td className={`${TD} font-bold text-[#191F28]`}>{r.taxYear}년</td>
                          <td className={TD}>{r.excluded ? <Pill color="#8B95A1" muted>제외</Pill> : <Pill color={r.stageColor}>{r.stageLabel}</Pill>}</td>
                          <td className={`${TD} text-[#6B7684]`}>{[r.bookkeepingDuty, r.filingType].filter(Boolean).join(" · ") || "-"}</td>
                          <td className={NUM}>{won(r.currSales)}</td>
                          <td className={NUM}>{won(r.currIncome)}</td>
                          <td className={`${NUM} font-bold text-[#191F28]`}>
                            {won(r.currTax)}
                            {diff != null && <span className={`ml-1 text-[10px] font-bold ${diff > 0 ? "text-[#DC2626]" : "text-[#15803D]"}`}>{diff > 0 ? "+" : ""}{diff}%</span>}
                          </td>
                          <td className={TD}>
                            {r.reductions.length === 0 ? <span className="text-[#B0B8C1]">-</span> : (
                              <span className="flex flex-wrap gap-1">{r.reductions.map(x => <Badge key={x} tone="blue">{x.replace("세액공제", "").replace(" 감면", "")}</Badge>)}</span>
                            )}
                          </td>
                          <td className={NUM}>{r.adjustmentFee ? won(r.adjustmentFee) : <span className="text-[#B0B8C1]">-</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </HistoryCard>
              )}

              {/* 원천세 이력 */}
              {c?.withholdingType !== "D" && (
                <HistoryCard id="sec-wh" eyebrow="Withholding" title="원천세 최근 12개월" href={data.links.withholding} empty={false} count={0}>
                  <thead>
                    <tr className="border-b border-[#F2F4F6]">
                      <th className={TH}>월</th><th className={TH}>진행</th><th className={TH}>단계</th>
                      <th className={`${TH} text-right`}>소득세</th><th className={`${TH} text-right`}>지방소득세</th>
                      <th className={TH}>신고</th><th className={TH}>접수번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.withholdingHistory.map(r => (
                      <tr key={r.yearMonth} className={rowCls(r.isCurrent)}>
                        <td className={`${TD} font-bold text-[#191F28]`}>{r.label}{r.isCurrent && <span className="ml-1.5 text-[10px] font-bold text-[#3182F6]">이번</span>}</td>
                        <td className={TD}>{r.steps.length === 0 ? <Pill color="#8B95A1" muted>해당 없음</Pill> : <Pill color={r.statusColor}>{r.statusLabel}</Pill>}</td>
                        <td className={TD}>
                          <span className="inline-flex items-center gap-1" title={r.steps.map(s => `${r.doneSteps.includes(s) ? "✓" : "·"} ${s}`).join("\n")}>
                            {r.steps.map(s => <span key={s} className={`h-1.5 w-4 rounded-sm ${r.doneSteps.includes(s) ? "bg-[#10B981]" : "bg-[#E5E8EB]"}`} />)}
                            {r.steps.length > 0 && <span className="ml-1 text-[10.5px] tabular-nums text-[#8B95A1]">{r.doneSteps.length}/{r.steps.length}</span>}
                          </span>
                        </td>
                        <td className={NUM}>{r.incomeAmount != null ? won(r.incomeAmount) : <span className="text-[#B0B8C1]">-</span>}</td>
                        <td className={NUM}>{r.localAmount != null ? won(r.localAmount) : <span className="text-[#B0B8C1]">-</span>}</td>
                        <td className={TD}>
                          {r.filingStatus == null || r.filingStatus === "none" ? <span className="text-[#B0B8C1]">-</span>
                            : r.filingStatus === "submitted" ? <Badge tone="green">접수{r.reportType ? ` · ${r.reportType}` : ""}</Badge>
                            : r.filingStatus === "error" ? <Badge tone="red">오류</Badge>
                            : <Badge tone="amber">{r.filingStatus === "produced" ? "파일제작" : r.filingStatus === "verified" ? "검증" : r.filingStatus}</Badge>}
                        </td>
                        <td className={`${TD} tabular-nums text-[#6B7684]`}>{r.receiptNo ?? <span className="text-[#B0B8C1]">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </HistoryCard>
              )}

              {/* 메모 + 특이사항 */}
              <section id="sec-notes" data-section className="glass rounded-2xl p-4 scroll-mt-3">
                <SectionTitle eyebrow="Notes" title="메모 · 특이사항" right={<MoreLink onClick={() => openEdit("history")}>이력 전체</MoreLink>} />
                {c?.notes && (
                  <div className="mb-3 whitespace-pre-wrap rounded-xl bg-[#FFFBEB] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#78350F]">
                    <span className="mr-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#B45309]">거래처 특이사항</span>{c.notes}
                  </div>
                )}
                {data.memos.length === 0 && !c?.notes ? (
                  <div className="py-4 text-center text-[12px] text-[#B0B8C1]">아직 메모가 없어요</div>
                ) : (
                  <ul className="divide-y divide-[#F2F4F6]">
                    {data.memos.map(m => (
                      <li key={m.id} className="flex items-start gap-3 py-2">
                        <div className="w-[70px] shrink-0 text-[11px] tabular-nums text-[#8B95A1]">{fmtDate(m.createdAt)}</div>
                        <div className="min-w-0 flex-1">
                          {m.title && <div className="truncate text-[12.5px] font-bold text-[#191F28]">{m.title}</div>}
                          <div className="line-clamp-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[#4E5968]">{m.content}</div>
                        </div>
                        <div className="shrink-0 text-[11px] text-[#8B95A1]">{m.author}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* 바로가기 */}
              <div className="flex flex-wrap items-center gap-2 pb-1 text-[12px]">
                <span className="mr-1 font-bold text-[#8B95A1]">바로가기</span>
                {[
                  { label: "월기장 보드", href: data.links.bookkeeping },
                  { label: "부가세", href: data.links.vat },
                  ...(!isCorp ? [{ label: "종합소득세", href: data.links.incomeTax }] : []),
                  { label: "원천세", href: data.links.withholding },
                  { label: "채권관리", href: data.links.receivables },
                ].map(l => (
                  <Link key={l.href} href={l.href} onClick={onClose} className="rounded-lg border border-[#E5E8EB] bg-white/70 px-2.5 py-1 font-bold text-[#4E5968] hover:bg-[#F2F4F6] hover:text-[#191F28]">
                    {l.label}
                  </Link>
                ))}
                <button type="button" onClick={() => openEdit("edit")} className="rounded-lg border border-[#E5E8EB] bg-white/70 px-2.5 py-1 font-bold text-[#4E5968] hover:bg-[#F2F4F6] hover:text-[#191F28]">
                  거래처 수정
                </button>
                <span className="ml-auto text-[11px] text-[#B0B8C1]">기준일 {data.today}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTabs({ tabs, active, onSelect }: { tabs: { id: string; label: string }[]; active: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-[#F2F4F6] bg-white/60 px-4 py-2 sm:px-5">
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`relative h-8 shrink-0 rounded-lg px-3 text-[12.5px] font-bold transition-colors ${
              on ? "bg-[#191F28] text-white shadow-sm" : "text-[#6B7684] hover:bg-[#F2F4F6] hover:text-[#191F28]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
      <span className="ml-auto hidden shrink-0 text-[11px] text-[#B0B8C1] sm:inline">클릭하면 해당 구역으로 이동 · 한 장 스크롤</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-9 w-2/3 rounded-full bg-[#F2F4F6]" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[84px] rounded-2xl bg-[#F2F4F6]" />)}
      </div>
      <div className="h-[260px] rounded-2xl bg-[#F2F4F6]" />
      <div className="h-[180px] rounded-2xl bg-[#F2F4F6]" />
      <div className="h-[180px] rounded-2xl bg-[#F2F4F6]" />
    </div>
  );
}
