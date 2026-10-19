"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  addTaehoPayment,
  cancelLastTaehoRound,
  confirmTaehoRound,
  deleteTaehoPayment,
  copyRecurringExpenses,
  createTaehoExpense,
  deleteTaehoExpense,
  setTaehoRevenueExcluded,
  updateTaehoExpense,
  type ExpenseInput,
} from "@/app/actions/taeho-settlement";
import { askConfirm, notify } from "@/components/ui/Dialog";
import type {
  ExpenseRow,
  Outstanding,
  Payment,
  RevenueItem,
  RevenueRow,
  RevenueSource,
  RoundView,
  Statement,
  TaehoSettlementData,
} from "@/lib/taeho-settlement";
import { SERIES, TaehoTrendChart } from "./TaehoTrendChart";

const won = (n: number) => n.toLocaleString("ko-KR");
const ymLabel = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(5)}`;
const ymKo = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
/** "9/25 14:12" (KST). 서버·브라우저 로케일 차이로 hydration이 깨지지 않도록 직접 조립 */
const fmtWhen = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

function shiftYM(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const SOURCE_CHIP: Record<RevenueSource, { label: string; cls: string }> = {
  client: { label: "채권관리", cls: "bg-[#E8F3FF] text-[#1B64DA]" },
  pulled: { label: "빼온", cls: "bg-[#FFFBEB] text-[#B45309]" },
  oneoff: { label: "단건", cls: "bg-[#F3E8FF] text-[#7E22CE]" },
  refund: { label: "환불", cls: "bg-[#ECFEFF] text-[#0E7490]" },
};
const REFUND_COLOR = "#0891B2";

type Tab = "all" | number; // number = 차수(seq). 확정 차수 또는 미정산(다음 차수)

export function TaehoSettlementView({
  data,
  participants,
  canEdit,
  viewerName,
}: {
  data: TaehoSettlementData;
  participants: { id: number; name: string }[];
  canEdit: boolean;
  viewerName: string;
}) {
  const router = useRouter();
  const { participant, statement: month, rounds, draft, prev, year } = data;
  const ym = month.yearMonth;
  const [tab, setTab] = useState<Tab>("all");
  const [isPending, startTransition] = useTransition();

  const uq = participants.length > 1 ? `&u=${participant.id}` : "";
  const href = (m: string) => `/settlement-taeho?ym=${m}${uq}`;
  const thisYM = (() => {
    const d = new Date(Date.now() + 9 * 3600_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const yearProfit = year.reduce((s, p) => s + p.profit, 0);
  const yearRevenue = year.reduce((s, p) => s + p.revenue, 0);

  // 선택된 탭의 손익계산서
  const selectedRound: RoundView | null = tab === "all" ? null : tab === draft.seq ? draft : rounds.find((r) => r.seq === tab) ?? null;
  const st: Statement = selectedRound ? selectedRound.statement : month;
  const isDraftTab = selectedRound !== null && !selectedRound.confirmed;
  const isLastRound = selectedRound?.confirmed && selectedRound.seq === rounds.length;
  const draftCount = draft.statement.revenue.count + draft.statement.refund.rows.filter((r) => !r.excluded).length;
  const monthHasExpenses = month.cost.expenses.length > 0;
  const futureExpenses = month.cost.expenses.filter((e) => e.roundSeq > draft.seq);

  async function handleConfirm() {
    const d = draft.statement;
    const ok = await askConfirm({
      title: `${draft.seq}차 정산 확정`,
      message: (
        <div className="space-y-1.5 text-[13px]">
          <div>미정산 입금·환불 <b>{draftCount}건</b>을 {draft.seq}차로 묶습니다.</div>
          <div className="rounded-xl bg-[#F2F4F6] px-3 py-2 tabular-nums text-[12.5px] space-y-0.5">
            <div className="flex justify-between"><span className="text-[#6B7684]">매출</span><b>{won(d.revenue.total)}원</b></div>
            <div className="flex justify-between"><span className="text-[#6B7684]">비용</span><b>{won(d.cost.total)}원</b></div>
            {d.refund.total > 0 && <div className="flex justify-between"><span className="text-[#6B7684]">환불 (전액)</span><b>+{won(d.refund.total)}원</b></div>}
            <div className="flex justify-between"><span className="text-[#6B7684]">{participant.name} 입금액</span><b className="text-[#3182F6]">{won(d.profit)}원</b></div>
          </div>
          <div className="text-[11.5px] text-[#8B95A1]">확정 뒤에 들어오는 입금은 {draft.seq + 1}차(미정산)에 쌓여요. 마지막 차수는 확정 취소로 되돌릴 수 있어요.</div>
        </div>
      ),
      confirmText: "확정",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        const r = await confirmTaehoRound(ym, participant.id);
        notify(`${r.seq}차 정산을 확정했어요 (${r.count}건)`);
        setTab(r.seq);
      } catch (e) {
        notify(e instanceof Error && e.message !== "FORBIDDEN" ? e.message : "확정 실패 — 대표만 할 수 있어요", { type: "error" });
      }
    });
  }

  async function handleCancelLast() {
    if (!(await askConfirm({ title: `${rounds.length}차 확정 취소`, message: `${rounds.length}차에 묶인 입금 건이 다시 '미정산'으로 돌아가요. 취소할까요?`, confirmText: "확정 취소", danger: true }))) return;
    startTransition(async () => {
      try {
        const seq = await cancelLastTaehoRound(ym, participant.id);
        notify(`${seq}차 확정을 취소했어요`);
        setTab("all");
      } catch (e) {
        notify(e instanceof Error && e.message !== "FORBIDDEN" ? e.message : "취소 실패", { type: "error" });
      }
    });
  }

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#8B95A1] font-medium">
            {participant.name} 월 손익계산서 · 공급대가(부가세 포함) 기준 · 수수료율 기장료 {participant.feeRate}% / 단건 {participant.oneoffRate}%
          </div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">세무회계태호 정산</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && participants.length > 1 && (
            <div className="glass rounded-xl px-1 h-10 flex items-center gap-0.5">
              {participants.map((p) => (
                <Link
                  key={p.id}
                  href={`/settlement-taeho?ym=${ym}&u=${p.id}`}
                  className={`px-3 h-8 rounded-lg text-[12.5px] font-bold flex items-center transition ${
                    p.id === participant.id ? "bg-[#3182F6] text-white" : "text-[#6B7684] hover:bg-white/60 hover:text-[#191F28]"
                  }`}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 glass rounded-xl px-1 h-10">
            <Link href={href(shiftYM(ym, -1))} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center" aria-label="전월">◀</Link>
            <span className="text-[13.5px] font-bold text-[#191F28] min-w-[88px] text-center tabular-nums">{ymLabel(ym)}</span>
            <Link href={href(shiftYM(ym, 1))} className="w-8 h-8 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center" aria-label="익월">▶</Link>
          </div>
          {ym !== thisYM && (
            <Link href={href(thisYM)} className="glass-strong rounded-xl h-10 px-3.5 flex items-center text-[12.5px] font-bold text-[#6B7684] hover:text-[#191F28] transition">
              이번 달
            </Link>
          )}
        </div>
      </div>

      {/* 차수 탭 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <TabPill active={tab === "all"} onClick={() => setTab("all")}>
          통합 I/S
        </TabPill>
        {rounds.map((r) => (
          <TabPill key={r.seq} active={tab === r.seq} onClick={() => setTab(r.seq)}>
            {r.seq}차
            <span className={`ml-1.5 text-[10.5px] font-medium ${tab === r.seq ? "text-white/80" : "text-[#8B95A1]"}`}>
              ✓ {r.settledAt ? fmtWhen(r.settledAt).split(" ")[0] : ""}
            </span>
            {r.warnings > 0 && <span className="ml-1 text-[10.5px]" title="원본 체크가 풀리거나 금액이 바뀐 건이 있어요">⚠</span>}
          </TabPill>
        ))}
        <TabPill active={tab === draft.seq} onClick={() => setTab(draft.seq)} dashed={draftCount === 0}>
          {draft.seq}차
          <span className={`ml-1.5 text-[10.5px] font-medium ${tab === draft.seq ? "text-white/80" : draftCount > 0 ? "text-[#DC2626]" : "text-[#8B95A1]"}`}>
            미정산 {draftCount}건
          </span>
        </TabPill>
        {canEdit && draftCount > 0 && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="ml-auto h-9 px-4 rounded-xl text-[12.5px] font-bold text-white bg-gradient-to-br from-[#6FA8FF] to-[#3182F6] shadow-md shadow-[#3182F6]/30 hover:brightness-105 transition disabled:opacity-50"
          >
            {draft.seq}차 정산 확정
          </button>
        )}
      </div>

      {/* KPI 3장 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <StatCard label={selectedRound ? `${selectedRound.seq}차 매출` : "매출"} value={st.revenue.total} prev={tab === "all" ? prev?.revenue : undefined} color={SERIES.revenue.color} caption={`기장료 ${won(st.revenue.bookkeeping)} · 단건 ${won(st.revenue.oneoff)}`} />
        <StatCard label={selectedRound ? `${selectedRound.seq}차 비용` : "비용"} value={st.cost.total} prev={tab === "all" ? prev?.cost : undefined} color={SERIES.cost.color} inverse caption={`수수료 ${won(st.cost.feeTotal)} · 공통비용 ${won(st.cost.expenseShareTotal)}`} />
        <HeroCard
          label={selectedRound ? `${selectedRound.seq}차 ${participant.name} 입금액${isDraftTab ? " (예정)" : ""}` : `${participant.name} 입금액 · 월 합계`}
          value={st.profit}
          prev={tab === "all" ? prev?.profit : undefined}
          caption={selectedRound ? (selectedRound.confirmed && selectedRound.settledAt ? `${fmtWhen(selectedRound.settledAt)} 확정` : "확정하면 이 금액이 입금 기준이 돼요") : `${ymKo(ym)} 입금액 = 매출 − 비용${st.refund.total > 0 ? ` + 환불 ${won(st.refund.total)}` : ""}`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-4 items-start">
        {/* 손익계산서 */}
        <section className={`glass-strong rounded-3xl overflow-hidden ${isPending ? "opacity-70" : ""}`}>
          <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
                {selectedRound ? `${selectedRound.seq}차 손익계산서` : "통합 손익계산서"}
                {selectedRound?.confirmed && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-[#E7F7EE] text-[#15803D]">확정</span>}
                {isDraftTab && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-[#FEF2F2] text-[#DC2626]">미정산</span>}
                {selectedRound && selectedRound.warnings > 0 && (
                  <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-[#FFFBEB] text-[#B45309]" title="확정 뒤 원본 체크가 풀리거나 금액이 바뀐 건 — 확정 내역은 그대로 유지돼요">⚠ 원본 변경 {selectedRound.warnings}건</span>
                )}
              </div>
              <div className="text-[11.5px] text-[#8B95A1] mt-0.5">
                {ymKo(ym)} · {participant.name} · 단위: 원 (부가세 포함)
                {selectedRound?.confirmed && selectedRound.settledAt && ` · ${fmtWhen(selectedRound.settledAt)} 확정`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && isLastRound && (
                <button type="button" onClick={handleCancelLast} disabled={isPending} className="text-[11.5px] font-bold text-[#DC2626] bg-[#FEF2F2] rounded-lg px-2.5 py-1.5 hover:bg-[#FEE2E2] transition disabled:opacity-50">
                  {selectedRound!.seq}차 확정 취소
                </button>
              )}
              <span className="text-[11px] font-bold text-[#8B95A1] bg-[#F2F4F6] rounded-full px-2.5 py-1">
                {canEdit ? "대표 편집 가능" : `${viewerName} 조회`}
              </span>
            </div>
          </div>

          <div className="px-6 pb-6">
            {/* 매출 */}
            <SectionTitle color={SERIES.revenue.color}>매출</SectionTitle>
            {st.revenue.items.map((item) => (
              <RevenueLine key={item.key} item={item} ym={ym} canEdit={canEdit} showRound={tab === "all"} />
            ))}
            <TotalLine label="매출 합계" value={st.revenue.total} />

            {/* 비용 */}
            <SectionTitle color={SERIES.cost.color} className="mt-6">비용</SectionTitle>
            <GroupLabel>수수료 (대표 몫)</GroupLabel>
            <PlainLine
              indent
              label={<>기장료 매출 <span className="text-[#8B95A1]">{won(st.revenue.bookkeeping)} × {participant.feeRate}%</span></>}
              value={st.cost.feeBookkeeping}
            />
            <PlainLine
              indent
              label={<>단건 매출 <span className="text-[#8B95A1]">{won(st.revenue.oneoff)} × {participant.oneoffRate}%</span></>}
              value={st.cost.feeOneoff}
            />
            <SubtotalLine label="수수료 소계" value={st.cost.feeTotal} />

            <GroupLabel className="mt-4">
              공통비용 <span className="font-medium text-[#8B95A1]">{participant.name} 부담분{selectedRound ? ` · ${selectedRound.seq}차 차감분` : ""}</span>
            </GroupLabel>
            <ExpenseBlock
              ym={ym}
              rows={st.cost.expenses}
              canEdit={canEdit}
              canCopyRecurring={data.canCopyRecurring && !monthHasExpenses}
              monthHasExpenses={monthHasExpenses}
              participantName={participant.name}
              defaultRoundSeq={selectedRound ? selectedRound.seq : draft.seq}
              maxRoundSeq={Math.max(draft.seq + 1, ...month.cost.expenses.map((e) => e.roundSeq))}
              showRound={tab === "all"}
            />
            <SubtotalLine label="공통비용 소계" value={st.cost.expenseShareTotal} />
            <TotalLine label="비용 합계" value={st.cost.total} />

            {/* 환불 — 수수료 없이 전액 지급 */}
            <SectionTitle color={REFUND_COLOR} className="mt-6">
              환불 <span className="text-[11.5px] font-medium text-[#8B95A1]">수수료 없이 전액 지급 · 입금액에 더함</span>
            </SectionTitle>
            <RevenueLine item={st.refund} ym={ym} canEdit={canEdit} showRound={tab === "all"} />
            <TotalLine label="환불 합계" value={st.refund.total} />

            {/* 이익 */}
            <div className="mt-6 pt-4 border-t-2 border-[#191F28]/80">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-[15px] font-bold text-[#191F28]">이익</div>
                  <div className="text-[11.5px] text-[#8B95A1] mt-0.5">
                    = 매출 − 비용{st.refund.total > 0 ? " + 환불" : ""} = {participant.name}에게 입금할 금액{selectedRound ? ` (${selectedRound.seq}차)` : " (월 합계)"}
                  </div>
                </div>
                <div className={`text-[30px] leading-none font-bold tabular-nums tracking-tight ${st.profit < 0 ? "text-[#DC2626]" : "text-[#191F28]"}`}>
                  {won(st.profit)}<span className="text-[16px] ml-0.5 text-[#6B7684] font-bold">원</span>
                </div>
              </div>
              {st.profit < 0 && (
                <div className="mt-3 text-[11.5px] text-[#DC2626] bg-[#FEF2F2] rounded-xl px-3 py-2">
                  비용이 매출보다 커서 이익이 마이너스예요. 공통비용의 차수나 출금·수납 체크를 확인해 주세요.
                </div>
              )}
              {isDraftTab && canEdit && draftCount > 0 && (
                <button type="button" onClick={handleConfirm} disabled={isPending} className="mt-4 w-full h-11 rounded-xl text-[13px] font-bold text-white bg-[#3182F6] hover:bg-[#1B64DA] transition disabled:opacity-50">
                  이 금액으로 {draft.seq}차 정산 확정
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 우측: 차수 요약 + 추이 + 대표 수취 요약 */}
        <div className="space-y-4">
          <section className="glass rounded-3xl p-5 stat-card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[14px] font-bold text-[#191F28]">{ymKo(ym)} 정산 차수</div>
                <div className="text-[11.5px] text-[#8B95A1] mt-0.5">현금이 들어온 만큼 끊어서 정산해요</div>
              </div>
              <span className="text-[11px] font-bold text-[#8B95A1] bg-[#F2F4F6] rounded-full px-2.5 py-1">{rounds.length}차 확정</span>
            </div>
            <div className="space-y-1.5">
              {rounds.map((r) => (
                <RoundRow key={r.seq} round={r} active={tab === r.seq} onClick={() => setTab(r.seq)} />
              ))}
              <RoundRow round={draft} active={tab === draft.seq} onClick={() => setTab(draft.seq)} />
              {futureExpenses.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2 text-[11.5px] text-[#8B95A1]">
                  <span>아직 차수가 없는 비용 ({futureExpenses.map((e) => `${e.roundSeq}차`).filter((v, i, a) => a.indexOf(v) === i).join("·")})</span>
                  <span className="tabular-nums">−{won(futureExpenses.reduce((s, e) => s + e.share, 0))}</span>
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-[#E5E8EB]/70 flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-[#4E5968]">월 합계 입금액</span>
              <span className="text-[16px] font-bold text-[#191F28] tabular-nums">{won(month.profit)}원</span>
            </div>
          </section>

          <PaymentCard
            ym={ym}
            participant={participant}
            canEdit={canEdit}
            payments={data.payments}
            paidTotal={data.paidTotal}
            due={month.profit}
            confirmedDue={rounds.reduce((s, r) => s + r.statement.profit, 0)}
            today={thisYM === ym ? kstToday() : `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate()).padStart(2, "0")}`}
          />

          <OutstandingCard outstanding={data.outstanding} participantName={participant.name} feeRate={participant.feeRate} />

          <section className="glass rounded-3xl p-5 stat-card">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-[14px] font-bold text-[#191F28]">{ym.slice(0, 4)}년 월별 추이</div>
                <div className="text-[11.5px] text-[#8B95A1] mt-0.5">통합 기준 · 막대를 누르면 그 달로 이동해요</div>
              </div>
              <div className="flex items-center gap-3">
                {(["revenue", "cost", "profit"] as const).map((k) => (
                  <span key={k} className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#6B7684]">
                    <span className={`inline-block ${k === "profit" ? "w-3 h-[2px] rounded-full" : "w-2.5 h-2.5 rounded-[3px]"}`} style={{ background: SERIES[k].color }} />
                    {SERIES[k].label}
                  </span>
                ))}
              </div>
            </div>
            <TaehoTrendChart points={year} selected={ym} upTo={thisYM} onSelect={(m) => router.push(href(m))} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label={`${ym.slice(0, 4)}년 누계 매출`} value={yearRevenue} />
              <MiniStat label={`${ym.slice(0, 4)}년 누계 입금액`} value={yearProfit} strong />
            </div>
          </section>

          <section className="glass rounded-3xl p-5 stat-card">
            <div className="text-[13px] font-bold text-[#191F28] mb-3">대표 수취 요약{selectedRound ? ` · ${selectedRound.seq}차` : " · 월 합계"}</div>
            <div className="space-y-2">
              <KV label="수수료 합계" value={st.cost.feeTotal} hint={`기장료 ${won(st.cost.feeBookkeeping)} + 단건 ${won(st.cost.feeOneoff)}`} />
              <KV label="공통비용 대표 부담분" value={st.cost.expenseOwnerTotal} hint={`전체 ${won(st.cost.expenseGrossTotal)} 중 ${participant.name} 부담 ${won(st.cost.expenseShareTotal)}`} />
            </div>
            <div className="mt-3 pt-3 border-t border-[#E5E8EB]/70 text-[11px] text-[#8B95A1] leading-relaxed">
              모든 금액은 공급대가(부가세 포함) 기준이에요. 정산 대상은 채권관리에서 이 달 수납 체크된 담당 거래처와 Savetax 정산에서 출금 체크된 기장·단건·환불 건입니다. 환불은 수수료 없이 전액 입금액에 더해져요. 확정된 차수는 그 시점 금액으로 고정되고, 이후 원본이 바뀌면 경고만 표시돼요.
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── 입금 기록 ───────────────────────── */

function kstToday(): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
const fmtDay = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

function PaymentCard({
  ym,
  participant,
  canEdit,
  payments,
  paidTotal,
  due,
  confirmedDue,
  today,
}: {
  ym: string;
  participant: { id: number; name: string };
  canEdit: boolean;
  payments: Payment[];
  paidTotal: number;
  /** 월 합계 입금액 (통합) */
  due: number;
  /** 확정 차수 합계 입금액 */
  confirmedDue: number;
  today: string;
}) {
  const [adding, setAdding] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const remain = due - paidTotal;
  const confirmedRemain = confirmedDue - paidTotal;
  const amountNum = Number(amount.replace(/[^\d]/g, "")) || 0;

  function submit() {
    if (amountNum === 0) { notify("입금액을 입력하세요"); return; }
    startTransition(async () => {
      try {
        await addTaehoPayment(ym, participant.id, { paidOn, amount: amountNum, note });
        notify(`${won(amountNum)}원 입금을 기록했어요`);
        setAmount(""); setNote(""); setAdding(false);
      } catch (e) {
        notify(e instanceof Error && e.message !== "FORBIDDEN" ? e.message : "기록 실패 — 대표만 할 수 있어요", { type: "error" });
      }
    });
  }

  async function remove(p: Payment) {
    if (!(await askConfirm(`${fmtDay(p.paidOn)} ${won(p.amount)}원 입금 기록을 삭제할까요?`))) return;
    startTransition(async () => {
      try { await deleteTaehoPayment(p.id); notify("삭제됐어요"); } catch { notify("삭제 실패", { type: "error" }); }
    });
  }

  const input = "border border-[#E5E8EB] bg-white rounded-lg px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#3182F6]";
  const remainTone = remain > 0 ? "text-[#3182F6]" : remain < 0 ? "text-[#DC2626]" : "text-[#15803D]";
  const remainLabel = remain > 0 ? "더 보낼 금액" : remain < 0 ? "초과 입금" : "완납";

  return (
    <section className={`glass rounded-3xl p-5 stat-card ${isPending ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[14px] font-bold text-[#191F28]">{participant.name} 입금 기록</div>
          <div className="text-[11.5px] text-[#8B95A1] mt-0.5">중간에 보낸 돈을 적어두면 잔액이 계산돼요</div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-bold text-[#8B95A1]">{remainLabel}</div>
          <div className={`text-[22px] font-bold tabular-nums leading-none mt-0.5 ${remainTone}`}>{won(Math.abs(remain))}<span className="text-[13px] ml-0.5">원</span></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <MiniStat label="월 합계 입금액" value={due} />
        <MiniStat label="기입금" value={paidTotal} strong />
        <MiniStat label="확정분 기준 잔액" value={confirmedRemain} />
      </div>

      {payments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#D1D6DB] px-3.5 py-3 text-[12px] text-[#8B95A1]">아직 기록된 입금이 없어요</div>
      ) : (
        <div className="rounded-2xl bg-white/60 border border-[#E5E8EB]/60 overflow-hidden">
          {payments.map((p) => (
            <div key={p.id} className="group flex items-center justify-between gap-3 px-3.5 py-2 border-b border-[#F2F4F6] last:border-b-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11.5px] font-bold text-[#4E5968] tabular-nums w-10 shrink-0">{fmtDay(p.paidOn)}</span>
                <span className="text-[12px] text-[#6B7684] truncate">{p.note || "입금"}</span>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                {canEdit && (
                  <button type="button" onClick={() => remove(p)} className="text-[11px] font-bold text-[#DC2626] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#FEF2F2]">삭제</button>
                )}
                <span className="text-[13px] font-bold text-[#191F28] tabular-nums">{won(p.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (adding ? (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-2 rounded-2xl bg-white/80 border border-[#A3CAFD] p-3 space-y-2">
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={input} />
            <input inputMode="numeric" autoFocus value={amount === "" ? "" : won(amountNum)} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="입금액" className={`${input} text-right tabular-nums`} />
          </div>
          <div className="flex items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택) 예) 1차 정산분" className={`${input} flex-1`} />
            <button type="button" onClick={() => setAdding(false)} className="text-[12px] font-bold text-[#6B7684] px-3 py-1.5 rounded-lg hover:bg-[#F2F4F6]">취소</button>
            <button type="submit" className="text-[12px] font-bold text-white bg-[#3182F6] px-3.5 py-1.5 rounded-lg hover:bg-[#1B64DA]">기록</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 w-full h-9 rounded-xl text-[12px] font-bold text-[#3182F6] bg-[#E8F3FF] hover:bg-[#D6E8FF] transition">
          + 입금 기록 추가
        </button>
      ))}
    </section>
  );
}

function OutstandingCard({ outstanding, participantName, feeRate }: { outstanding: Outstanding; participantName: string; feeRate: number }) {
  const [open, setOpen] = useState(false);
  const n = outstanding.rows.length;
  return (
    <section className="glass rounded-3xl p-5 stat-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[14px] font-bold text-[#191F28]">{participantName} 미수 · 추가 입금 예상</div>
          <div className="text-[11.5px] text-[#8B95A1] mt-0.5">이 달 아직 수납·출금 안 된 거래처. 들어오면 다음 차수에 쌓여요</div>
        </div>
        <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${n > 0 ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#E7F7EE] text-[#15803D]"}`}>{n > 0 ? `${n}건 미수` : "미수 없음"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="미수 매출" value={outstanding.total} />
        <MiniStat label={`예상 추가 입금액 (× ${100 - feeRate}%)`} value={outstanding.expectedPayout} strong />
      </div>
      {n > 0 && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-[11.5px] font-bold text-[#3182F6] hover:underline">
            {open ? "거래처 접기" : `거래처 ${n}곳 보기`}
          </button>
          {open && (
            <div className="mt-1.5 rounded-2xl bg-white/60 border border-[#E5E8EB]/60 overflow-hidden max-h-[260px] overflow-y-auto">
              {outstanding.rows.map((r) => (
                <div key={`${r.source}-${r.refId}`} className="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-[#F2F4F6] last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[12.5px] text-[#191F28] truncate">{r.name}</span>
                    <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${SOURCE_CHIP[r.source].cls}`}>{SOURCE_CHIP[r.source].label}</span>
                  </div>
                  <span className="text-[12.5px] font-bold text-[#191F28] tabular-nums">{won(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ───────────────────────── 탭·차수 ───────────────────────── */

function TabPill({ active, onClick, children, dashed }: { active: boolean; onClick: () => void; children: ReactNode; dashed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3.5 rounded-xl text-[12.5px] font-bold flex items-center transition ${
        active
          ? "text-white bg-[#3182F6] shadow-md shadow-[#3182F6]/25"
          : `glass-strong text-[#6B7684] hover:text-[#191F28] hover:-translate-y-px ${dashed ? "border-dashed" : ""}`
      }`}
    >
      {children}
    </button>
  );
}

function RoundRow({ round, active, onClick }: { round: RoundView; active: boolean; onClick: () => void }) {
  const s = round.statement;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition ${
        active ? "bg-[#E8F3FF]" : "bg-white/60 hover:bg-white/90"
      } ${!round.confirmed ? "border border-dashed border-[#D1D6DB]" : "border border-[#E5E8EB]/60"}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0 ${round.confirmed ? "bg-[#3182F6] text-white" : "bg-[#F2F4F6] text-[#8B95A1]"}`}>
          {round.seq}
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-[#191F28] flex items-center gap-1.5">
            {round.seq}차 {round.confirmed ? "확정" : "미정산"}
            {round.warnings > 0 && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#FFFBEB] text-[#B45309]">⚠ {round.warnings}</span>}
          </div>
          <div className="text-[10.5px] text-[#8B95A1]">
            {round.confirmed && round.settledAt ? `${fmtWhen(round.settledAt)} · ` : ""}
            입금 {s.revenue.count}건 · 매출 {won(s.revenue.total)}{s.refund.total > 0 ? ` · 환불 ${won(s.refund.total)}` : ""}
          </div>
        </div>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className={`text-[14px] font-bold tabular-nums ${round.confirmed ? "text-[#191F28]" : "text-[#4E5968]"}`}>{won(s.profit)}원</div>
        {!round.confirmed && <div className="text-[10px] text-[#8B95A1]">확정 전</div>}
      </div>
    </button>
  );
}

/* ───────────────────────── 카드 ───────────────────────── */

function DeltaPill({ value, prev, inverse }: { value: number; prev?: number; inverse?: boolean }) {
  if (prev === undefined) return null;
  const diff = value - prev;
  if (diff === 0) return <span className="text-[11px] font-bold text-[#8B95A1] bg-[#F2F4F6] rounded-full px-2 py-0.5">전월과 동일</span>;
  const good = inverse ? diff < 0 : diff > 0;
  const pctText = prev !== 0 ? ` (${Math.abs(Math.round((diff / Math.abs(prev)) * 100))}%)` : "";
  return (
    <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 tabular-nums ${good ? "text-[#15803D] bg-[#E7F7EE]" : "text-[#DC2626] bg-[#FEF2F2]"}`} title="전월 대비">
      {diff > 0 ? "▲" : "▼"} {won(Math.abs(diff))}{pctText}
    </span>
  );
}

function StatCard({ label, value, prev, color, caption, inverse }: { label: string; value: number; prev?: number; color: string; caption: string; inverse?: boolean }) {
  return (
    <div className="glass rounded-2xl p-5 stat-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-bold text-[#6B7684]">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          {label}
        </div>
        <DeltaPill value={value} prev={prev} inverse={inverse} />
      </div>
      <div className="text-[26px] font-bold text-[#191F28] mt-2 tracking-tight tabular-nums">
        {won(value)}<span className="text-[15px] ml-0.5 text-[#6B7684]">원</span>
      </div>
      <div className="text-[11.5px] text-[#8B95A1] mt-1 truncate">{caption}</div>
    </div>
  );
}

function HeroCard({ label, value, prev, caption }: { label: string; value: number; prev?: number; caption: string }) {
  return (
    <div className="rounded-2xl p-5 gradient-blue text-white shadow-lg shadow-[#3182F6]/30 stat-card relative overflow-hidden">
      <div className="absolute -right-6 -top-8 w-32 h-32 rounded-full bg-white/10" />
      <div className="absolute right-10 -bottom-10 w-24 h-24 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="text-[12px] font-bold text-white/85 truncate">{label}</div>
        {prev !== undefined && (
          <span className="text-[11px] font-bold bg-white/20 rounded-full px-2 py-0.5 tabular-nums whitespace-nowrap">
            {value - prev === 0 ? "전월과 동일" : `${value - prev > 0 ? "▲" : "▼"} ${won(Math.abs(value - prev))}`}
          </span>
        )}
      </div>
      <div className="relative text-[32px] font-bold mt-2 tracking-tight tabular-nums leading-none">
        {won(value)}<span className="text-[16px] ml-1 text-white/80">원</span>
      </div>
      <div className="relative text-[11.5px] text-white/75 mt-2">{caption}</div>
    </div>
  );
}

function MiniStat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white/60 border border-[#E5E8EB]/60 px-3.5 py-2.5">
      <div className="text-[11px] text-[#8B95A1] font-medium">{label}</div>
      <div className={`text-[15px] font-bold tabular-nums mt-0.5 ${strong ? "text-[#191F28]" : "text-[#4E5968]"}`}>{won(value)}원</div>
    </div>
  );
}

function KV({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[12.5px] text-[#4E5968] font-medium">{label}</div>
        {hint && <div className="text-[11px] text-[#8B95A1] mt-0.5">{hint}</div>}
      </div>
      <div className="text-[14px] font-bold text-[#191F28] tabular-nums whitespace-nowrap">{won(value)}원</div>
    </div>
  );
}

/* ───────────────────────── 손익계산서 줄 ───────────────────────── */

function SectionTitle({ children, color, className = "" }: { children: ReactNode; color: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 pb-2 mb-1 border-b border-[#E5E8EB]/80 ${className}`}>
      <span className="w-1.5 h-4 rounded-full" style={{ background: color }} />
      <span className="text-[13.5px] font-bold text-[#191F28]">{children}</span>
    </div>
  );
}

function GroupLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pl-3 pt-2 pb-1 text-[12.5px] font-bold text-[#4E5968] ${className}`}>{children}</div>;
}

function PlainLine({ label, value, indent }: { label: ReactNode; value: number; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${indent ? "pl-7" : "pl-3"}`}>
      <div className="text-[12.5px] text-[#4E5968]">{label}</div>
      <div className="text-[13px] font-medium text-[#191F28] tabular-nums">{won(value)}</div>
    </div>
  );
}

function SubtotalLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 pl-7 mt-0.5 border-t border-dashed border-[#E5E8EB]">
      <div className="text-[12px] font-bold text-[#6B7684]">{label}</div>
      <div className="text-[13px] font-bold text-[#4E5968] tabular-nums">{won(value)}</div>
    </div>
  );
}

function TotalLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 pl-3 mt-1 border-t border-[#191F28]/40">
      <div className="text-[13px] font-bold text-[#191F28]">{label}</div>
      <div className="text-[15px] font-bold text-[#191F28] tabular-nums">{won(value)}</div>
    </div>
  );
}

function RevenueLine({ item, ym, canEdit, showRound }: { item: RevenueItem; ym: string; canEdit: boolean; showRound: boolean }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const count = item.rows.length;
  const included = count - item.excludedCount;

  function toggleExcluded(r: RevenueRow) {
    startTransition(async () => {
      try {
        await setTaehoRevenueExcluded(ym, r.source, r.refId, !r.excluded, r.name);
        notify(r.excluded ? `'${r.name}' 다시 계산에 포함했어요` : `'${r.name}' 이번 달 계산에서 제외했어요`);
      } catch (e) {
        notify(e instanceof Error && e.message !== "FORBIDDEN" ? e.message : "변경 실패 — 대표만 바꿀 수 있어요", { type: "error" });
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => count > 0 && setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 py-2 pl-3 pr-1 rounded-xl text-left transition ${count > 0 ? "hover:bg-white/70 cursor-pointer" : "cursor-default"}`}
        title={item.hint}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] text-[#8B95A1] transition-transform ${open ? "rotate-90" : ""} ${count === 0 ? "opacity-0" : ""}`}>▶</span>
          <span className="text-[13px] font-medium text-[#191F28]">{item.label}</span>
          <span className={`text-[10.5px] font-bold rounded-full px-1.5 py-0.5 ${count > 0 ? SOURCE_CHIP[item.key].cls : "bg-[#F2F4F6] text-[#B0B8C1]"}`}>{included}건</span>
          {item.excludedCount > 0 && (
            <span className="text-[10.5px] font-bold rounded-full px-1.5 py-0.5 bg-[#F2F4F6] text-[#8B95A1]" title="이번 달 계산에서 제외한 건수">제외 {item.excludedCount}</span>
          )}
        </div>
        <div className={`text-[13.5px] font-bold tabular-nums ${included > 0 ? "text-[#191F28]" : "text-[#B0B8C1]"}`}>{won(item.total)}</div>
      </button>
      {open && count > 0 && (
        <div className={`ml-7 mr-1 mb-2 rounded-2xl bg-white/60 border border-[#E5E8EB]/60 overflow-hidden ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
          {item.rows.map((r, i) => {
            const confirmed = r.roundSeq !== null;
            const muted = r.excluded;
            return (
              <div
                key={`${r.source}-${r.refId}-${r.yearMonth}-${i}`}
                className={`group flex items-center justify-between gap-3 px-3.5 py-2 border-b border-[#F2F4F6] last:border-b-0 ${muted ? "bg-[#F9FAFB]" : ""}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[12.5px] truncate ${muted ? "text-[#B0B8C1] line-through" : "text-[#191F28]"}`}>{r.name}</span>
                  <span className="text-[10.5px] text-[#8B95A1] tabular-nums">{ymLabel(r.yearMonth)}</span>
                  <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${muted ? "bg-[#F2F4F6] text-[#B0B8C1]" : SOURCE_CHIP[r.source].cls}`}>{SOURCE_CHIP[r.source].label}</span>
                  {showRound && (
                    confirmed
                      ? <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#E7F7EE] text-[#15803D]">{r.roundSeq}차</span>
                      : !muted && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#FEF2F2] text-[#DC2626]">미정산</span>
                  )}
                  {r.excluded && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#FEF2F2] text-[#DC2626]" title="원본 행은 그대로 있고, 이번 달 정산 계산에서만 빠져 있어요">계산 제외</span>}
                  {r.status === "unchecked" && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#FFFBEB] text-[#B45309]" title="확정 뒤 채권관리 수납 체크 또는 Savetax 출금 체크가 풀렸어요. 확정 내역은 그대로 유지돼요">⚠ 원본 체크 해제됨</span>}
                  {r.status === "changed" && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#FFFBEB] text-[#B45309]" title={`확정 당시 ${won(r.amount)}원, 지금 원본은 ${won(r.liveAmount ?? 0)}원`}>⚠ 금액 변경 (현재 {won(r.liveAmount ?? 0)})</span>}
                  {r.note && <span className="text-[10.5px] text-[#8B95A1] truncate" title={r.note}>{r.note}</span>}
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {canEdit && !confirmed && (
                    <button
                      type="button"
                      onClick={() => toggleExcluded(r)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg transition ${
                        r.excluded
                          ? "text-[#3182F6] bg-[#E8F3FF] hover:bg-[#D6E8FF]"
                          : "text-[#6B7684] opacity-0 group-hover:opacity-100 hover:bg-[#F2F4F6]"
                      }`}
                      title={r.excluded ? "이번 달 계산에 다시 넣기" : "원본은 두고 이번 달 계산에서만 빼기"}
                    >
                      {r.excluded ? "다시 포함" : "계산에서 제외"}
                    </button>
                  )}
                  <span className={`text-[12.5px] font-bold tabular-nums ${muted ? "text-[#B0B8C1] line-through" : "text-[#191F28]"}`}>{won(r.amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── 공통비용 (인라인 편집) ───────────────────────── */

type Draft = { label: string; amount: string; shareRate: string; recurring: boolean; roundSeq: number; note: string };
const emptyDraft = (roundSeq: number): Draft => ({ label: "", amount: "", shareRate: "50", recurring: true, roundSeq, note: "" });
const toDraft = (r: ExpenseRow): Draft => ({ label: r.label, amount: String(r.amount), shareRate: String(r.shareRate), recurring: r.recurring, roundSeq: r.roundSeq, note: r.note ?? "" });
const fromDraft = (d: Draft): ExpenseInput => ({
  label: d.label,
  amount: Number(String(d.amount).replace(/[^\d-]/g, "")) || 0,
  shareRate: Number(d.shareRate) || 0,
  recurring: d.recurring,
  roundSeq: d.roundSeq,
  note: d.note || null,
});

function ExpenseBlock({
  ym,
  rows,
  canEdit,
  canCopyRecurring,
  monthHasExpenses,
  participantName,
  defaultRoundSeq,
  maxRoundSeq,
  showRound,
}: {
  ym: string;
  rows: ExpenseRow[];
  canEdit: boolean;
  canCopyRecurring: boolean;
  monthHasExpenses: boolean;
  participantName: string;
  defaultRoundSeq: number;
  maxRoundSeq: number;
  showRound: boolean;
}) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(id: number | "new", draft: Draft) {
    const input = fromDraft(draft);
    if (!input.label.trim()) { notify("항목명을 입력하세요"); return; }
    startTransition(async () => {
      try {
        if (id === "new") await createTaehoExpense(ym, input);
        else await updateTaehoExpense(id, input);
        setEditing(null);
        notify("저장됐어요");
      } catch (e) {
        notify(e instanceof Error && e.message !== "FORBIDDEN" ? e.message : "저장 실패 — 대표만 수정할 수 있어요", { type: "error" });
      }
    });
  }

  async function remove(r: ExpenseRow) {
    if (!(await askConfirm(`'${r.label}' 항목을 삭제할까요?`))) return;
    startTransition(async () => {
      try {
        await deleteTaehoExpense(r.id);
        notify("삭제됐어요");
      } catch {
        notify("삭제 실패", { type: "error" });
      }
    });
  }

  function copyPrev() {
    startTransition(async () => {
      try {
        const n = await copyRecurringExpenses(ym);
        notify(n > 0 ? `전월 반복 항목 ${n}개를 가져왔어요` : "가져올 항목이 없어요");
      } catch {
        notify("가져오기 실패", { type: "error" });
      }
    });
  }

  const editorProps = { participantName, maxRoundSeq };

  return (
    <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
      {rows.length === 0 && editing !== "new" && (
        <div className="ml-7 mr-1 my-1 rounded-2xl border border-dashed border-[#D1D6DB] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] text-[#8B95A1]">
            {monthHasExpenses
              ? `${defaultRoundSeq}차에서 차감하는 공통비용이 없어요. (다른 차수의 항목은 통합 I/S에서 볼 수 있어요)`
              : `이번 달 공통비용 항목이 없어요${canEdit ? "." : ". 대표가 입력하면 여기에 표시돼요."}`}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {canCopyRecurring && (
                <button type="button" onClick={copyPrev} className="text-[12px] font-bold text-[#3182F6] bg-[#E8F3FF] rounded-lg px-3 py-1.5 hover:bg-[#D6E8FF] transition">
                  전월 반복 항목 가져오기
                </button>
              )}
              <button type="button" onClick={() => setEditing("new")} className="text-[12px] font-bold text-[#4E5968] bg-white rounded-lg px-3 py-1.5 border border-[#E5E8EB] hover:bg-[#F9FAFB] transition">
                + 직접 추가
              </button>
            </div>
          )}
        </div>
      )}

      {rows.map((r) =>
        editing === r.id ? (
          <ExpenseEditor key={r.id} initial={toDraft(r)} onSave={(d) => save(r.id, d)} onCancel={() => setEditing(null)} {...editorProps} />
        ) : (
          <div key={r.id} className="group flex items-center justify-between gap-3 py-1.5 pl-7 pr-1 rounded-xl hover:bg-white/70 transition">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[12.5px] text-[#191F28] truncate">{r.label}</span>
              {showRound && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#E8F3FF] text-[#1B64DA]" title="이 차수에서 차감">{r.roundSeq}차</span>}
              {r.recurring && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[#F2F4F6] text-[#6B7684]" title="매월 반복 항목">반복</span>}
              <span className="text-[11px] text-[#8B95A1] tabular-nums whitespace-nowrap">전체 {won(r.amount)} × {r.shareRate}%</span>
              {r.note && <span className="text-[10.5px] text-[#8B95A1] truncate" title={r.note}>{r.note}</span>}
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap">
              {canEdit && (
                <span className="hidden group-hover:flex items-center gap-1">
                  <button type="button" onClick={() => setEditing(r.id)} className="text-[11px] font-bold text-[#3182F6] px-1.5 py-0.5 rounded hover:bg-[#E8F3FF]">수정</button>
                  <button type="button" onClick={() => remove(r)} className="text-[11px] font-bold text-[#DC2626] px-1.5 py-0.5 rounded hover:bg-[#FEF2F2]">삭제</button>
                </span>
              )}
              <span className="text-[13px] font-medium text-[#191F28] tabular-nums">{won(r.share)}</span>
            </div>
          </div>
        )
      )}

      {editing === "new" && (
        <ExpenseEditor initial={emptyDraft(defaultRoundSeq)} onSave={(d) => save("new", d)} onCancel={() => setEditing(null)} {...editorProps} />
      )}

      {canEdit && rows.length > 0 && editing !== "new" && (
        <button type="button" onClick={() => setEditing("new")} className="ml-7 mt-1 text-[11.5px] font-bold text-[#3182F6] hover:underline">
          + 항목 추가
        </button>
      )}
    </div>
  );
}

function ExpenseEditor({
  initial,
  onSave,
  onCancel,
  participantName,
  maxRoundSeq,
}: {
  initial: Draft;
  onSave: (d: Draft) => void;
  onCancel: () => void;
  participantName: string;
  maxRoundSeq: number;
}) {
  const [d, setD] = useState<Draft>(initial);
  const amount = Number(String(d.amount).replace(/[^\d]/g, "")) || 0;
  const share = Math.round((amount * (Number(d.shareRate) || 0)) / 100);
  const input = "border border-[#E5E8EB] bg-white rounded-lg px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#3182F6]";
  const seqOptions = Array.from({ length: Math.max(maxRoundSeq, d.roundSeq) }, (_, i) => i + 1);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(d); }}
      className="ml-7 mr-1 my-1.5 rounded-2xl bg-white/80 border border-[#A3CAFD] p-3 space-y-2"
    >
      <div className="grid grid-cols-[1.4fr_1fr_0.6fr_0.6fr] gap-2">
        <label className="block">
          <span className="text-[10.5px] text-[#8B95A1] font-medium">항목명</span>
          <input autoFocus value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="예) 사무실 임차료" className={`${input} w-full`} />
        </label>
        <label className="block">
          <span className="text-[10.5px] text-[#8B95A1] font-medium">전체 금액 (부가세 포함)</span>
          <input inputMode="numeric" value={d.amount === "" ? "" : won(amount)} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/[^\d]/g, "") })} placeholder="0" className={`${input} w-full text-right tabular-nums`} />
        </label>
        <label className="block">
          <span className="text-[10.5px] text-[#8B95A1] font-medium">{participantName} 부담 %</span>
          <input type="number" min={0} max={100} value={d.shareRate} onChange={(e) => setD({ ...d, shareRate: e.target.value })} className={`${input} w-full text-right tabular-nums`} />
        </label>
        <label className="block">
          <span className="text-[10.5px] text-[#8B95A1] font-medium">차감 차수</span>
          <select value={d.roundSeq} onChange={(e) => setD({ ...d, roundSeq: Number(e.target.value) })} className={`${input} w-full`} title="이 비용을 몇 차 정산에서 뺄지">
            {seqOptions.map((n) => <option key={n} value={n}>{n}차</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="메모 (선택)" className={`${input} flex-1 min-w-[140px]`} />
        <label className="flex items-center gap-1.5 text-[12px] text-[#4E5968] cursor-pointer select-none">
          <input type="checkbox" checked={d.recurring} onChange={(e) => setD({ ...d, recurring: e.target.checked })} className="accent-[#3182F6] w-3.5 h-3.5" />
          매월 반복
        </label>
        <span className="text-[12px] text-[#6B7684] tabular-nums ml-auto">
          부담분 <b className="text-[#191F28]">{won(share)}원</b>
        </span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onCancel} className="text-[12px] font-bold text-[#6B7684] px-3 py-1.5 rounded-lg hover:bg-[#F2F4F6]">취소</button>
          <button type="submit" className="text-[12px] font-bold text-white bg-[#3182F6] px-3.5 py-1.5 rounded-lg hover:bg-[#1B64DA]">저장</button>
        </div>
      </div>
    </form>
  );
}
