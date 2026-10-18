"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { setSemoReportStatus } from "@/app/actions/clients";
import type { SemoItem, SemoRow } from "@/lib/semo-report";

type SemoStatus = "use" | "none" | "excluded";
type Result = {
  fileName: string;
  semoCount: number;
  clientCount: number;
  summary: { matched: number; matchedNeedUse: number; missing: number; terminated: number; semoOnly: number; excluded: number };
  groups: { matched: SemoItem[]; missing: SemoItem[]; terminated: SemoItem[]; excluded: SemoItem[]; semoOnly: SemoRow[] };
};
type GroupKey = "missing" | "terminated" | "matched" | "semoOnly" | "excluded";

const STATUS_STYLE: Record<string, string> = {
  use: "bg-[#E8F3FF] text-[#1B64DA] border-[#A3CAFD]",
  none: "bg-[#F2F4F6] text-[#6B7684] border-[#D1D6DB]",
  excluded: "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]",
};
const STATUS_LABEL: Record<string, string> = { use: "사용", none: "미반영", excluded: "제외" };

export function SemoStatusBadge({ status, small }: { status: string | null | undefined; small?: boolean }) {
  const s = status ?? "none";
  return (
    <span className={`inline-flex items-center border rounded-md font-bold whitespace-nowrap ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} ${STATUS_STYLE[s] ?? STATUS_STYLE.none}`}>
      {STATUS_LABEL[s] ?? s}
    </span>
  );
}

export function SemoReportVerifyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-[#7C3AED] text-[#5B21B6] text-sm px-4 py-2 rounded-lg hover:bg-[#7C3AED] hover:text-white transition-colors flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        세모리포트 검증
      </button>
      {open && <SemoReportModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SemoReportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<GroupKey>("missing");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const analyze = useCallback(async (f: File) => {
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch("/api/clients/semo-report", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "분석 실패");
        setResult(null);
      } else {
        setResult(data);
        setChecked(new Set());
        // 처리할 게 있는 탭을 먼저 보여준다
        const s = data.summary;
        setTab(s.missing > 0 ? "missing" : s.terminated > 0 ? "terminated" : "matched");
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      setError("엑셀 파일(.xlsx)만 업로드할 수 있습니다");
      return;
    }
    setFile(f);
    analyze(f);
  }

  const currentItems: SemoItem[] = useMemo(() => {
    if (!result || tab === "semoOnly") return [];
    return result.groups[tab];
  }, [result, tab]);

  const allChecked = currentItems.length > 0 && currentItems.every(i => checked.has(i.id));
  function toggleAll() {
    setChecked(prev => {
      const next = new Set(prev);
      if (allChecked) currentItems.forEach(i => next.delete(i.id));
      else currentItems.forEach(i => next.add(i.id));
      return next;
    });
  }
  function toggleOne(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function apply(ids: number[], status: SemoStatus, label: string) {
    if (ids.length === 0) return;
    setApplying(label);
    try {
      const r = await setSemoReportStatus(ids, status);
      setToast(`${r.updated}건 → ${STATUS_LABEL[status]} 변경 완료`);
      setTimeout(() => setToast(null), 2500);
      router.refresh();
      if (file) await analyze(file);
    } catch {
      setError("상태 변경에 실패했습니다");
    } finally {
      setApplying(null);
    }
  }

  const selectedInTab = currentItems.filter(i => checked.has(i.id)).map(i => i.id);

  const tabs: { key: GroupKey; label: string; count: number; tone: string; desc: string }[] = result ? [
    { key: "missing", label: "미반영", count: result.summary.missing, tone: "text-[#DC2626]", desc: "계약중인데 세모리포트에 없는 거래처 → 세모리포트에 등록한 뒤 '사용'으로 변경" },
    { key: "terminated", label: "해지 정리", count: result.summary.terminated, tone: "text-[#B45309]", desc: "해지된 거래처가 세모리포트에 남아있음 → 세모리포트에서 해지한 뒤 '미반영'으로 변경" },
    { key: "matched", label: "정상", count: result.summary.matched, tone: "text-[#15803D]", desc: "계약중 + 세모리포트 등록 완료. 상태가 '사용'이 아닌 거래처는 일괄 변경하세요" },
    { key: "semoOnly", label: "세모에만 있음", count: result.summary.semoOnly, tone: "text-[#6B7684]", desc: "세모리포트에는 있지만 우리 기장대리 목록에서 못 찾은 거래처 (신고대리·타 담당·사업자번호 불일치 등)" },
    { key: "excluded", label: "제외", count: result.summary.excluded, tone: "text-[#92400E]", desc: "세모리포트를 쓰지 않기로 한 거래처 (검증에서 제외됨)" },
  ] : [];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#F2F4F6]">
          <div>
            <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">SEMO REPORT</div>
            <h2 className="text-lg font-bold text-[#191F28] mt-0.5">세모리포트 명단 검증</h2>
          </div>
          <div className="flex items-center gap-3">
            {result && (
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#D1D6DB] text-[#4E5968] hover:bg-[#F9FAFB]"
              >
                다른 파일
              </button>
            )}
            <button onClick={onClose} className="text-[#8B95A1] hover:text-[#333D4B] text-xl leading-none">✕</button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
        />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* 업로드 영역 */}
          {!result && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
              onClick={() => fileRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
                dragging ? "border-[#7C3AED] bg-[#F8F5FF]" : "border-[#D1D6DB] bg-[#F9FAFB] hover:bg-[#F5F9FF] hover:border-[#A3CAFD]"
              }`}
            >
              <div className="text-4xl mb-3">{loading ? "⏳" : "📊"}</div>
              <div className="text-[15px] font-bold text-[#191F28]">
                {loading ? "분석 중..." : "세모리포트 고객관리목록 엑셀을 끌어다 놓거나 클릭해서 선택"}
              </div>
              <div className="text-xs text-[#8B95A1] mt-2">
                세모리포트 &gt; 고객관리 &gt; 엑셀 다운로드 파일 (예: 20261019_고객관리목록.xlsx)<br />
                사업자번호 기준으로 기장대리 거래처와 대조합니다. 업로드만으로는 아무것도 바뀌지 않습니다.
              </div>
              {file && !loading && <div className="text-xs text-[#4E5968] mt-3">{file.name}</div>}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-[#FEF2F2] text-[#991B1B] text-sm px-4 py-3">{error}</div>
          )}

          {result && (
            <>
              {/* 요약 */}
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div className="text-xs text-[#6B7684]">
                  <span className="font-bold text-[#191F28]">{result.fileName}</span>
                  <span className="mx-1.5">·</span>세모리포트 {result.semoCount}곳
                  <span className="mx-1.5">·</span>기장대리 {result.clientCount}곳
                  {loading && <span className="ml-2 text-[#7C3AED]">재분석 중...</span>}
                </div>
                {toast && (
                  <div className="text-xs font-bold text-[#166534] bg-[#F1FBF4] px-3 py-1.5 rounded-lg">✓ {toast}</div>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2 mb-5">
                {tabs.map(t => {
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`rounded-xl px-3 py-3 text-left border transition-all ${
                        active ? "border-[#191F28] bg-[#191F28] shadow-lg" : "border-[#F2F4F6] bg-[#F9FAFB] hover:bg-white hover:border-[#D1D6DB]"
                      }`}
                    >
                      <div className={`text-[11px] font-bold ${active ? "text-white/70" : "text-[#8B95A1]"}`}>{t.label}</div>
                      <div className={`text-[22px] font-extrabold leading-tight mt-0.5 tabular-nums ${active ? "text-white" : t.tone}`}>
                        {t.count}
                        {t.key === "matched" && result.summary.matchedNeedUse > 0 && (
                          <span className={`text-[11px] font-bold ml-1.5 ${active ? "text-white/70" : "text-[#DC2626]"}`}>
                            상태 미설정 {result.summary.matchedNeedUse}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 탭 설명 + 액션 */}
              {(() => {
                const t = tabs.find(x => x.key === tab)!;
                const needUseIds = result.groups.matched.filter(m => m.suggested === "use").map(m => m.id);
                return (
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <div className="text-xs text-[#6B7684]">{t.desc}</div>
                    <div className="flex items-center gap-2">
                      {tab === "missing" && (
                        <>
                          <ActionBtn
                            label={`선택 ${selectedInTab.length}건 → 사용`}
                            hint="세모리포트에 등록을 마친 거래처"
                            tone="blue"
                            disabled={selectedInTab.length === 0 || !!applying}
                            busy={applying === "use"}
                            onClick={() => apply(selectedInTab, "use", "use")}
                          />
                          <ActionBtn
                            label={`선택 → 제외`}
                            hint="세모리포트를 쓰지 않을 거래처"
                            tone="amber"
                            disabled={selectedInTab.length === 0 || !!applying}
                            busy={applying === "excluded"}
                            onClick={() => apply(selectedInTab, "excluded", "excluded")}
                          />
                        </>
                      )}
                      {tab === "terminated" && (
                        <ActionBtn
                          label={`선택 ${selectedInTab.length}건 → 미반영`}
                          hint="세모리포트에서 해지를 마친 거래처"
                          tone="amber"
                          disabled={selectedInTab.length === 0 || !!applying}
                          busy={applying === "none"}
                          onClick={() => apply(selectedInTab, "none", "none")}
                        />
                      )}
                      {tab === "matched" && (
                        <>
                          {needUseIds.length > 0 && (
                            <ActionBtn
                              label={`상태 미설정 ${needUseIds.length}건 → 사용`}
                              hint="세모리포트에 이미 있으니 한 번에 '사용'으로"
                              tone="green"
                              disabled={!!applying}
                              busy={applying === "use-all"}
                              onClick={() => apply(needUseIds, "use", "use-all")}
                            />
                          )}
                          <ActionBtn
                            label={`선택 → 사용`}
                            tone="blue"
                            disabled={selectedInTab.length === 0 || !!applying}
                            busy={applying === "use"}
                            onClick={() => apply(selectedInTab, "use", "use")}
                          />
                        </>
                      )}
                      {tab === "excluded" && (
                        <ActionBtn
                          label={`선택 → 미반영 (다시 검증 대상으로)`}
                          tone="blue"
                          disabled={selectedInTab.length === 0 || !!applying}
                          busy={applying === "none"}
                          onClick={() => apply(selectedInTab, "none", "none")}
                        />
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 목록 */}
              {tab === "semoOnly" ? (
                <SemoOnlyTable rows={result.groups.semoOnly} />
              ) : currentItems.length === 0 ? (
                <div className="rounded-xl border border-[#F2F4F6] bg-[#F9FAFB] py-14 text-center text-sm text-[#8B95A1]">
                  해당 거래처가 없습니다 🎉
                </div>
              ) : (
                <div className="rounded-xl border border-[#F2F4F6] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F9FAFB] text-[#4E5968]">
                      <tr>
                        <th className="px-3 py-2.5 w-9">
                          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[#3182F6] w-3.5 h-3.5 cursor-pointer" />
                        </th>
                        <th className="px-3 py-2.5 text-left font-medium">거래처</th>
                        <th className="px-3 py-2.5 text-left font-medium">사업자번호</th>
                        <th className="px-3 py-2.5 text-left font-medium">대표자</th>
                        <th className="px-3 py-2.5 text-left font-medium">담당</th>
                        <th className="px-3 py-2.5 text-center font-medium">계약</th>
                        <th className="px-3 py-2.5 text-center font-medium">세모 상태</th>
                        <th className="px-3 py-2.5 text-left font-medium">세모리포트 엑셀</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2F4F6]">
                      {currentItems.map(it => (
                        <tr
                          key={it.id}
                          onClick={() => toggleOne(it.id)}
                          className={`cursor-pointer hover:bg-[#F5F9FF]/60 ${checked.has(it.id) ? "bg-[#E8F3FF]/50" : ""}`}
                        >
                          <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={checked.has(it.id)} onChange={() => toggleOne(it.id)} className="accent-[#3182F6] w-3.5 h-3.5 cursor-pointer" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-[#191F28]">{it.name}</div>
                            <div className="text-[10px] text-[#8B95A1]">
                              {it.clientType === "corporate" ? "법인" : "개인"}
                              {it.note && <span className="ml-1.5 text-[#B45309]">· {it.note}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[#6B7684] tabular-nums">{it.bizNumber || "-"}</td>
                          <td className="px-3 py-2 text-[#333D4B]">{it.ceoName || "-"}</td>
                          <td className="px-3 py-2 text-[#6B7684]">{it.assignedUser || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            {it.contractStatus === "active"
                              ? <span className="text-[#15803D] font-medium">계약중</span>
                              : <span className="text-[#DC2626] font-medium">해지</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <SemoStatusBadge status={it.semoStatus} small />
                            {it.suggested && it.suggested !== it.semoStatus && (
                              <span className="ml-1 text-[10px] text-[#8B95A1]">→ {STATUS_LABEL[it.suggested]}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[#6B7684]">
                            {it.semo ? (
                              <span>
                                <span className="text-[#191F28]">{it.semo.name}</span>
                                <span className="text-[#B0B8C1] mx-1">·</span>{it.semo.contract || "계약 -"}
                                {it.semo.manager && <><span className="text-[#B0B8C1] mx-1">·</span>{it.semo.manager}</>}
                              </span>
                            ) : (
                              <span className="text-[#DC2626] font-medium">없음</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, hint, tone, disabled, busy, onClick }: {
  label: string; hint?: string; tone: "blue" | "amber" | "green"; disabled?: boolean; busy?: boolean; onClick: () => void;
}) {
  const cls = {
    blue: "bg-[#3182F6] hover:bg-[#1B64DA]",
    amber: "bg-[#F59E0B] hover:bg-[#B45309]",
    green: "bg-[#16A865] hover:bg-[#15803D]",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`px-3.5 py-2 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {busy ? "변경 중..." : label}
    </button>
  );
}

function SemoOnlyTable({ rows }: { rows: SemoRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-[#F2F4F6] bg-[#F9FAFB] py-14 text-center text-sm text-[#8B95A1]">세모리포트의 모든 거래처가 기장대리 목록과 일치합니다 🎉</div>;
  }
  return (
    <div className="rounded-xl border border-[#F2F4F6] overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-[#F9FAFB] text-[#4E5968]">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">세모리포트 거래처명</th>
            <th className="px-3 py-2.5 text-left font-medium">사업자번호</th>
            <th className="px-3 py-2.5 text-left font-medium">대표자</th>
            <th className="px-3 py-2.5 text-left font-medium">휴대폰</th>
            <th className="px-3 py-2.5 text-left font-medium">계약상태</th>
            <th className="px-3 py-2.5 text-left font-medium">담당자</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F2F4F6]">
          {rows.map((r, i) => (
            <tr key={`${r.bizNumber}-${i}`} className="hover:bg-[#F5F9FF]/60">
              <td className="px-3 py-2 font-medium text-[#191F28]">{r.name || "-"}</td>
              <td className="px-3 py-2 text-[#6B7684] tabular-nums">{r.bizFormatted || "-"}</td>
              <td className="px-3 py-2 text-[#333D4B]">{r.ceoName || "-"}</td>
              <td className="px-3 py-2 text-[#6B7684]">{r.phone || "-"}</td>
              <td className="px-3 py-2 text-[#6B7684]">{r.contract || "-"}</td>
              <td className="px-3 py-2 text-[#6B7684]">{r.manager || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
