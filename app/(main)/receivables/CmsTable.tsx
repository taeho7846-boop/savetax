"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toggleCmsRegistered, bulkCmsRegister } from "@/app/actions/clients";

type CmsClient = {
  id: number;
  name: string;
  ceoName: string | null;
  monthlyFee: number | null;
  firstWithdrawalMonth: string | null;
  cmsRegistered: boolean;
};

type SortCol = "name" | "ceoName" | "monthlyFee" | "cmsRegistered";

export function CmsTable({ clients }: { clients: CmsClient[] }) {
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const filterRef = useRef<HTMLDivElement>(null);

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

  // 최초출금월 옵션 추출
  const allMonths = [...new Set(clients.map((c) => c.firstWithdrawalMonth).filter(Boolean) as string[])].sort();

  // 필터 적용
  let rows = [...clients];
  if (monthFilter.length > 0) {
    rows = rows.filter((c) => c.firstWithdrawalMonth && monthFilter.includes(c.firstWithdrawalMonth));
  }

  // 정렬 적용
  if (sortCol) {
    const col = sortCol;
    rows.sort((a, b) => {
      let av: string | number | boolean = a[col] ?? "";
      let bv: string | number | boolean = b[col] ?? "";
      if (typeof av === "boolean") { av = av ? 1 : 0; bv = bv ? 1 : 0; }
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-[#1a2e4a] ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function handleToggle(clientId: number) {
    startTransition(async () => {
      await toggleCmsRegistered(clientId);
      router.refresh();
    });
  }

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

  function toggleMonth(m: string) {
    setMonthFilter((prev) =>
      prev.includes(m) ? prev.filter((v) => v !== m) : [...prev, m]
    );
  }

  async function handleBulkRegister() {
    if (checkedIds.size === 0) return;
    startTransition(async () => {
      await bulkCmsRegister([...checkedIds]);
      setCheckedIds(new Set());
      router.refresh();
    });
  }

  return (
    <>
    <div className="flex items-center gap-3 mb-3">
      <button
        onClick={handleBulkRegister}
        disabled={isPending || checkedIds.size === 0}
        className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
          checkedIds.size > 0
            ? "bg-[#1a2e4a] text-white hover:bg-[#243d61]"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"
        } disabled:opacity-50`}
      >
        {isPending ? "처리 중..." : `일괄등록${checkedIds.size > 0 ? ` (${checkedIds.size})` : ""}`}
      </button>
    </div>
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-3 py-3 w-10">
              <input
                type="checkbox"
                checked={rows.length > 0 && checkedIds.size === rows.length}
                onChange={toggleAll}
                className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
              />
            </th>
            {([
              { key: "name" as SortCol, label: "고객사명" },
              { key: "ceoName" as SortCol, label: "대표자명" },
              { key: "monthlyFee" as SortCol, label: "월 기장료" },
            ]).map(({ key, label }) => (
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

            {/* 최초출금월 필터 */}
            <th className="text-center px-4 py-3 text-gray-700 font-medium">
              <div className="relative inline-block" ref={filterRef}>
                <button
                  onClick={() => setFilterOpen((o) => !o)}
                  className={`flex items-center gap-1 mx-auto hover:text-[#1a2e4a] ${monthFilter.length > 0 ? "text-[#1a2e4a] font-semibold" : ""}`}
                >
                  최초 출금월
                  {monthFilter.length > 0 && (
                    <span className="bg-[#1a2e4a] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                      {monthFilter.length}
                    </span>
                  )}
                  <span className="text-gray-400 text-[10px]">▼</span>
                </button>
                {filterOpen && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 min-w-[140px] max-h-60 overflow-y-auto">
                    {allMonths.length === 0 ? (
                      <p className="text-xs text-gray-400 px-2 py-1">데이터 없음</p>
                    ) : (
                      allMonths.map((m) => (
                        <label
                          key={m}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-700 whitespace-nowrap"
                        >
                          <input
                            type="checkbox"
                            checked={monthFilter.includes(m)}
                            onChange={() => toggleMonth(m)}
                            className="accent-[#1a2e4a]"
                          />
                          {m}
                        </label>
                      ))
                    )}
                    {monthFilter.length > 0 && (
                      <button
                        onClick={() => setMonthFilter([])}
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
                onClick={() => handleSort("cmsRegistered")}
                className="flex items-center justify-center mx-auto hover:text-[#1a2e4a]"
              >
                CMS 등록여부
                <SortIcon col="cmsRegistered" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-12 text-gray-500">
                {monthFilter.length > 0 ? "필터 조건에 맞는 고객사가 없습니다" : "등록된 고객사가 없습니다"}
              </td>
            </tr>
          ) : (
            rows.map((client) => (
              <tr
                key={client.id}
                className={`hover:bg-blue-50/50 transition-colors ${checkedIds.has(client.id) ? "bg-blue-50/50" : ""}`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(client.id)}
                    onChange={() => toggleCheck(client.id)}
                    className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 text-center text-[#1a2e4a] font-medium">{client.name}</td>
                <td className="px-4 py-3 text-center text-gray-800">{client.ceoName || <span className="text-gray-400">-</span>}</td>
                <td className="px-4 py-3 text-center text-gray-800">
                  {client.monthlyFee != null ? `${client.monthlyFee.toLocaleString()}원` : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3 text-center text-gray-800">{client.firstWithdrawalMonth || <span className="text-gray-400">-</span>}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggle(client.id)}
                    disabled={isPending}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      client.cmsRegistered
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {client.cmsRegistered ? "등록" : "미등록"}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}
