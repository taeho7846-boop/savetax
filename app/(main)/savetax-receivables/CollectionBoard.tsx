"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { addCollectionContact, deleteCollectionContact } from "@/app/actions/collection";

interface Contact {
  id: number;
  contactedAt: string;   // ISO
  result: string;        // promise | absent | bluff | other
  promiseDate: string | null; // "YYYY-MM-DD"
  memo: string | null;
}

interface CollectionClient {
  id: number;
  name: string;
  accountantName: string;
  cumulativeUnpaid: number;
  contractStatus: string;
  terminationMonth: string | null;
  contacts: Contact[];
}

function fmtWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "short", day: "numeric" });
}

function fmtPromise(s: string | null) {
  if (!s) return "";
  return new Date(s + "T00:00:00").toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

/** 로컬 기준 오늘 "YYYY-MM-DD" */
function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const RESULTS = [
  { v: "promise", label: "상환약속", chip: "bg-[#E7F7EE] text-[#15803D]" },
  { v: "absent", label: "부재중", chip: "bg-[#F2F4F6] text-[#6B7684]" },
  { v: "bluff", label: "공수표", chip: "bg-[#FEF3C7] text-[#B45309]" },
  { v: "other", label: "기타", chip: "bg-[#EAF1FE] text-[#3182F6]" },
] as const;
const RESULT_MAP: Record<string, { label: string; chip: string }> =
  Object.fromEntries(RESULTS.map((r) => [r.v, { label: r.label, chip: r.chip }]));

function groupOf(c: CollectionClient): string {
  const latest = c.contacts[0]; // contacts는 최신순 정렬됨
  if (!latest) return "none";
  if (latest.result === "promise") {
    if (latest.promiseDate && latest.promiseDate < todayStr()) return "overdue";
    return "promise";
  }
  if (latest.result === "absent") return "absent";
  if (latest.result === "bluff") return "bluff";
  return "other";
}

const SECTIONS = [
  { key: "overdue", label: "미상환 (약속 불이행)", desc: "상환약속일이 지났는데 아직 미입금", accent: "#DC2626", urgent: true },
  { key: "promise", label: "상환약속", desc: "상환 약속 받음 (예정)", accent: "#15803D" },
  { key: "bluff", label: "공수표", desc: "약속은 없지만 회수 자신 있는 곳", accent: "#B45309" },
  { key: "absent", label: "부재중", desc: "연락이 닿지 않음", accent: "#6B7684" },
  { key: "other", label: "기타", desc: "그 외 컨택 기록", accent: "#3182F6" },
  { key: "none", label: "미컨택", desc: "아직 컨택 기록이 없음", accent: "#8B95A1" },
];

export function CollectionBoard({ clients }: { clients: CollectionClient[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // 컨택 추가 모달
  const [modalClient, setModalClient] = useState<CollectionClient | null>(null);
  const [result, setResult] = useState<string>("promise");
  const [contactedAt, setContactedAt] = useState<string>(todayStr());
  const [promiseDate, setPromiseDate] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openModal(client: CollectionClient) {
    setModalClient(client);
    setResult("promise");
    setContactedAt(todayStr());
    setPromiseDate("");
    setMemo("");
  }

  async function handleSave() {
    if (!modalClient) return;
    setSaving(true);
    try {
      await addCollectionContact(modalClient.id, {
        result,
        promiseDate: result === "promise" ? (promiseDate || null) : null,
        memo,
        contactedAt,
      });
      setModalClient(null);
      setExpanded((prev) => new Set(prev).add(modalClient.id));
      router.refresh();
    } catch {
      alert("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 컨택 기록을 삭제할까요?")) return;
    setDeletingId(id);
    try {
      await deleteCollectionContact(id);
      router.refresh();
    } catch {
      alert("삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }

  // 그룹별 분류 + 그룹 내 미수금 큰 순
  const byGroup = new Map<string, CollectionClient[]>();
  for (const c of clients) {
    const g = groupOf(c);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(c);
  }
  for (const arr of byGroup.values()) arr.sort((a, b) => b.cumulativeUnpaid - a.cumulativeUnpaid);

  if (clients.length === 0) {
    return (
      <div className="glass rounded-3xl p-12 text-center">
        <div className="text-[40px] mb-2">🎉</div>
        <p className="text-[15px] font-bold text-[#191F28]">미수 거래처가 없습니다</p>
        <p className="text-[12px] text-[#8B95A1] mt-1">세이브택스 소속 거래처 모두 수납 완료</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {SECTIONS.map((sec) => {
        const list = byGroup.get(sec.key) ?? [];
        if (list.length === 0) return null;
        const sectionUnpaid = list.reduce((s, c) => s + c.cumulativeUnpaid, 0);
        return (
          <div key={sec.key} className={`glass rounded-3xl overflow-hidden ${sec.urgent ? "ring-2 ring-[#DC2626]/30" : ""}`}>
            {/* 섹션 헤더 */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/50" style={{ background: sec.urgent ? "rgba(220,38,38,0.05)" : undefined }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sec.accent }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold" style={{ color: sec.urgent ? "#DC2626" : "#191F28" }}>{sec.label}</span>
                  <span className="text-[12px] font-bold text-[#8B95A1]">{list.length}곳</span>
                </div>
                <div className="text-[11px] text-[#8B95A1]">{sec.desc}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-[#8B95A1]">미수 합계</div>
                <div className="text-[15px] font-extrabold" style={{ color: sec.urgent ? "#DC2626" : "#4E5968" }}>{fmtWon(sectionUnpaid)}</div>
              </div>
            </div>

            {/* 거래처 목록 */}
            <div className="divide-y divide-white/40">
              {list.map((c) => {
                const isOpen = expanded.has(c.id);
                const latest = c.contacts[0];
                const latestMeta = latest ? RESULT_MAP[latest.result] : null;
                return (
                  <div key={c.id}>
                    {/* 행 */}
                    <div className={`flex items-center gap-3 px-5 py-3 ${isOpen ? "bg-white/40" : "hover:bg-white/30"} transition-colors`}>
                      <button onClick={() => toggleExpand(c.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                        <span className={`text-[#B0B8C1] text-[11px] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                        <span className="text-[14px] font-bold text-[#191F28] truncate">{c.name}</span>
                        {c.contractStatus !== "active" && (
                          <span className="text-[10px] font-bold text-[#B45309] bg-[#FEF3C7] px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                            해지{c.terminationMonth ? ` ~${c.terminationMonth.slice(5)}월` : ""}
                          </span>
                        )}
                        <span className="text-[11px] text-[#8B95A1] shrink-0">{c.accountantName}</span>
                        {latest ? (
                          <span className="flex items-center gap-1.5 text-[11px] text-[#8B95A1] shrink-0 ml-1">
                            <span className={`px-1.5 py-0.5 rounded-full font-bold ${latestMeta?.chip}`}>{latestMeta?.label}</span>
                            {fmtDate(latest.contactedAt)}
                            {latest.result === "promise" && latest.promiseDate && (
                              <span className={sec.key === "overdue" ? "text-[#DC2626] font-bold" : "text-[#15803D] font-bold"}>
                                · 약속 {fmtPromise(latest.promiseDate)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#B0B8C1] shrink-0 ml-1">컨택 기록 없음</span>
                        )}
                      </button>
                      <span className="text-[14px] font-extrabold text-[#DC2626] shrink-0 tabular-nums">{fmtWon(c.cumulativeUnpaid)}</span>
                      <button
                        onClick={() => openModal(c)}
                        className="text-[12px] font-bold px-3 py-1.5 rounded-xl bg-[#3182F6] text-white hover:bg-[#1B64DA] shrink-0"
                      >
                        + 컨택
                      </button>
                    </div>

                    {/* 타임라인 (펼침) */}
                    {isOpen && (
                      <div className="px-5 pb-4 pt-1 bg-white/40">
                        {c.contacts.length === 0 ? (
                          <p className="text-[12px] text-[#8B95A1] py-3 pl-6">아직 컨택 기록이 없습니다. <b>+ 컨택</b>으로 첫 기록을 남겨보세요.</p>
                        ) : (
                          <ol className="relative ml-3 border-l-2 border-[#E5E8EB] pl-5 py-1 space-y-3">
                            {c.contacts.map((ct, idx) => {
                              const meta = RESULT_MAP[ct.result];
                              const seq = c.contacts.length - idx; // 최신이 가장 큰 회차
                              return (
                                <li key={ct.id} className="relative">
                                  <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-white border-2" style={{ borderColor: "#3182F6" }} />
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] font-bold text-[#8B95A1]">{seq}차</span>
                                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${meta?.chip}`}>{meta?.label ?? ct.result}</span>
                                    <span className="text-[12px] font-medium text-[#4E5968]">{fmtDate(ct.contactedAt)}</span>
                                    {ct.result === "promise" && ct.promiseDate && (
                                      <span className="text-[11px] font-bold text-[#15803D]">약속일 {fmtPromise(ct.promiseDate)}</span>
                                    )}
                                    <button
                                      onClick={() => handleDelete(ct.id)}
                                      disabled={deletingId === ct.id}
                                      className="text-[11px] text-[#B0B8C1] hover:text-[#DC2626] ml-auto"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                  {ct.memo && <p className="text-[12px] text-[#6B7684] mt-0.5 whitespace-pre-wrap">{ct.memo}</p>}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 컨택 추가 모달 */}
      {modalClient && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalClient(null)}>
          <div className="bg-white rounded-2xl p-6 w-[400px] max-w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-[16px] font-bold text-[#191F28]">컨택 기록 추가</h3>
              <p className="text-[12px] text-[#8B95A1] mt-0.5">{modalClient.name} · 미수 {fmtWon(modalClient.cumulativeUnpaid)}</p>
            </div>

            <div className="space-y-4">
              {/* 컨택 날짜 */}
              <div>
                <label className="text-[12px] font-bold text-[#6B7684] mb-1.5 block">컨택 날짜</label>
                <input
                  type="date"
                  value={contactedAt}
                  onChange={(e) => setContactedAt(e.target.value)}
                  className="w-full border border-[#E5E8EB] bg-[#F9FAFB] rounded-xl px-3 py-2 text-[13px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
                />
              </div>

              {/* 결과 */}
              <div>
                <label className="text-[12px] font-bold text-[#6B7684] mb-1.5 block">결과</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {RESULTS.map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setResult(o.v)}
                      className={`py-2 rounded-lg text-[12px] font-bold transition-colors ${
                        result === o.v ? "bg-[#3182F6] text-white" : "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 상환약속일 (상환약속일 때만) */}
              {result === "promise" && (
                <div>
                  <label className="text-[12px] font-bold text-[#6B7684] mb-1.5 block">상환 약속일</label>
                  <input
                    type="date"
                    value={promiseDate}
                    onChange={(e) => setPromiseDate(e.target.value)}
                    className="w-full border border-[#E5E8EB] bg-[#F9FAFB] rounded-xl px-3 py-2 text-[13px] text-[#191F28] focus:outline-none focus:border-[#3182F6]"
                  />
                </div>
              )}

              {/* 메모 */}
              <div>
                <label className="text-[12px] font-bold text-[#6B7684] mb-1.5 block">메모 (선택)</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={2}
                  placeholder="통화 내용, 특이사항 등..."
                  className="w-full border border-[#E5E8EB] bg-[#F9FAFB] rounded-xl px-3 py-2 text-[13px] text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setModalClient(null)} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB]">취소</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white bg-[#3182F6] hover:bg-[#1B64DA] disabled:opacity-50">
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
