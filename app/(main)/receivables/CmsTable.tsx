"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleCmsRegistered } from "@/app/actions/clients";

type CmsClient = {
  id: number;
  name: string;
  ceoName: string | null;
  monthlyFee: number | null;
  firstWithdrawalMonth: string | null;
  cmsRegistered: boolean;
};

type SortCol = "name" | "ceoName" | "monthlyFee" | "firstWithdrawalMonth" | "cmsRegistered";

export function CmsTable({ clients }: { clients: CmsClient[] }) {
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  let rows = [...clients];
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

  const cols: { key: SortCol; label: string }[] = [
    { key: "name", label: "고객사명" },
    { key: "ceoName", label: "대표자명" },
    { key: "monthlyFee", label: "월 기장료" },
    { key: "firstWithdrawalMonth", label: "최초 출금월" },
    { key: "cmsRegistered", label: "CMS 등록여부" },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            {cols.map(({ key, label }) => (
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
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-12 text-gray-500">
                등록된 고객사가 없습니다
              </td>
            </tr>
          ) : (
            rows.map((client) => (
              <tr key={client.id} className="hover:bg-blue-50/50 transition-colors">
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
  );
}
