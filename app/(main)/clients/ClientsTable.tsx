"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClientEditModal } from "./ClientEditModal";
import { bulkDeleteClients, bulkChangeAssignedUser, getAssignableUsers } from "@/app/actions/clients";

type LoginStatus = "idle" | "loading" | "success" | "error";

const LABOR_TYPE_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "1인사업자": { border: "border-purple-400", text: "text-[#3182F6]", bg: "bg-[#F5F9FF]" },
  "근로소득": { border: "border-red-400",   text: "text-[#DC2626]",   bg: "bg-[#FEF2F2]"   },
  "사업소득": { border: "border-blue-400",  text: "text-[#3182F6]",  bg: "bg-[#F5F9FF]"  },
  "일용직":   { border: "border-green-500", text: "text-[#15803D]", bg: "bg-[#F1FBF4]" },
};

function LaborBadge({ type }: { type: string }) {
  const s = LABOR_TYPE_STYLES[type.trim()] ?? {
    border: "border-[#D1D6DB]",
    text: "text-[#6B7684]",
    bg: "bg-[#F9FAFB]",
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
  cmsAffiliation?: string | null;
  contractDate: string | null;
  myboxLink: string | null;
  driveFolderId: string | null;
  withholdingType: string | null;
  monthlyFee: number | null;
  assignedUser?: { name: string } | null;
};

type SortCol = "bizNumber" | "phone" | "ceoName" | "residentNumber" | "monthlyFee" | "affiliation" | "contractDate" | "myboxLink" | "driveFolderId";

const LABOR_OPTIONS = ["1인사업자", "근로소득", "사업소득", "일용직"];
const SORT_COLS: { key: SortCol; label: string }[] = [
  { key: "bizNumber",       label: "사업자번호"   },
  { key: "phone",           label: "연락처"       },
  { key: "ceoName",         label: "대표자"       },
  { key: "residentNumber",  label: "주민등록번호" },
  { key: "monthlyFee",      label: "월 기장료"    },
];

type HideCol = "labor" | "monthlyFee" | "affiliation" | "contractDate";

export function ClientsTable({ clients, readonly = false, showAssignedUser = false, hideCols = [] }: { clients: Client[]; readonly?: boolean; showAssignedUser?: boolean; hideCols?: HideCol[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [laborFilter, setLaborFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [affiliationFilter, setAffiliationFilter] = useState<string[]>([]);
  const [affFilterOpen, setAffFilterOpen] = useState(false);
  const [programFilter, setProgramFilter] = useState<string | null>(null);
  const [programFilterOpen, setProgramFilterOpen] = useState(false);
  const [userFilter, setUserFilter] = useState<string[]>([]);
  const [userFilterOpen, setUserFilterOpen] = useState(false);
  const [loginStatuses, setLoginStatuses] = useState<Record<number, LoginStatus>>({});
  const [loginErrors, setLoginErrors] = useState<Record<number, string>>({});
  const [vncOpen, setVncOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [driveCreating, setDriveCreating] = useState(false);
  const [driveProgress, setDriveProgress] = useState("");
  const [driveMatchModal, setDriveMatchModal] = useState(false);
  const [driveParentId, setDriveParentId] = useState("");
  const [driveMatching, setDriveMatching] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignUsers, setAssignUsers] = useState<{ id: number; name: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const router = useRouter();
  const filterRef = useRef<HTMLDivElement>(null);
  const affFilterRef = useRef<HTMLDivElement>(null);
  const programFilterRef = useRef<HTMLDivElement>(null);
  const userFilterRef = useRef<HTMLDivElement>(null);

  const [lastCheckedIdx, setLastCheckedIdx] = useState<number | null>(null);

  function toggleCheck(id: number, e?: React.MouseEvent) {
    const currentIdx = rows.findIndex((c) => c.id === id);
    if (e?.shiftKey && lastCheckedIdx !== null && currentIdx !== -1) {
      const start = Math.min(lastCheckedIdx, currentIdx);
      const end = Math.max(lastCheckedIdx, currentIdx);
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(rows[i].id);
        return next;
      });
    } else {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
    setLastCheckedIdx(currentIdx);
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

  const hide = new Set(hideCols);
  const visibleSortCols = SORT_COLS.filter(c => !(c.key === "monthlyFee" && hide.has("monthlyFee")));
  const unlinkedCount = clients.filter(c => !c.driveFolderId).length;

  async function handleDriveCreateAll() {
    if (unlinkedCount === 0) { alert("미연결 거래처가 없습니다."); return; }
    if (!confirm(`Drive 폴더가 없는 ${unlinkedCount}개 거래처에 폴더를 생성하시겠습니까?`)) return;
    setDriveCreating(true);
    setDriveProgress("준비 중...");
    try {
      const res = await fetch("/api/drive-create-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const reader = res.body?.getReader();
      if (!reader) { alert("스트림 오류"); return; }
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const match = line.match(/^data: (.+)$/);
          if (!match) continue;
          try {
            const msg = JSON.parse(match[1]);
            if (msg.type === "progress") {
              setDriveProgress(`${msg.current}/${msg.total} - ${msg.name}`);
            } else if (msg.type === "done") {
              alert(`완료! ${msg.created}/${msg.total}개 폴더 생성${msg.errors?.length ? `\n실패: ${msg.errors.map((e: string) => e).join(", ")}` : ""}`);
            }
          } catch {}
        }
      }
      router.refresh();
    } catch { alert("네트워크 오류"); }
    finally { setDriveCreating(false); setDriveProgress(""); }
  }

  async function handleDriveMatch() {
    if (!driveParentId.trim()) { alert("Google Drive 상위 폴더 ID를 입력해주세요."); return; }
    setDriveMatching(true);
    try {
      const res = await fetch("/api/drive-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: driveParentId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`오류: ${data.error}`); return; }
      alert(`완료! ${data.updated}개 거래처 매칭 성공`);
      setDriveMatchModal(false);
      setDriveParentId("");
      router.refresh();
    } catch { alert("네트워크 오류"); }
    finally { setDriveMatching(false); }
  }

  async function handleDriveMatchPreview() {
    if (!driveParentId.trim()) { alert("Google Drive 상위 폴더 ID를 입력해주세요."); return; }
    setDriveMatching(true);
    try {
      const res = await fetch(`/api/drive-match?parentId=${encodeURIComponent(driveParentId.trim())}`);
      const data = await res.json();
      if (!res.ok) { alert(`오류: ${data.error}`); return; }
      const msg = [`매칭 가능: ${data.matched}개`, `미매칭: ${data.unmatched}개`];
      if (data.matchedList?.length) msg.push(`\n매칭 목록:\n${data.matchedList.map((m: any) => `  ${m.clientName} ↔ ${m.folderName}`).join("\n")}`);
      if (data.unmatchedList?.length) msg.push(`\n미매칭 폴더:\n${data.unmatchedList.join(", ")}`);
      alert(msg.join("\n"));
    } catch { alert("네트워크 오류"); }
    finally { setDriveMatching(false); }
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
      const isCorp = !!data.agentNumber;
      const credData: Record<string, string> = {
        mode: isCorp ? "corp_login" : "login",
        id: data.hometaxId,
        pw: data.hometaxPw,
        rn: data.residentNumber,
      };
      if (isCorp) {
        credData.certName = data.certName;
        credData.certPw = data.certPw;
        credData.agentNumber = data.agentNumber;
        credData.agentPw = data.hometaxPw;
      }
      const creds = btoa(unescape(encodeURIComponent(JSON.stringify(credData)))).replace(/=/g, "");
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
      if (userFilterRef.current && !userFilterRef.current.contains(e.target as Node)) {
        setUserFilterOpen(false);
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
  const userOptions = [...new Set(clients.map(c => c.assignedUser?.name).filter(Boolean))] as string[];

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
  if (userFilter.length > 0) {
    rows = rows.filter((c) => userFilter.includes(c.assignedUser?.name || ""));
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
    if (sortCol !== col) return <span className="text-[#B0B8C1] ml-0.5">↕</span>;
    return <span className="text-[#191F28] ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <>
      {selectedId !== null && (
        <ClientEditModal clientId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {/* Drive 관리 버튼 */}
      {!readonly && unlinkedCount > 0 && (
        <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg">
          <span className="text-sm text-[#B45309]">Drive 미연결 거래처 <strong>{unlinkedCount}개</strong></span>
          {driveProgress && <span className="text-xs text-[#D97706]">{driveProgress}</span>}
          <button
            onClick={handleDriveCreateAll}
            disabled={driveCreating}
            className="text-sm bg-[#3182F6] text-white px-3 py-1 rounded hover:bg-[#1B64DA] disabled:opacity-50 transition-colors"
          >
            {driveCreating ? "생성 중..." : "폴더 일괄 생성"}
          </button>
          <button
            onClick={() => setDriveMatchModal(true)}
            className="text-sm bg-[#4E5968] text-white px-3 py-1 rounded hover:bg-[#333D4B] transition-colors"
          >
            기존 폴더 매칭
          </button>
        </div>
      )}

      {/* Drive 매칭 모달 */}
      {driveMatchModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDriveMatchModal(false)}>
          <div className="bg-white rounded-xl p-6 w-[480px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#191F28] mb-1">기존 Drive 폴더 매칭</h3>
            <p className="text-xs text-[#8B95A1] mb-4">Google Drive 상위 폴더의 ID를 입력하면, 하위 폴더명과 거래처명이 일치하는 것을 자동 연결합니다.</p>
            <input
              type="text"
              value={driveParentId}
              onChange={e => setDriveParentId(e.target.value)}
              placeholder="Google Drive 폴더 ID (URL에서 복사)"
              className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <p className="text-xs text-[#8B95A1] mb-4">폴더 URL 예시: drive.google.com/drive/folders/<strong>여기가 ID</strong></p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleDriveMatchPreview}
                disabled={driveMatching}
                className="text-sm bg-[#F2F4F6] text-[#333D4B] px-4 py-2 rounded-lg hover:bg-[#E5E8EB] disabled:opacity-50"
              >
                {driveMatching ? "확인 중..." : "미리보기"}
              </button>
              <button
                onClick={handleDriveMatch}
                disabled={driveMatching}
                className="text-sm bg-[#3182F6] text-white px-4 py-2 rounded-lg hover:bg-[#1B64DA] disabled:opacity-50"
              >
                {driveMatching ? "매칭 중..." : "매칭 실행"}
              </button>
              <button
                onClick={() => { setDriveMatchModal(false); setDriveParentId(""); }}
                className="text-sm text-[#6B7684] px-4 py-2 rounded-lg hover:bg-[#F2F4F6]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-3 glass rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(232,243,255,.85), rgba(245,249,255,.7))" }}>
          <span className="text-[13px] text-[#1B64DA] font-extrabold">{checkedIds.size}개 선택</span>
          {!hide.has("monthlyFee") && (
          <span className="text-sm text-[#3182F6]">
            월 기장료 합계: <strong>{rows.filter(c => checkedIds.has(c.id)).reduce((sum, c) => sum + (c.monthlyFee || 0), 0).toLocaleString()}원</strong>
          </span>
          )}
          <button
            onClick={handleExcelDownload}
            disabled={isPending}
            className="text-sm bg-[#16A865] text-white px-3 py-1 rounded hover:bg-[#15803D] disabled:opacity-50 transition-colors"
          >
            엑셀 다운로드
          </button>
          {!readonly && (
            <>
              <button
                onClick={openAssignModal}
                disabled={isPending}
                className="text-sm bg-[#3182F6] text-white px-3 py-1 rounded hover:bg-[#1B64DA] disabled:opacity-50 transition-colors"
              >
                담당자 변경
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isPending}
                className="text-sm bg-[#DC2626] text-white px-3 py-1 rounded hover:bg-[#B91C1C] disabled:opacity-50 transition-colors"
              >
                {isPending ? "삭제 중..." : "일괄 삭제"}
              </button>
            </>
          )}
          <button
            onClick={() => setCheckedIds(new Set())}
            className="text-sm text-[#6B7684] hover:text-[#333D4B] ml-auto"
          >
            선택 해제
          </button>
        </div>
      )}

      <div className="glass rounded-3xl">
        <table className="w-full text-sm">
          <thead className="bg-white/80 backdrop-blur-md border-b border-white/60 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
            <tr>
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && checkedIds.size === rows.length}
                  onChange={toggleAll}
                  className="accent-[#3182F6] w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="text-left px-4 py-3 text-[#333D4B] font-medium w-40">
                <div className="relative inline-block" ref={programFilterRef}>
                  <button
                    onClick={() => setProgramFilterOpen((o) => !o)}
                    className={`flex items-center gap-1 hover:text-[#191F28] ${programFilter ? "text-[#191F28] font-bold" : ""}`}
                  >
                    고객사명
                    {programFilter && (
                      <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">!</span>
                    )}
                    <span className="text-[#8B95A1] text-[10px]">▼</span>
                  </button>
                  {programFilterOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] shadow-lg z-20 p-2 min-w-[120px]">
                      {[
                        { value: null, label: "전체" },
                        { value: "위하고", label: "위하고" },
                        { value: "세무사랑", label: "세무사랑" },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => { setProgramFilter(opt.value); setProgramFilterOpen(false); }}
                          className={`block w-full text-left px-3 py-1.5 rounded text-sm hover:bg-[#F9FAFB] ${programFilter === opt.value ? "text-[#191F28] font-medium" : "text-[#333D4B]"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </th>
              {showAssignedUser && (
                <th className="text-center px-4 py-3 text-[#333D4B] font-medium">
                  <div className="relative inline-block" ref={userFilterRef}>
                    <button
                      onClick={() => setUserFilterOpen((o) => !o)}
                      className={`flex items-center gap-1 mx-auto hover:text-[#191F28] ${userFilter.length > 0 ? "text-[#191F28] font-bold" : ""}`}
                    >
                      담당자
                      {userFilter.length > 0 && (
                        <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                          {userFilter.length}
                        </span>
                      )}
                      <span className="text-[#8B95A1] text-[10px]">▼</span>
                    </button>
                    {userFilterOpen && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] shadow-lg z-20 p-2 min-w-[120px] max-h-60 overflow-y-auto">
                        {userOptions.length === 0 ? (
                          <p className="text-xs text-[#8B95A1] px-2 py-1">데이터 없음</p>
                        ) : (
                          userOptions.map((name) => (
                            <label
                              key={name}
                              className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap"
                            >
                              <input
                                type="checkbox"
                                checked={userFilter.includes(name)}
                                onChange={() => setUserFilter((prev) => prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name])}
                                className="accent-[#3182F6]"
                              />
                              {name}
                            </label>
                          ))
                        )}
                        {userFilter.length > 0 && (
                          <button
                            onClick={() => setUserFilter([])}
                            className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]"
                          >
                            초기화
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </th>
              )}

              {/* 인건비 필터 */}
              {!hide.has("labor") && (
              <th className="text-center px-4 py-3 text-[#333D4B] font-medium">
                <div className="relative inline-block" ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen((o) => !o)}
                    className={`flex items-center gap-1 mx-auto hover:text-[#191F28] ${laborFilter.length > 0 ? "text-[#191F28] font-bold" : ""}`}
                  >
                    인건비
                    {laborFilter.length > 0 && (
                      <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                        {laborFilter.length}
                      </span>
                    )}
                    <span className="text-[#8B95A1] text-[10px]">▼</span>
                  </button>
                  {filterOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] shadow-lg z-20 p-2 min-w-[120px]">
                      {LABOR_OPTIONS.map((opt) => (
                        <label
                          key={opt}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap"
                        >
                          <input
                            type="checkbox"
                            checked={laborFilter.includes(opt)}
                            onChange={() => toggleLabor(opt)}
                            className="accent-[#3182F6]"
                          />
                          {opt}
                        </label>
                      ))}
                      {laborFilter.length > 0 && (
                        <button
                          onClick={() => setLaborFilter([])}
                          className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </th>
              )}

              {/* 정렬 가능한 컬럼 */}
              {visibleSortCols.map(({ key, label }) => (
                <th key={key} className="text-center px-4 py-3 text-[#333D4B] font-medium">
                  <button
                    onClick={() => handleSort(key)}
                    className="flex items-center justify-center mx-auto hover:text-[#191F28]"
                  >
                    {label}
                    <SortIcon col={key} />
                  </button>
                </th>
              ))}
              {!hide.has("affiliation") && (
              <th className="text-center px-4 py-3 text-[#333D4B] font-medium">
                <div className="relative inline-block" ref={affFilterRef}>
                  <button
                    onClick={() => setAffFilterOpen((o) => !o)}
                    className={`flex items-center gap-1 mx-auto hover:text-[#191F28] ${affiliationFilter.length > 0 ? "text-[#191F28] font-bold" : ""}`}
                  >
                    소속
                    {affiliationFilter.length > 0 && (
                      <span className="bg-[#3182F6] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                        {affiliationFilter.length}
                      </span>
                    )}
                    <span className="text-[#8B95A1] text-[10px]">▼</span>
                  </button>
                  {affFilterOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] shadow-lg z-20 p-2 min-w-[140px]">
                      {affiliationOptions.map((opt) => (
                        <label
                          key={opt}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#F9FAFB] rounded cursor-pointer text-sm text-[#333D4B] whitespace-nowrap"
                        >
                          <input
                            type="checkbox"
                            checked={affiliationFilter.includes(opt)}
                            onChange={() => setAffiliationFilter((prev) =>
                              prev.includes(opt) ? prev.filter((t) => t !== opt) : [...prev, opt]
                            )}
                            className="accent-[#3182F6]"
                          />
                          {opt}
                        </label>
                      ))}
                      {affiliationFilter.length > 0 && (
                        <button
                          onClick={() => setAffiliationFilter([])}
                          className="w-full text-center text-xs text-[#8B95A1] hover:text-[#4E5968] mt-1 pt-1 border-t border-[#F2F4F6]"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </th>
              )}
              {!hide.has("affiliation") && (
              <th className="text-center px-4 py-3 text-[#333D4B] font-medium whitespace-nowrap">CMS</th>
              )}
              {!hide.has("contractDate") && (
              <th className="text-center px-4 py-3 text-[#333D4B] font-medium">
                <button
                  onClick={() => handleSort("contractDate")}
                  className="flex items-center justify-center mx-auto hover:text-[#191F28]"
                >
                  계약일자
                  <SortIcon col="contractDate" />
                </button>
              </th>
              )}
              <th className="text-center px-4 py-3 text-[#333D4B] font-medium">
                <button
                  onClick={() => handleSort("driveFolderId")}
                  className="flex items-center justify-center mx-auto hover:text-[#191F28]"
                >
                  Drive
                  <SortIcon col="driveFolderId" />
                </button>
              </th>
              {!readonly && (
                <th className="text-center px-4 py-3 text-[#333D4B] font-medium whitespace-nowrap">홈택스</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/40">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={readonly ? 11 : 12} className="text-center py-12 text-[#6B7684]">
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
                    className={`hover:bg-white/60 transition-colors ${readonly ? "" : "cursor-pointer"} ${checkedIds.has(client.id) ? "bg-[#E8F3FF]/40" : ""}`}
                    onClick={() => !readonly && setSelectedId(client.id)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(client.id)}
                        onClick={(e) => { e.stopPropagation(); toggleCheck(client.id, e as unknown as React.MouseEvent); }}
                        onChange={() => {}}
                        className="accent-[#3182F6] w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-left">
                      <div className="text-[#191F28] font-medium">{client.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-[#6B7684] mt-0.5">
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
                      <td className="px-4 py-3 text-center text-[#333D4B] text-xs">
                        {client.assignedUser?.name || <span className="text-[#8B95A1]">-</span>}
                      </td>
                    )}
                    {!hide.has("labor") && (
                    <td className="px-4 py-3 text-center">
                      {laborList.length === 0 && !client.withholdingType ? (
                        <span className="text-[#B0B8C1]">-</span>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          {laborList.length > 0 && (
                            <div className="flex flex-col items-center gap-1">
                              {laborList.map((t) => <LaborBadge key={t} type={t} />)}
                            </div>
                          )}
                          {client.withholdingType && (
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                              client.withholdingType === "A" ? "bg-[#E8F3FF] text-[#1B64DA]" :
                              client.withholdingType === "B" ? "bg-[#E7F7EE] text-[#15803D]" :
                              client.withholdingType === "C" ? "bg-[#FEF3C7] text-[#92400E]" :
                              "bg-[#F2F4F6] text-[#6B7684]"
                            }`} title={`원천세 ${client.withholdingType}유형`}>
                              {client.withholdingType}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    )}
                    <td className="px-4 py-3 text-center text-[#191F28]">{client.bizNumber || <span className="text-[#8B95A1]">-</span>}</td>
                    <td className="px-4 py-3 text-center text-[#191F28]">{client.phone || <span className="text-[#8B95A1]">-</span>}</td>
                    <td className="px-4 py-3 text-center text-[#191F28]">
                      <div className="flex items-center justify-center gap-1">
                        {client.ceoName || <span className="text-[#8B95A1]">-</span>}
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
                    <td className="px-4 py-3 text-center text-[#191F28]">{client.residentNumber || <span className="text-[#8B95A1]">-</span>}</td>
                    {!hide.has("monthlyFee") && (
                    <td className="px-4 py-3 text-center text-[#191F28]">
                      {client.monthlyFee != null ? client.monthlyFee.toLocaleString() + "원" : <span className="text-[#8B95A1]">-</span>}
                    </td>
                    )}
                    {!hide.has("affiliation") && (
                    <td className="px-4 py-3 text-center text-xs">
                      {client.affiliation === "세이브택스" ? (
                        <span className="text-[#3182F6] font-medium">세이브택스</span>
                      ) : client.affiliation ? (
                        <span className="text-[#191F28]">{client.affiliation}</span>
                      ) : (
                        <span className="text-[#8B95A1]">-</span>
                      )}
                    </td>
                    )}
                    {!hide.has("affiliation") && (
                    <td className="px-4 py-3 text-center text-xs">
                      {client.cmsAffiliation === "세이브택스" ? (
                        <span className="text-[#3182F6] font-medium">세이브택스</span>
                      ) : client.cmsAffiliation ? (
                        <span className="text-[#191F28]">{client.cmsAffiliation}</span>
                      ) : (
                        <span className="text-[#8B95A1]">-</span>
                      )}
                    </td>
                    )}
                    {!hide.has("contractDate") && (
                    <td className="px-4 py-3 text-center text-xs text-[#191F28]">
                      {client.contractDate || <span className="text-[#8B95A1]">-</span>}
                    </td>
                    )}
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {client.driveFolderId ? (
                        <a
                          href={`https://drive.google.com/drive/folders/${client.driveFolderId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#F1FBF4] hover:bg-[#E7F7EE] transition-colors group"
                          title="Google Drive 열기"
                        >
                          <svg className="w-4 h-4 text-[#16A865] group-hover:text-[#166534]" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.71 3.5L1.15 15l4.58 6.5h2.86L3.44 15l4.29-7.5H4.86L7.71 3.5zm4.58 0L5.15 15l4.58 6.5h2.86l-4.58-6.5L15.15 3.5h-2.86zm4.56 0l-7.14 11.5 4.58 6.5h2.86L12.57 15l7.14-11.5h-2.86z"/>
                          </svg>
                        </a>
                      ) : (
                        <span className="text-[#B0B8C1]">-</span>
                      )}
                    </td>
                    {!readonly && (
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const status = loginStatuses[client.id] ?? "idle";
                        if (status === "loading") {
                          return (
                            <span className="inline-flex items-center gap-1 text-xs text-[#3182F6] font-medium">
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
                            <span className="text-xs text-[#16A865] font-medium">✓ 완료</span>
                          );
                        }
                        if (status === "error") {
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs text-[#E02E2E] font-medium">✕ 실패</span>
                              {loginErrors[client.id] && (
                                <span className="text-[10px] text-[#F87171] max-w-[100px] leading-tight text-center">
                                  {loginErrors[client.id]}
                                </span>
                              )}
                              <button
                                onClick={(e) => handleHometaxLogin(e, client.id)}
                                className="text-[10px] text-[#8B95A1] hover:text-[#4E5968] underline"
                              >
                                재시도
                              </button>
                            </div>
                          );
                        }
                        if (!client.hometaxId || !client.hometaxPw) {
                          return <span className="text-[#B0B8C1]">-</span>;
                        }
                        return (
                          <button
                            onClick={(e) => handleHometaxLogin(e, client.id)}
                            className="text-xs bg-[#3182F6] text-white px-2.5 py-1 rounded hover:bg-[#1B64DA] transition-colors whitespace-nowrap"
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
            <h3 className="text-sm font-bold text-[#191F28] mb-1">담당자 일괄 변경</h3>
            <p className="text-xs text-[#8B95A1] mb-4">{checkedIds.size}개 거래처 선택됨</p>
            <select
              value={selectedUserId ?? ""}
              onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm mb-4 focus:outline-none focus:border-[#3182F6]"
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
                className="flex-1 bg-[#3182F6] text-white text-sm py-2 rounded-lg hover:bg-[#1B64DA] disabled:opacity-50 transition-colors"
              >
                {isPending ? "변경 중..." : "변경"}
              </button>
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 border border-[#D1D6DB] text-[#333D4B] text-sm py-2 rounded-lg hover:bg-[#F9FAFB] transition-colors"
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
