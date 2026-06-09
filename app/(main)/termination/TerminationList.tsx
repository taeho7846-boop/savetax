"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setClientContractStatus } from "@/app/actions/clients";
import {
  toggleTerminationField,
  setClosureVat,
  setTerminationFee,
  setTerminationReason,
  setTerminationNotes,
  setTerminationCompleted,
} from "@/app/actions/termination";

export type TerminationRow = {
  id: number;
  name: string;
  ceoName: string | null;
  bizNumber: string | null;
  clientType: string;
  monthlyFee: number | null;
  cmsStatus: string;
  laborTypes: string | null;
  assignedName: string | null;
  startedAt: string;
  reason: string | null;
  notes: string | null;
  completedAt: string | null;
  ediPensionDone: boolean;
  ediHealthDone: boolean;
  ediEmploymentDone: boolean;
  cmsTerminated: boolean;
  hometaxTerminated: boolean;
  closureVat: string; // na | needed | done
  feeSeparate: boolean;
  feeAmount: number | null;
  feePaid: boolean;
};

type Filter = "active" | "done" | "all";

// 한 거래처의 해지 진행률(완료 항목 / 전체 항목)
function progressOf(r: TerminationRow) {
  const items: boolean[] = [
    r.ediPensionDone,
    r.ediHealthDone,
    r.ediEmploymentDone,
    r.cmsTerminated,
  ];
  if (r.clientType === "corporate") items.push(r.hometaxTerminated);
  // 폐업부가세: '신고필요'만 미완료로 간주 (해당없음/신고완료는 완료)
  items.push(r.closureVat !== "needed");
  // 수수료: 별도수령인데 미입금이면 미완료
  items.push(!(r.feeSeparate && !r.feePaid));
  const done = items.filter(Boolean).length;
  return { done, total: items.length };
}

function fmtDate(iso: string) {
  return iso.slice(0, 10).replace(/-/g, ".");
}

export function TerminationList({ rows, readonly }: { rows: TerminationRow[]; readonly: boolean }) {
  const [filter, setFilter] = useState<Filter>("active");

  const activeCount = rows.filter((r) => !r.completedAt).length;
  const doneCount = rows.filter((r) => r.completedAt).length;
  const unpaidFee = rows
    .filter((r) => r.feeSeparate && !r.feePaid)
    .reduce((s, r) => s + (r.feeAmount ?? 0), 0);

  const visible = useMemo(() => {
    if (filter === "active") return rows.filter((r) => !r.completedAt);
    if (filter === "done") return rows.filter((r) => r.completedAt);
    return rows;
  }, [rows, filter]);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">TERMINATION</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight mt-1 flex items-baseline gap-2">
            해지관리
            <span className="text-[#3182F6]">{rows.length.toLocaleString()}</span>
            <span className="text-[16px] text-[#6B7684] font-medium">곳</span>
          </h1>
          <div className="text-[12px] text-[#6B7684] mt-1">
            거래처에서 해지처리하면 자동으로 이곳에 등록됩니다 · EDI·CMS·홈택스·폐업부가세·수수료 마무리 체크
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <div className="stat-card glass rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute left-0 top-5 bottom-5 w-1 bg-[#F59E0B] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] tracking-wide uppercase pl-2">진행중</div>
          <div className="text-[26px] font-extrabold text-[#191F28] mt-1.5 leading-none pl-2">{activeCount}</div>
          <div className="text-[11px] text-[#8B95A1] mt-1.5 pl-2">마무리 작업이 남은 거래처</div>
        </div>
        <div className="stat-card glass rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute left-0 top-5 bottom-5 w-1 bg-[#15803D] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] tracking-wide uppercase pl-2">완료</div>
          <div className="text-[26px] font-extrabold text-[#191F28] mt-1.5 leading-none pl-2">{doneCount}</div>
          <div className="text-[11px] text-[#8B95A1] mt-1.5 pl-2">해지 처리 완료</div>
        </div>
        <div className="stat-card glass rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute left-0 top-5 bottom-5 w-1 bg-[#E02E2E] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] tracking-wide uppercase pl-2">미수 수수료</div>
          <div className="text-[26px] font-extrabold text-[#191F28] mt-1.5 leading-none pl-2 tabular-nums">
            {unpaidFee.toLocaleString()}
            <span className="text-[14px] text-[#6B7684] font-bold ml-1">원</span>
          </div>
          <div className="text-[11px] text-[#8B95A1] mt-1.5 pl-2">별도 수수료 미입금 합계</div>
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="flex items-center gap-1.5 mb-4">
        {([
          ["active", `진행중 ${activeCount}`],
          ["done", `완료 ${doneCount}`],
          ["all", `전체 ${rows.length}`],
        ] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3.5 h-9 rounded-xl text-[13px] font-bold transition-colors ${
              filter === key
                ? "bg-[#191F28] text-white"
                : "bg-white text-[#6B7684] border border-[#E5E8EB] hover:bg-[#F9FAFB]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      {visible.length === 0 ? (
        <div className="glass rounded-3xl py-16 text-center text-[#8B95A1] text-sm">
          {filter === "done" ? "완료된 해지 건이 없습니다" : "진행중인 해지 건이 없습니다"}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((r) => (
            <TerminationCard key={r.id} row={r} readonly={readonly} />
          ))}
        </div>
      )}
    </div>
  );
}

function TerminationCard({ row, readonly }: { row: TerminationRow; readonly: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [r, setR] = useState(row);
  const [isPending, startTransition] = useTransition();

  const { done, total } = progressOf(r);
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;
  const completed = !!r.completedAt;

  function patch(p: Partial<TerminationRow>) {
    setR((prev) => ({ ...prev, ...p }));
  }

  function toggle(
    field: "ediPensionDone" | "ediHealthDone" | "ediEmploymentDone" | "cmsTerminated" | "hometaxTerminated",
    value: boolean,
  ) {
    if (readonly) return;
    patch({ [field]: value } as Partial<TerminationRow>);
    startTransition(async () => {
      await toggleTerminationField(r.id, field, value);
    });
  }

  function changeClosureVat(status: "na" | "needed" | "done") {
    if (readonly) return;
    patch({ closureVat: status });
    startTransition(async () => {
      await setClosureVat(r.id, status);
    });
  }

  function saveFee(separate: boolean, amount: number | null, paid: boolean) {
    if (readonly) return;
    patch({ feeSeparate: separate, feeAmount: separate ? amount : null, feePaid: separate ? paid : false });
    startTransition(async () => {
      await setTerminationFee(r.id, separate, amount, paid);
    });
  }

  function complete(next: boolean) {
    if (readonly) return;
    patch({ completedAt: next ? new Date().toISOString() : null });
    startTransition(async () => {
      await setTerminationCompleted(r.id, next);
      router.refresh();
    });
  }

  function reactivate() {
    if (readonly) return;
    if (!confirm(`'${r.name}'을(를) 다시 '계약중'으로 되돌리시겠습니까?\n(해지 체크리스트 기록은 보존됩니다)`)) return;
    startTransition(async () => {
      await setClientContractStatus(r.id, "active");
      router.refresh();
    });
  }

  return (
    <div className={`glass rounded-2xl overflow-hidden transition-shadow ${completed ? "opacity-70" : ""}`}>
      {/* 카드 헤더 (클릭하면 펼침) */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[#F9FAFB]/60 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-[#191F28] truncate">{r.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F2F4F6] text-[#6B7684] shrink-0">
              {r.clientType === "corporate" ? "법인" : "개인"}
            </span>
            {completed ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E7F7EE] text-[#15803D] font-bold shrink-0">
                완료
              </span>
            ) : allDone ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E8F3FF] text-[#3182F6] font-bold shrink-0">
                마무리 가능
              </span>
            ) : null}
            {r.feeSeparate && !r.feePaid && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FEF2F2] text-[#E02E2E] font-bold shrink-0">
                수수료 미입금
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#8B95A1] mt-1">
            {r.ceoName || "-"} · {r.bizNumber || "사업자번호 없음"} · 해지 {fmtDate(r.startedAt)}
            {r.assignedName && ` · 담당 ${r.assignedName}`}
          </div>
        </div>

        {/* 진행률 */}
        <div className="shrink-0 w-28">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-[#8B95A1]">{done}/{total}</span>
            <span className={`text-[11px] font-bold ${allDone ? "text-[#15803D]" : "text-[#4E5968]"}`}>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#F2F4F6] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allDone ? "bg-[#15803D]" : "bg-[#3182F6]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className={`text-[#B0B8C1] text-xs transition-transform shrink-0 ${open ? "rotate-90" : ""}`}>▶</span>
      </button>

      {/* 펼친 상세 */}
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-[#F2F4F6] space-y-4">
          {/* EDI 4대보험 */}
          <Section title="EDI 해지 (4대보험)">
            <div className="flex flex-wrap gap-2">
              <CheckChip label="연금" on={r.ediPensionDone} disabled={readonly || isPending} onClick={() => toggle("ediPensionDone", !r.ediPensionDone)} />
              <CheckChip label="건강" on={r.ediHealthDone} disabled={readonly || isPending} onClick={() => toggle("ediHealthDone", !r.ediHealthDone)} />
              <CheckChip label="고용·산재" on={r.ediEmploymentDone} disabled={readonly || isPending} onClick={() => toggle("ediEmploymentDone", !r.ediEmploymentDone)} />
            </div>
          </Section>

          {/* CMS / 홈택스 */}
          <Section title="해지 처리">
            <div className="flex flex-wrap gap-2">
              <CheckChip label="CMS(더빌) 해지" on={r.cmsTerminated} disabled={readonly || isPending} onClick={() => toggle("cmsTerminated", !r.cmsTerminated)} />
              {r.clientType === "corporate" && (
                <CheckChip label="홈택스 수임 해지" on={r.hometaxTerminated} disabled={readonly || isPending} onClick={() => toggle("hometaxTerminated", !r.hometaxTerminated)} />
              )}
            </div>
          </Section>

          {/* 폐업부가세 */}
          <Section title="폐업부가세 신고">
            <div className="inline-flex rounded-xl border border-[#E5E8EB] overflow-hidden">
              {([
                ["na", "해당없음"],
                ["needed", "신고필요"],
                ["done", "신고완료"],
              ] as [string, string][]).map(([val, label]) => (
                <button
                  key={val}
                  disabled={readonly || isPending}
                  onClick={() => changeClosureVat(val as "na" | "needed" | "done")}
                  className={`px-3.5 h-9 text-[12.5px] font-bold transition-colors disabled:opacity-50 ${
                    r.closureVat === val
                      ? val === "needed"
                        ? "bg-[#FEF2F2] text-[#E02E2E]"
                        : val === "done"
                        ? "bg-[#E7F7EE] text-[#15803D]"
                        : "bg-[#F2F4F6] text-[#4E5968]"
                      : "bg-white text-[#8B95A1] hover:bg-[#F9FAFB]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* 수수료 별도 */}
          <Section title="해지 수수료 (별도 수령)">
            <FeeEditor
              disabled={readonly || isPending}
              separate={r.feeSeparate}
              amount={r.feeAmount}
              paid={r.feePaid}
              onSave={saveFee}
            />
          </Section>

          {/* 사유 / 메모 */}
          <Section title="사유 · 메모">
            <TextField
              disabled={readonly}
              placeholder="해지 사유 (예: 폐업, 타사무실 이관, 자체기장 등)"
              value={r.reason}
              onSave={(v) => {
                patch({ reason: v || null });
                startTransition(async () => { await setTerminationReason(r.id, v); });
              }}
            />
            <TextField
              disabled={readonly}
              placeholder="메모 (인수인계 자료, 특이사항 등)"
              value={r.notes}
              onSave={(v) => {
                patch({ notes: v || null });
                startTransition(async () => { await setTerminationNotes(r.id, v); });
              }}
            />
          </Section>

          {/* 액션 */}
          {!readonly && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={reactivate}
                disabled={isPending}
                className="text-[12px] px-3 py-2 rounded-xl bg-[#F1FBF4] text-[#15803D] hover:bg-[#E7F7EE] disabled:opacity-50"
              >
                ↩ 해지취소 (계약중으로)
              </button>
              <button
                onClick={() => complete(!completed)}
                disabled={isPending}
                className={`text-[12.5px] font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 ${
                  completed
                    ? "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"
                    : "bg-[#191F28] text-white hover:bg-[#333D4B]"
                }`}
              >
                {completed ? "완료 취소" : "해지 완료 처리"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-[#8B95A1] mb-2">{title}</div>
      {children}
    </div>
  );
}

function CheckChip({ label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-[12.5px] font-bold transition-colors disabled:opacity-50 ${
        on
          ? "bg-[#E7F7EE] text-[#15803D] border border-[#BBF7D0]"
          : "bg-white text-[#6B7684] border border-[#E5E8EB] hover:bg-[#F9FAFB]"
      }`}
    >
      <span className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] ${on ? "bg-[#15803D] text-white" : "bg-[#F2F4F6] text-transparent"}`}>✓</span>
      {label}
    </button>
  );
}

function FeeEditor({
  separate,
  amount,
  paid,
  disabled,
  onSave,
}: {
  separate: boolean;
  amount: number | null;
  paid: boolean;
  disabled?: boolean;
  onSave: (separate: boolean, amount: number | null, paid: boolean) => void;
}) {
  const [amt, setAmt] = useState<string>(amount != null ? String(amount) : "");

  if (!separate) {
    return (
      <button
        onClick={() => onSave(true, null, false)}
        disabled={disabled}
        className="text-[12.5px] px-3 h-9 rounded-xl bg-white text-[#6B7684] border border-[#E5E8EB] hover:bg-[#F9FAFB] disabled:opacity-50"
      >
        + 별도 수수료 받기
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center bg-white rounded-xl border border-[#E5E8EB] px-3 h-9">
        <input
          type="text"
          inputMode="numeric"
          value={amt}
          disabled={disabled}
          onChange={(e) => setAmt(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => onSave(true, amt ? Number(amt) : null, paid)}
          placeholder="금액"
          className="w-24 text-[13px] text-right outline-none tabular-nums bg-transparent"
        />
        <span className="text-[12px] text-[#8B95A1] ml-1">원</span>
      </div>
      <button
        onClick={() => onSave(true, amt ? Number(amt) : null, !paid)}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-[12.5px] font-bold transition-colors disabled:opacity-50 ${
          paid ? "bg-[#E7F7EE] text-[#15803D] border border-[#BBF7D0]" : "bg-[#FEF2F2] text-[#E02E2E] border border-[#FECACA]"
        }`}
      >
        {paid ? "입금완료" : "미입금"}
      </button>
      <button
        onClick={() => onSave(false, null, false)}
        disabled={disabled}
        className="text-[12px] px-2.5 h-9 rounded-xl text-[#8B95A1] hover:bg-[#F9FAFB] disabled:opacity-50"
      >
        해제
      </button>
    </div>
  );
}

function TextField({
  value,
  placeholder,
  disabled,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  disabled?: boolean;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value ?? "");
  return (
    <input
      type="text"
      value={v}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v.trim() !== (value ?? "").trim()) onSave(v);
      }}
      className="w-full text-[13px] bg-white rounded-xl border border-[#E5E8EB] px-3.5 h-10 outline-none focus:border-[#3182F6] disabled:opacity-50 mb-2 last:mb-0"
    />
  );
}
