"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getTransferUsers, getAssignedClients, transferClients } from "@/app/actions/transfer";

type TransferUser = {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  clientCount: number;
};

type TransferClient = {
  id: number;
  name: string;
  ceoName: string | null;
  clientType: string;
  contractStatus: string;
  taxTypes: string | null;
};

export function TransferButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-[#3182F6] text-[#191F28] text-sm px-4 py-2 rounded-lg hover:bg-[#3182F6] hover:text-white transition-colors"
      >
        담당자 이관
      </button>
      {open && <TransferModal onClose={() => setOpen(false)} />}
    </>
  );
}

function TransferModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<TransferUser[]>([]);
  const [fromId, setFromId] = useState<number | "">("");
  const [toId, setToId] = useState<number | "">("");
  const [clients, setClients] = useState<TransferClient[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    getTransferUsers()
      .then(setUsers)
      .catch(() => setError("직원 목록을 불러오지 못했습니다."));
  }, []);

  // 보내는 담당자 변경 → 거래처 목록 로드 + 전체 선택
  useEffect(() => {
    if (fromId === "") {
      setClients([]);
      setChecked(new Set());
      return;
    }
    setLoading(true);
    setDone(null);
    getAssignedClients(fromId)
      .then(list => {
        setClients(list);
        setChecked(new Set(list.map(c => c.id)));
      })
      .catch(() => setError("거래처 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [fromId]);

  const filtered = useMemo(() => {
    const f = filter.trim();
    if (!f) return clients;
    return clients.filter(c => c.name.includes(f) || (c.ceoName ?? "").includes(f));
  }, [clients, filter]);

  const receivers = users.filter(u => u.isActive && u.id !== fromId);
  const fromUser = users.find(u => u.id === fromId);
  const toUser = users.find(u => u.id === toId);

  function toggle(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    const allChecked = filtered.every(c => checked.has(c.id));
    setChecked(prev => {
      const next = new Set(prev);
      filtered.forEach(c => (allChecked ? next.delete(c.id) : next.add(c.id)));
      return next;
    });
  }

  async function handleApply() {
    if (fromId === "" || toId === "") return alert("보내는 담당자와 받는 담당자를 모두 선택하세요.");
    if (checked.size === 0) return alert("이관할 거래처를 선택하세요.");
    if (!confirm(`${fromUser?.name} → ${toUser?.name}\n거래처 ${checked.size}건을 이관하시겠습니까?`)) return;

    setApplying(true);
    setError("");
    try {
      const result = await transferClients([...checked], toId);
      setDone(`${result.count}건이 ${result.toUserName}님에게 이관되었습니다.`);
      // 이관 후 남은 거래처 다시 로드
      const list = await getAssignedClients(fromId);
      setClients(list);
      setChecked(new Set(list.map(c => c.id)));
      // 유저별 카운트 갱신
      getTransferUsers().then(setUsers).catch(() => {});
      router.refresh();
    } catch (e: any) {
      setError(e.message === "FORBIDDEN" ? "권한이 없습니다." : e.message || "이관 중 오류가 발생했습니다.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#191F28]">담당자 이관</h2>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
        </div>

        {/* 보내는/받는 담당자 선택 */}
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-[#6B7684] mb-1">보내는 담당자</label>
            <select
              value={fromId}
              onChange={e => setFromId(e.target.value ? Number(e.target.value) : "")}
              className="w-full border border-[#D1D6DB] rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">선택하세요</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.clientCount}건){!u.isActive ? " · 비활성" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[#3182F6] font-bold pb-2">→</div>
          <div className="flex-1">
            <label className="block text-xs text-[#6B7684] mb-1">받는 담당자</label>
            <select
              value={toId}
              onChange={e => setToId(e.target.value ? Number(e.target.value) : "")}
              className="w-full border border-[#D1D6DB] rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">선택하세요</option>
              {receivers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.clientCount}건)
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-[#B91C1C] text-sm">
            {error}
          </div>
        )}
        {done && (
          <div className="mb-3 p-3 bg-[#F1FBF4] rounded-lg text-[#166534] text-sm font-medium">
            ✅ {done}
          </div>
        )}

        {/* 거래처 체크리스트 */}
        {fromId !== "" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="거래처명·대표자 검색"
                className="flex-1 border border-[#F2F4F6] bg-[#F9FAFB] rounded-lg px-3 py-1.5 text-sm"
              />
              <button
                onClick={toggleAllFiltered}
                className="text-xs text-[#3182F6] hover:underline shrink-0"
              >
                {filtered.length > 0 && filtered.every(c => checked.has(c.id)) ? "전체 해제" : "전체 선택"}
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto border border-[#F2F4F6] rounded-lg divide-y divide-[#F2F4F6]">
              {loading ? (
                <div className="p-4 text-sm text-[#8B95A1] text-center">불러오는 중...</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-[#8B95A1] text-center">
                  {clients.length === 0 ? "담당 거래처가 없습니다." : "검색 결과가 없습니다."}
                </div>
              ) : (
                filtered.map(c => (
                  <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#F5F9FF]/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="accent-[#3182F6] w-4 h-4 shrink-0"
                    />
                    <span className="text-sm font-medium text-[#191F28] truncate">{c.name}</span>
                    {c.ceoName && <span className="text-xs text-[#8B95A1] shrink-0">{c.ceoName}</span>}
                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${c.clientType === "corporate" ? "bg-[#E8F3FF] text-[#1B64DA]" : "bg-[#F2F4F6] text-[#4E5968]"}`}>
                        {c.clientType === "corporate" ? "법인" : "개인"}
                      </span>
                      {c.contractStatus !== "active" && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#DC2626]">해지</span>
                      )}
                    </span>
                  </label>
                ))
              )}
            </div>

            {/* 하단 액션 */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-[#4E5968]">
                <span className="font-bold text-[#3182F6]">{checked.size}</span> / {clients.length}건 선택됨
              </div>
              <button
                onClick={handleApply}
                disabled={applying || checked.size === 0 || toId === ""}
                className="px-5 py-2 bg-[#3182F6] text-white text-sm font-medium rounded-lg hover:bg-[#1B64DA] disabled:opacity-40 transition-colors"
              >
                {applying ? "이관 중..." : `${checked.size}건 이관하기`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
