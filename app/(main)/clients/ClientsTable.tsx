"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClientEditModal } from "./ClientEditModal";
import { bulkDeleteClients, bulkChangeAssignedUser, getAssignableUsers } from "@/app/actions/clients";

type LoginStatus = "idle" | "loading" | "success" | "error";

const LABOR_TYPE_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "1인사업자": { border: "border-purple-400", text: "text-purple-600", bg: "bg-purple-50" },
  "근로소득": { border: "border-red-400",   text: "text-red-600",   bg: "bg-red-50"   },
  "사업소득": { border: "border-blue-400",  text: "text-blue-600",  bg: "bg-blue-50"  },
  "일용직":   { border: "border-green-500", text: "text-green-700", bg: "bg-green-50" },
};

function LaborBadge({ type }: { type: string }) {
  const s = LABOR_TYPE_STYLES[type.trim()] ?? {
    border: "border-gray-300",
    text: "text-gray-500",
    bg: "bg-gray-50",
  };
  return (
    <span className={`inline-flex items-center justify-center border ${s.border} ${s.text} ${s.bg} rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap`}>
      {type.trim()}
    </span>
  );
}

type Client = {
  id: number;
  name: string;
  laborTypes: string | null;
  bizNumber: string | null;
  phone: string | null;
  ceoName: string | null;
  residentNumber: string | null;
  hometaxId: string | null;
  hometaxPw: string | null;
  clientType: string;
  taxTypes: string | null;
  accountingProgram: string;
  contactMethod: string;
  affiliation: string | null;
  myboxLink: string | null;
  monthlyFee: number | null;
  assignedUser?: { name: string } | null;
};

type SortCol = "bizNumber" | "phone" | "ceoName" | "residentNumber" | "monthlyFee" | "affiliation" | "myboxLink";

const LABOR_OPTIONS = ["1인사업자", "근로소득", "사업소득", "일용직"];
const SORT_COLS: { key: SortCol; label: string }[] = [
  { key: "bizNumber",       label: "사업자번호"   },
  { key: "phone",           label: "연락처"       },
  { key: "ceoName",         label: "대표자"       },
  { key: "residentNumber",  label: "주민등록번호" },
  { key: "monthlyFee",      label: "월 기장료"    },
];

export function ClientsTable({ clients, readonly = false, showAssignedUser = false }: { clients: Client[]; readonly?: boolean; showAssignedUser?: boolean }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [laborFilter, setLaborFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [affiliationFilter, setAffiliationFilter] = useState<string[]>([]);
  const [affFilterOpen, setAffFilterOpen] = useState(false);
  const [programFilter, setProgramFilter] = useState<string | null>(null);
  const [programFilterOpen, setProgramFilterOpen] = useState(false);
  const [loginStatuses, setLoginStatuses] = useState<Record<number, LoginStatus>>({});
  const [loginErrors, setLoginErrors] = useState<Record<number, string>>({});
  const [vncOpen, setVncOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignUsers, setAssignUsers] = useState<{ id: number; name: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const router = useRouter();
  const filterRef = useRef<HTMLDivElement>(null);
  const affFilterRef = useRef<HTMLDivElement>(null);
  const programFilterRef = useRef<HTMLDivElement>(null);

  function toggleCheck(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === rows.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(rows.map((c) => c.id)));
    }
  }

  async function openAssignModal() {
    const users = await getAssignableUsers();
    setAssignUsers(users);
    setSelectedUserId(null);
    setShowAssignModal(true);
  }

  async function handleBulkAssign() {
    if (!selectedUserId || checkedIds.size === 0) return;
    const userName = assignUsers.find(u => u.id === selectedUserId)?.name;
    if (!confirm(`선택한 ${checkedIds.size}개 거래처의 담당자를 '${userName}'(으)로 변경하시겠습니까?`)) return;
    startTransition(async () => {
      await bulkChangeAssignedUser([...checkedIds], selectedUserId);
      setCheckedIds(new Set());
      setShowAssignModal(false);
      router.refresh();
    });
  }

  async function handleExcelDownload() {
    if (checkedIds.size === 0) return;
    try {
      const res = await fetch("/api/clients/bulk-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: [...checkedIds] }),
      });
      if (!res.ok) { alert("다운로드 실패"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `고객사정보_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("다운로드 실패"); }
  }

  async function handleBulkDelete() {
    if (checkedIds.size === 0) return;
    if (!confirm(`선택한 ${checkedIds.size}개 거래처를 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      await bulkDeleteClients([...checkedIds]);
      setCheckedIds(new Set());
      router.refresh();
    });
  }

  async function handleHometaxLogin(e: React.MouseEvent, clientId: number) {
    e.stopPropagation();
    setLoginStatuses((prev) => ({ ...prev, [clientId]: "loading" }));
    setLoginErrors((prev) => { const n = { ...prev }; delete n[clientId]; return n; });

    try {
      // 1. 서버에서 자격증명 가져오기
      const res = await fetch("/api/automation/hometax-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginStatuses((prev) => ({ ...prev, [clientId]: "error" }));
        setLoginErrors((prev) => ({ ...prev, [clientId]: data.error ?? "오류 발생" }));
        return;
      }

      // 2. 홈택스를 새 탭으로 열기 (자격증명을 URL hash에 포함)
      const creds = btoa(JSON.stringify({
        id: data.hometaxId,
        pw: data.hometaxPw,
        rn: data.residentNumber,
      }));
      window.open(
        `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
        "_blank"
      );
      setLoginStatuses((prev) => ({ ...prev, [clientId]: "success" }));
      setTimeout(() => {
        setLoginStatuses((prev) => ({ ...prev, [clientId]: "idle" }));
      }, 3000);
    } catch {
      setLoginStatuses((prev) => ({ ...prev, [clientId]: "error" }));
      setLoginErrors((prev) => ({ ...prev, [clientId]: "네트워크 오류" }));
    }
  }

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
      if (affFilterRef.current && !affFilterRef.current.contains(e.target as Node)) {
        setAffFilterOpen(false);
      }
      if (programFilterRef.current && !programFilterRef.current.contains(e.target as Node)) {
        setProgramFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function toggleLabor(type: string) {
    setLaborFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  // 필터 적용
  // 소속 옵션 목록 추출
  const affiliationOptions = [...new Set(clients.map(c => c.affiliation).filter(Boolean))] as string[];

  let rows = clients;
  if (laborFilter.length > 0) {
    rows = rows.filter((c) =>
      laborFilter.some((f) => c.laborTypes?.includes(f))
    );
  }
  if (affiliationFilter.length > 0) {
    rows = rows.filter((c) =>
      affiliationFilter.includes(c.affiliation || "")
    );
  }
  if (programFilter) {
    rows = rows.filter((c) => c.accountingProgram?.includes(programFilter));
  }

  // 정렬 적용
  if (sortCol) {
    const col = sortCol;
    rows = [...rows].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      if (av == null && bv != null) return 1;
      if (av != null && bv == null) return -1;
      if (av == null && bv == null) return 0;
      if (col === "monthlyFee") {
        const cmp = (av as number) - (bv as number);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = String(av).localeCompare(String(bv), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-[#1a2e4a] ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <>
      {selectedId !== null && (
        <ClientEditModal clientId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-700 font-medium">{checkedIds.size}개 선택</span>
          <span className="text-sm text-blue-600">
            월 기장료 합계: <strong>{rows.filter(c => checkedIds.has(c.id)).reduce((sum, c) => sum + (c.monthlyFee || 0), 0).toLocaleString()}원</strong>
          </span>
          <button
            onClick={handleExcelDownload}
            disabled={isPending}
            className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            엑셀 다운로드
          </button>
          {!readonly && (
            <>
              <button
                onClick={openAssignModal}
                disabled={isPending}
                className="text-sm bg-[#1a2e4a] text-white px-3 py-1 rounded hover:bg-[#243d61] disabled:opacity-50 transition-colors"
              >
                담당자 변경
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isPending}
                className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "삭제 중..." : "일괄 삭제"}
              </button>
            </>
          )}
          <button
            onClick={() => setCheckedIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 ml-auto"
          >
            선택 해제
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && checkedIds.size === rows.length}
                  onChange={toggleAll}
                  className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3 text-gray-700 font-medium w-40">
                <div className="relative inline-block" ref={programFilterRef}>
                  <button
                    onClick={() => setProgramFilterOpen((o) => !o)}
                    className={`flex items-center gap-1 hover:text-[#1a2e4a] ${programFilter ? "text-[#1a2e4a] font-semibold" : ""}`}
                  >
                    고객사명
                    {programFilter && (
                      <span className="bg-[#1a2e4a] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">!</span>
                    )}
                    <span className="text-gray-400 text-[10px]">▼</span>
                  </button>
                  {programFilterOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 min-w-[120px]">
                      {[
                        { value: null, label: "전체" },
                        { value: "위하고", label: "위하고" },
                        { value: "세무사랑", label: "세무사랑" },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => { setProgramFilter(opt.value); setProgramFilterOpen(false); }}
                          className={`block w-full text-left px-3 py-1.5 rounded text-sm hover:bg-gray-50 ${programFilter === opt.value ? "text-[#1a2e4a] font-medium" : "text-gray-700"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </th>
              {showAssignedUser && (
                <th className="text-center px-4 py-3 text-gray-700 font-medium">담당자</th>
              )}

              {/* 인건비 필터 */}
              <th className="text-center px-4 py-3 text-gray-700 font-medium">
                <div className="relative inline-block" ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen((o) => !o)}
                    className={`flex items-center gap-1 mx-auto hover:text-[#1a2e4a] ${laborFilter.length > 0 ? "text-[#1a2e4a] font-semibold" : ""}`}
                  >
                    인건비
                    {laborFilter.length > 0 && (
                      <span className="bg-[#1a2e4a] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                        {laborFilter.length}
                      </span>
                    )}
                    <span className="text-gray-400 text-[10px]">▼</span>
                  </button>
                  {filterOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 min-w-[120px]">
                      {LABOR_OPTIONS.map((opt) => (
                        <label
                          key={opt}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-700 whitespace-nowrap"
                        >
                          <input
                            type="checkbox"
                            checked={laborFilter.includes(opt)}
                            onChange={() => toggleLabor(opt)}
                            className="accent-[#1a2e4a]"
                          />
                          {opt}
                        </label>
                      ))}
                      {laborFilter.length > 0 && (
                        <button
                          onClick={() => setLaborFilter([])}
                          className="w-full text-center text-xs text-gray-400 hover:text-gray-600 mt-1 pt-1 border-t border-gray-100"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* 정렬 가능한 컬럼 */}
              {SORT_COLS.map(({ key, label }) => (
                <th key={key} className="text-center px-4 py-3 text-gray-700 font-medium">
                  <button
                    onClick={() => handleSort(key)}
                    className="flex items-center justify-center mx-auto hover:text-[#1a2e4a]"
                  >
                    {label}
                    <SortIcon col={key} />
                  </button>
                </th>
              ))}
              <th className="text-center px-4 py-3 text-gray-700 font-medium">
                <div className="relative inline-block" ref={affFilterRef}>
                  <button
                    onClick={() => setAffFilterOpen((o) => !o)}
                    className={`flex items-center gap-1 mx-auto hover:text-[#1a2e4a] ${affiliationFilter.length > 0 ? "text-[#1a2e4a] font-semibold" : ""}`}
                  >
                    소속
                    {affiliationFilter.length > 0 && (
                      <span className="bg-[#1a2e4a] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                        {affiliationFilter.length}
                      </span>
                    )}
                    <span className="text-gray-400 text-[10px]">▼</span>
                  </button>
                  {affFilterOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 min-w-[140px]">
                      {affiliationOptions.map((opt) => (
                        <label
                          key={opt}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-700 whitespace-nowrap"
                        >
                          <input
                            type="checkbox"
                            checked={affiliationFilter.includes(opt)}
                            onChange={() => setAffiliationFilter((prev) =>
                              prev.includes(opt) ? prev.filter((t) => t !== opt) : [...prev, opt]
                            )}
                            className="accent-[#1a2e4a]"
                          />
                          {opt}
                        </label>
                      ))}
                      {affiliationFilter.length > 0 && (
                        <button
                          onClick={() => setAffiliationFilter([])}
                          className="w-full text-center text-xs text-gray-400 hover:text-gray-600 mt-1 pt-1 border-t border-gray-100"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </th>
              <th className="text-center px-4 py-3 text-gray-700 font-medium">
                <button
                  onClick={() => handleSort("myboxLink")}
                  className="flex items-center justify-center mx-auto hover:text-[#1a2e4a]"
                >
                  MyBox
                  <SortIcon col="myboxLink" />
                </button>
              </th>
              {!readonly && (
                <th className="text-center px-4 py-3 text-gray-700 font-medium whitespace-nowrap">홈택스</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={readonly ? 10 : 11} className="text-center py-12 text-gray-500">
                  {laborFilter.length > 0 ? "필터 조건에 맞는 고객사가 없습니다" : "등록된 고객사가 없습니다"}
                </td>
              </tr>
            ) : (
              rows.map((client) => {
                const laborList = client.laborTypes
                  ? client.laborTypes.split(",").map((t) => t.trim()).filter(Boolean)
                  : [];

                return (
                  <tr
                    key={client.id}
                    className={`hover:bg-blue-50 transition-colors ${readonly ? "" : "cursor-pointer"} ${checkedIds.has(client.id) ? "bg-blue-50/50" : ""}`}
                    onClick={() => !readonly && setSelectedId(client.id)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(client.id)}
                        onChange={() => toggleCheck(client.id)}
                        className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-left">
                      <div className="text-[#1a2e4a] font-medium">{client.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                        <span>
                          {client.clientType === "corporate" ? "법인" : "개인"}
                          {client.taxTypes ? ` · ${client.taxTypes}` : ""}
                        </span>
                        {client.accountingProgram?.includes("위하고") && (
                          <img src="/wehago.svg" alt="위하고" title="위하고" className="w-4 h-4 rounded" />
                        )}
                        {client.accountingProgram?.includes("세무사랑") && (
                          <img src="/semusarang.svg" alt="세무사랑" title="세무사랑" className="w-4 h-4 rounded" />
                        )}
                      </div>
                    </td>
                    {showAssignedUser && (
                      <td className="px-4 py-3 text-center text-gray-700 text-xs">
                        {client.assignedUser?.name || <span className="text-gray-400">-</span>}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      {laborList.length === 0 ? (
                        <span className="text-gray-300">-</span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          {laborList.map((t) => <LaborBadge key={t} type={t} />)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-800">{client.bizNumber || <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-800">{client.phone || <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-800">
                      <div className="flex items-center justify-center gap-1">
                        {client.ceoName || <span className="text-gray-400">-</span>}
                        {client.contactMethod?.split(",").map(m => m.trim()).map((m) => (
                          <img
                            key={m}
                            src={m === "카톡" ? "/icon-kakaotalk.svg" : m === "문자" ? "/icon-message.svg" : m === "메일" ? "/icon-navermail.svg" : ""}
                            alt={m}
                            title={m}
                            className="w-4 h-4"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-800">{client.residentNumber || <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-800">
                      {client.monthlyFee != null ? client.monthlyFee.toLocaleString() + "원" : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {client.affiliation === "세이브택스" ? (
                        <span className="text-blue-600 font-medium">세이브택스</span>
                      ) : client.affiliation ? (
                        <span className="text-gray-800">{client.affiliation}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {client.myboxLink ? (
                        <a
                          href={client.myboxLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors group"
                          title="MyBox 열기"
                        >
                          <svg className="w-4.5 h-4.5 text-blue-500 group-hover:text-blue-700" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.18L18.39 7.5 12 10.82 5.61 7.5 12 4.18zM5 16.12V9.06l6 3.31v7.06l-6-3.31zm8 3.31V12.37l6-3.31v7.06l-6 3.31z"/>
                          </svg>
                        </a>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    {!readonly && (
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const status = loginStatuses[client.id] ?? "idle";
                        if (status === "loading") {
                          return (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-medium">
                              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              실행중
                            </span>
                          );
                        }
                        if (status === "success") {
                          return (
                            <span className="text-xs text-green-600 font-medium">✓ 완료</span>
                          );
                        }
                        if (status === "error") {
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs text-red-500 font-medium">✕ 실패</span>
                              {loginErrors[client.id] && (
                                <span className="text-[10px] text-red-400 max-w-[100px] leading-tight text-center">
                                  {loginErrors[client.id]}
                                </span>
                              )}
                              <button
                                onClick={(e) => handleHometaxLogin(e, client.id)}
                                className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                              >
                                재시도
                              </button>
                            </div>
                          );
                        }
                        if (!client.hometaxId || !client.hometaxPw) {
                          return <span className="text-gray-300">-</span>;
                        }
                        return (
                          <button
                            onClick={(e) => handleHometaxLogin(e, client.id)}
                            className="text-xs bg-[#1a2e4a] text-white px-2.5 py-1 rounded hover:bg-[#243d61] transition-colors whitespace-nowrap"
                          >
                            로그인
                          </button>
                        );
                      })()}
                    </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAssignModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAssignModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-80">
            <h3 className="text-sm font-bold text-gray-800 mb-1">담당자 일괄 변경</h3>
            <p className="text-xs text-gray-400 mb-4">{checkedIds.size}개 거래처 선택됨</p>
            <select
              value={selectedUserId ?? ""}
              onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            >
              <option value="">담당자 선택</option>
              {assignUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleBulkAssign}
                disabled={!selectedUserId || isPending}
                className="flex-1 bg-[#1a2e4a] text-white text-sm py-2 rounded-lg hover:bg-[#243d61] disabled:opacity-50 transition-colors"
              >
                {isPending ? "변경 중..." : "변경"}
              </button>
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
