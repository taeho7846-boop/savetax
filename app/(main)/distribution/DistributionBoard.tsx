"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDistribution, deleteDistribution, togglePass } from "@/app/actions/distribution";

interface Accountant {
  id: number;
  name: string;
}

interface Distribution {
  id: number;
  clientName: string;
  clientType: string;
  assignedUserId: number;
  assignedUser: { name: string };
  isSkipped: boolean;
  createdAt: Date;
}

export function DistributionBoard({
  tab,
  accountants,
  distributions,
  counts,
  passUserIds,
}: {
  tab: string;
  accountants: Accountant[];
  distributions: Distribution[];
  counts: Record<number, number>;
  passUserIds: number[];
}) {
  const isCorporate = tab === "corporate";
  const [corpInputs, setCorpInputs] = useState<string[]>(["", "", "", "", ""]);
  const [indInputs, setIndInputs] = useState<string[]>(["", "", "", "", ""]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const inputs = isCorporate ? corpInputs : indInputs;
  const setInputs = isCorporate ? setCorpInputs : setIndInputs;
  const passSet = new Set(passUserIds);

  function updateInput(idx: number, val: string) {
    setInputs((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }

  function handleAdd() {
    const names = inputs.filter((n) => n.trim());
    if (names.length === 0) return;

    startTransition(async () => {
      await addDistribution(names, tab);
      setInputs(["", "", "", "", ""]);
      router.refresh();
    });
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`'${name}'을(를) 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      await deleteDistribution(id);
      router.refresh();
    });
  }

  function handleTogglePass(userId: number) {
    startTransition(async () => {
      await togglePass(userId, tab);
      router.refresh();
    });
  }

  // 세무사별 거래처 그룹핑
  const byAccountant: Record<number, Distribution[]> = {};
  for (const a of accountants) byAccountant[a.id] = [];
  for (const d of distributions) {
    if (byAccountant[d.assignedUserId]) byAccountant[d.assignedUserId].push(d);
  }

  const maxRows = Math.max(1, ...accountants.map((a) => byAccountant[a.id].length));

  return (
    <>
      {/* 탭 */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        <Link
          href="/distribution?tab=corporate"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isCorporate
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          법인
        </Link>
        <Link
          href="/distribution?tab=individual"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            !isCorporate
              ? "border-[#1a2e4a] text-[#1a2e4a]"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          개인
        </Link>
      </div>

      {/* 거래처 입력 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 mb-5">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-medium text-gray-700">
            거래처 추가 ({isCorporate ? "법인" : "개인"})
          </h3>
          <button
            onClick={handleAdd}
            disabled={isPending || inputs.every((n) => !n.trim())}
            className="bg-[#1a2e4a] text-white text-sm px-4 py-1.5 rounded-lg hover:bg-[#243d61] disabled:opacity-50 transition-colors"
          >
            {isPending ? "추가중..." : "추가"}
          </button>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {inputs.map((val, i) => (
            <input
              key={i}
              value={val}
              onChange={(e) => updateInput(i, e.target.value)}
              placeholder={`거래처 ${i + 1}`}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* 배분 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex-1">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
            <tr>
              {accountants.map((a) => {
                const isPass = passSet.has(a.id);
                return (
                  <th key={a.id} className="text-center px-4 py-3">
                    <div className="font-medium text-gray-700">{a.name}</div>
                    <div className="text-xs text-gray-400 font-normal mt-0.5">
                      {counts[a.id] || 0}건
                    </div>
                    <button
                      onClick={() => handleTogglePass(a.id)}
                      disabled={isPending}
                      className={`mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                        isPass
                          ? "bg-red-100 text-red-600 hover:bg-red-200"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                      }`}
                    >
                      PASS {isPass ? "ON" : "OFF"}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-50">
                {accountants.map((a) => {
                  const d = byAccountant[a.id][rowIdx];
                  return (
                    <td key={a.id} className="px-4 py-2 text-center">
                      {d ? (
                        d.isSkipped ? (
                          <span className="text-gray-300">-</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 group">
                            <span className="text-gray-800">{d.clientName}</span>
                            <button
                              onClick={() => handleDelete(d.id, d.clientName)}
                              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-gray-200">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {maxRows === 0 && (
              <tr>
                <td colSpan={accountants.length} className="text-center py-12 text-gray-400">
                  배분된 거래처가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
