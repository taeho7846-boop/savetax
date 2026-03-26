"use client";

import { useState, useRef, useEffect } from "react";
import { ClientEditModal } from "./ClientEditModal";

type LoginStatus = "idle" | "loading" | "success" | "error";

const LABOR_TYPE_STYLES: Record<string, { border: string; text: string; bg: string }> = {
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
};

type SortCol = "bizNumber" | "phone" | "ceoName" | "residentNumber" | "hometaxId" | "hometaxPw";

const LABOR_OPTIONS = ["근로소득", "사업소득", "일용직"];
const SORT_COLS: { key: SortCol; label: string }[] = [
  { key: "bizNumber",       label: "사업자번호"   },
  { key: "phone",           label: "연락처"       },
  { key: "ceoName",         label: "대표자"       },
  { key: "residentNumber",  label: "주민등록번호" },
  { key: "hometaxId",       label: "홈택스 ID"    },
  { key: "hometaxPw",       label: "홈택스 PW"    },
];

export function ClientsTable({ clients }: { clients: Client[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [laborFilter, setLaborFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loginStatuses, setLoginStatuses] = useState<Record<number, LoginStatus>>({});
  const [loginErrors, setLoginErrors] = useState<Record<number, string>>({});
  const [vncOpen, setVncOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

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
  let rows = clients;
  if (laborFilter.length > 0) {
    rows = rows.filter((c) =>
      laborFilter.some((f) => c.laborTypes?.includes(f))
    );
  }

  // 정렬 적용
  if (sortCol) {
    const col = sortCol;
    rows = [...rows].sort((a, b) => {
      const av = a[col] ?? "";
      const bv = b[col] ?? "";
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
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

      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-3 text-gray-700 font-medium w-40">고객사명</th>

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
              <th className="text-center px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                홈택스
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-500">
                  {laborFilter.length > 0 ? "필터 조건에 맞는 고객사가 없습니다" : "등록된 고객사가 없습니다"}
                </td>
              </tr>
            ) : (
              rows.map((client) => {
                const laborList = client.laborTypes
                  ? client.laborTypes.split(",").map((t) => t.trim()).filter((t) => t && t !== "1인사업자")
                  : [];

                return (
                  <tr
                    key={client.id}
                    className="hover:bg-blue-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(client.id)}
                  >
                    <td className="px-4 py-3 text-left">
                      <div className="text-[#1a2e4a] font-medium">{client.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {client.clientType === "corporate" ? "법인" : "개인"}
                        {client.taxTypes ? ` · ${client.taxTypes}` : ""}
                      </div>
                    </td>
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
                    <td className="px-4 py-3 text-center text-gray-800">{client.ceoName || <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-800">{client.residentNumber || <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-800">{client.hometaxId || <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-800">{client.hometaxPw || <span className="text-gray-400">-</span>}</td>
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </>
  );
}
