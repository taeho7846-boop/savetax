"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStaff, updateStaff, deleteStaff } from "@/app/actions/staff";

interface Staff {
  id: number;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  managerId: number | null;
  bizName1: string | null;
  bizName2: string | null;
  allowedMenus: string | null;
  googleEmail: string | null;
  googleCalendarId: string | null;
  createdAt: Date;
}

const ALL_MENUS = [
  { key: "dashboard", label: "대시보드" },
  { key: "clients", label: "고객사 관리" },
  { key: "commission", label: "신규수임" },
  { key: "tax-agency", label: "신고대리" },
  { key: "withholding", label: "원천세" },
  { key: "income-tax", label: "종합소득세" },
  { key: "receivables", label: "채권 관리" },
  { key: "data-collect", label: "자료수집" },
  { key: "distribution", label: "Savetax 배분" },
  { key: "settlement", label: "Savetax 정산" },
  { key: "distribution-taeho", label: "세무회계태호 배분" },
  { key: "revenue", label: "수익추이" },
  { key: "schedule", label: "스케쥴" },
  { key: "tasks", label: "업무/메모" },
];

const roleLabels: Record<string, string> = {
  owner: "대표",
  admin: "관리자",
  accountant: "세무사",
  employee: "직원",
  readonly: "조회전용",
};

const roleColors: Record<string, string> = {
  owner: "bg-[#E8F3FF] text-[#1B64DA]",
  admin: "bg-[#E8F3FF] text-[#1B64DA]",
  accountant: "bg-emerald-100 text-emerald-700",
  employee: "bg-[#F2F4F6] text-[#4E5968]",
  readonly: "bg-[#F2F4F6] text-[#8B95A1]",
};

export default function StaffTable({
  staffList,
  currentUserId,
}: {
  staffList: Staff[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [openAccountants, setOpenAccountants] = useState<Set<number>>(new Set());

  // 그룹 분류: 직원을 가질 수 있는 사람 = 대표/관리자/세무사
  const managers = staffList.filter(s => s.role === "owner" || s.role === "admin" || s.role === "accountant");
  const unassigned = staffList.filter(s => s.role === "employee" && !s.managerId);
  const readonlyUsers = staffList.filter(s => s.role === "readonly");

  function getEmployees(managerId: number) {
    return staffList.filter(s => s.role === "employee" && s.managerId === managerId);
  }

  function toggleAccountant(id: number) {
    setOpenAccountants(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleCreate(formData: FormData) {
    setError("");
    try {
      await createStaff(formData);
      setShowCreate(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message || "오류 발생");
    }
  }

  async function handleUpdate(id: number, formData: FormData) {
    setError("");
    try {
      await updateStaff(id, formData);
      setEditId(null);
      router.refresh();
    } catch (e: any) {
      setError(e.message || "오류 발생");
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`'${name}' 계정을 비활성화하시겠습니까?`)) return;
    try {
      await deleteStaff(id);
      router.refresh();
    } catch (e: any) {
      setError(e.message || "오류 발생");
    }
  }

  function PersonRow({ person, indent = false }: { person: Staff; indent?: boolean }) {
    if (editId === person.id) {
      return (
        <EditRow
          staff={person}
          accountants={managers}
          onSave={handleUpdate}
          onCancel={() => setEditId(null)}
        />
      );
    }
    return (
      <div className={`flex items-center gap-3 px-4 py-3 hover:bg-[#F9FAFB] transition-colors ${indent ? "pl-12" : ""}`}>
        {indent && <span className="text-[#B0B8C1] -ml-4">└</span>}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-[#191F28]">{person.name}</span>
          {person.id === currentUserId && <span className="ml-1 text-xs text-[#3182F6]">(나)</span>}
          <span className="ml-2 text-xs text-[#8B95A1]">{person.username}</span>
        </div>
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${roleColors[person.role] || "bg-[#F2F4F6] text-[#4E5968]"}`}>
          {roleLabels[person.role] || person.role}
        </span>
        {!person.isActive && <span className="text-xs text-[#E02E2E]">비활성</span>}
        <div className="flex gap-2">
          <button onClick={() => setEditId(person.id)} className="text-xs text-[#191F28] hover:underline">수정</button>
          {person.id !== currentUserId && person.isActive && (
            <button onClick={() => handleDelete(person.id, person.name)} className="text-xs text-[#E02E2E] hover:underline">비활성화</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-[#B91C1C] text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-[#E02E2E] hover:text-[#991B1B]">✕</button>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-[#3182F6] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#1B64DA] transition-colors"
        >
          + 계정 추가
        </button>
      </div>

      {showCreate && (
        <form action={handleCreate} className="glass rounded-2xl p-5 mb-4">
          <h3 className="font-bold text-[#191F28] mb-4">새 계정 등록</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">아이디</label>
              <input name="username" required placeholder="로그인용 아이디" className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">이름</label>
              <input name="name" required placeholder="이름" className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">비밀번호</label>
              <input name="password" type="password" required placeholder="초기 비밀번호" className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">권한</label>
              <select name="role" defaultValue="accountant" className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm">
                <option value="accountant">세무사</option>
                <option value="employee">직원</option>
                <option value="admin">관리자</option>
                <option value="readonly">조회전용</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6B7684] mb-1">소속 (직원만)</label>
              <select name="managerId" className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm">
                <option value="">없음</option>
                {managers.filter((m: Staff) => m.isActive).map((m: Staff) => (
                  <option key={m.id} value={m.id}>{m.name} ({roleLabels[m.role]})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-[#3182F6] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#1B64DA]">등록</button>
            <button type="button" onClick={() => setShowCreate(false)} className="border border-[#D1D6DB] px-4 py-2 rounded-lg text-sm text-[#4E5968] hover:bg-[#F9FAFB]">취소</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {/* 대표/관리자/세무사 + 소속 직원 */}
        {managers.map((mgr: Staff) => {
          const emps = getEmployees(mgr.id);
          const isOpen = openAccountants.has(mgr.id);
          const headerBg = mgr.role === "owner" || mgr.role === "admin"
            ? "bg-[#F5F9FF] border-b border-purple-100 hover:bg-[#E8F3FF]"
            : "bg-emerald-50 border-b border-emerald-100 hover:bg-emerald-100";
          const arrowColor = mgr.role === "owner" || mgr.role === "admin" ? "text-[#3182F6]" : "text-emerald-600";

          return (
            <div key={mgr.id} className="glass rounded-2xl overflow-hidden">
              <div
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${headerBg}`}
                onClick={() => toggleAccountant(mgr.id)}
              >
                <span className={`text-sm ${arrowColor}`}>{isOpen ? "▼" : "▶"}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[#191F28]">{mgr.name}</span>
                  {(mgr.bizName1 || mgr.bizName2) && (
                    <span className="ml-2 text-xs text-[#8B95A1]">
                      {[mgr.bizName1, mgr.bizName2].filter(Boolean).join(" / ")}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#8B95A1]">{mgr.username}</span>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${roleColors[mgr.role] || "bg-[#F2F4F6] text-[#4E5968]"}`}>
                  {roleLabels[mgr.role] || mgr.role}
                </span>
                {!mgr.isActive && <span className="text-xs text-[#E02E2E]">비활성</span>}
                <span className="text-xs text-[#8B95A1]">{emps.length}명</span>
                <div className="flex gap-2" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <button onClick={() => setEditId(mgr.id)} className="text-xs text-[#191F28] hover:underline">수정</button>
                  {mgr.id !== currentUserId && mgr.isActive && (
                    <button onClick={() => handleDelete(mgr.id, mgr.name)} className="text-xs text-[#E02E2E] hover:underline">비활성화</button>
                  )}
                </div>
              </div>
              {editId === mgr.id && (
                <EditRow staff={mgr} accountants={managers} onSave={handleUpdate} onCancel={() => setEditId(null)} />
              )}
              {isOpen && (
                <div className="divide-y divide-[#F2F4F6]">
                  {emps.length === 0 ? (
                    <div className="px-12 py-3 text-xs text-[#8B95A1]">소속 직원 없음</div>
                  ) : (
                    emps.map((emp: Staff) => <PersonRow key={emp.id} person={emp} indent />)
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* 미배정 직원 */}
        {unassigned.length > 0 && (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#FEFCE8] border-b border-yellow-100">
              <span className="text-xs font-bold text-[#D97706] uppercase tracking-wide">미배정 직원</span>
            </div>
            <div className="divide-y divide-[#F2F4F6]">
              {unassigned.map(p => <PersonRow key={p.id} person={p} />)}
            </div>
          </div>
        )}

        {/* 조회전용 */}
        {readonlyUsers.length > 0 && (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#F9FAFB] border-b border-[#F2F4F6]">
              <span className="text-xs font-bold text-[#6B7684] uppercase tracking-wide">조회전용</span>
            </div>
            <div className="divide-y divide-[#F2F4F6]">
              {readonlyUsers.map(p => <PersonRow key={p.id} person={p} />)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function EditRow({
  staff,
  accountants,
  onSave,
  onCancel,
}: {
  staff: Staff;
  accountants: Staff[];
  onSave: (id: number, fd: FormData) => void;
  onCancel: () => void;
}) {
  const currentMenus = staff.allowedMenus ? staff.allowedMenus.split(",") : ALL_MENUS.map(m => m.key);
  const [checkedMenus, setCheckedMenus] = useState<Set<string>>(new Set(currentMenus));

  function toggleMenu(key: string) {
    setCheckedMenus(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (checkedMenus.size === ALL_MENUS.length) {
      setCheckedMenus(new Set());
    } else {
      setCheckedMenus(new Set(ALL_MENUS.map(m => m.key)));
    }
  }

  return (
    <div className="px-4 py-3 bg-[#F5F9FF]/50 border-b border-[#F2F4F6]">
      <form action={(fd) => {
        fd.set("allowedMenus", [...checkedMenus].join(","));
        onSave(staff.id, fd);
      }} className="space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-[#6B7684]">이름</label>
            <input name="name" defaultValue={staff.name} className="border border-[#D1D6DB] rounded px-2 py-1 text-sm w-24 block" />
          </div>
          <div>
            <label className="text-xs text-[#6B7684]">권한</label>
            <select name="role" defaultValue={staff.role} className="border border-[#D1D6DB] rounded px-2 py-1 text-sm block">
              <option value="owner">대표</option>
              <option value="admin">관리자</option>
              <option value="accountant">세무사</option>
              <option value="employee">직원</option>
              <option value="readonly">조회전용</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#6B7684]">소속 세무사</label>
            <select name="managerId" defaultValue={staff.managerId ?? ""} className="border border-[#D1D6DB] rounded px-2 py-1 text-sm block">
              <option value="">없음</option>
              {accountants.filter(a => a.isActive && a.id !== staff.id).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#6B7684]">사업체명 1</label>
            <input name="bizName1" defaultValue={staff.bizName1 ?? ""} placeholder="예) 세이브택스" className="border border-[#D1D6DB] rounded px-2 py-1 text-sm w-32 block" />
          </div>
          <div>
            <label className="text-xs text-[#6B7684]">사업체명 2</label>
            <input name="bizName2" defaultValue={staff.bizName2 ?? ""} placeholder="예) 세무회계태호" className="border border-[#D1D6DB] rounded px-2 py-1 text-sm w-32 block" />
          </div>
          <div>
            <label className="text-xs text-[#6B7684]">구글 이메일</label>
            <input name="googleEmail" defaultValue={staff.googleEmail ?? ""} placeholder="kim@gmail.com" className="border border-[#D1D6DB] rounded px-2 py-1 text-sm w-40 block" />
          </div>
          <div>
            <label className="text-xs text-[#6B7684]">구글 캘린더 ID</label>
            <input name="googleCalendarId" defaultValue={staff.googleCalendarId ?? ""} placeholder="kim@gmail.com" className="border border-[#D1D6DB] rounded px-2 py-1 text-sm w-40 block" />
          </div>
          <div>
            <label className="text-xs text-[#6B7684]">상태</label>
            <select name="isActive" defaultValue={String(staff.isActive)} className="border border-[#D1D6DB] rounded px-2 py-1 text-sm block">
              <option value="true">활성</option>
              <option value="false">비활성</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#6B7684]">새 비밀번호</label>
            <input name="newPassword" type="password" placeholder="변경 시 입력" className="border border-[#D1D6DB] rounded px-2 py-1 text-sm w-28 block" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-[#3182F6] text-white px-3 py-1 rounded text-xs">저장</button>
            <button type="button" onClick={onCancel} className="border border-[#D1D6DB] px-3 py-1 rounded text-xs">취소</button>
          </div>
        </div>

        {/* 메뉴 권한 */}
        <div className="border-t border-[#E5E8EB] pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-[#4E5968]">메뉴 권한</span>
            <button type="button" onClick={toggleAll} className="text-[10px] text-[#3182F6] hover:underline">
              {checkedMenus.size === ALL_MENUS.length ? "전체 해제" : "전체 선택"}
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {ALL_MENUS.map(m => (
              <label key={m.key} className="flex items-center gap-1.5 text-xs text-[#333D4B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkedMenus.has(m.key)}
                  onChange={() => toggleMenu(m.key)}
                  className="accent-[#3182F6] w-3.5 h-3.5"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
