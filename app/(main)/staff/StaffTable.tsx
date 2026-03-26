"use client";

import { useState } from "react";
import { createStaff, updateStaff, deleteStaff } from "@/app/actions/staff";

interface Staff {
  id: number;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}

const roleLabels: Record<string, string> = {
  owner: "대표",
  admin: "관리자",
  staff: "실무자",
  readonly: "조회전용",
};

export default function StaffTable({
  staffList,
  currentUserId,
}: {
  staffList: Staff[];
  currentUserId: number;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function handleCreate(formData: FormData) {
    setError("");
    try {
      await createStaff(formData);
      setShowCreate(false);
    } catch (e: any) {
      setError(e.message || "오류 발생");
    }
  }

  async function handleUpdate(id: number, formData: FormData) {
    setError("");
    try {
      await updateStaff(id, formData);
      setEditId(null);
    } catch (e: any) {
      setError(e.message || "오류 발생");
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`'${name}' 계정을 비활성화하시겠습니까?`)) return;
    try {
      await deleteStaff(id);
    } catch (e: any) {
      setError(e.message || "오류 발생");
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-500 hover:text-red-800">✕</button>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-[#1a2e4a] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#243d61] transition-colors"
        >
          + 직원 추가
        </button>
      </div>

      {showCreate && (
        <form action={handleCreate} className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 mb-4">
          <h3 className="font-semibold text-gray-800 mb-4">새 직원 등록</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">아이디</label>
              <input name="username" required placeholder="로그인용 아이디" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">이름</label>
              <input name="name" required placeholder="직원 이름" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">비밀번호</label>
              <input name="password" type="password" required placeholder="초기 비밀번호" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">권한</label>
              <select name="role" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="staff">실무자</option>
                <option value="admin">관리자</option>
                <option value="readonly">조회전용</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-[#1a2e4a] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#243d61]">등록</button>
            <button type="button" onClick={() => setShowCreate(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 font-medium text-gray-600">이름</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">아이디</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">권한</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">상태</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">관리</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                {editId === s.id ? (
                  <EditRow staff={s} onSave={handleUpdate} onCancel={() => setEditId(null)} />
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {s.name}
                      {s.id === currentUserId && <span className="ml-1 text-xs text-blue-500">(나)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.username}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        s.role === "owner" ? "bg-purple-100 text-purple-700" :
                        s.role === "admin" ? "bg-blue-100 text-blue-700" :
                        s.role === "staff" ? "bg-green-100 text-green-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {roleLabels[s.role] || s.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${s.isActive ? "text-green-600" : "text-red-500"}`}>
                        {s.isActive ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditId(s.id)} className="text-xs text-[#1a2e4a] hover:underline">수정</button>
                        {s.id !== currentUserId && (
                          <button onClick={() => handleDelete(s.id, s.name)} className="text-xs text-red-500 hover:underline">
                            {s.isActive ? "비활성화" : ""}
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EditRow({ staff, onSave, onCancel }: { staff: Staff; onSave: (id: number, fd: FormData) => void; onCancel: () => void }) {
  return (
    <td colSpan={5} className="px-4 py-3">
      <form action={(fd) => onSave(staff.id, fd)} className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="text-xs text-gray-500">이름</label>
          <input name="name" defaultValue={staff.name} className="border border-gray-300 rounded px-2 py-1 text-sm w-24" />
        </div>
        <div>
          <label className="text-xs text-gray-500">권한</label>
          <select name="role" defaultValue={staff.role} className="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="owner">대표</option>
            <option value="admin">관리자</option>
            <option value="staff">실무자</option>
            <option value="readonly">조회전용</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">상태</label>
          <select name="isActive" defaultValue={String(staff.isActive)} className="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="true">활성</option>
            <option value="false">비활성</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">새 비밀번호</label>
          <input name="newPassword" type="password" placeholder="변경 시 입력" className="border border-gray-300 rounded px-2 py-1 text-sm w-28" />
        </div>
        <div className="flex gap-2 mt-3">
          <button type="submit" className="bg-[#1a2e4a] text-white px-3 py-1 rounded text-xs">저장</button>
          <button type="button" onClick={onCancel} className="border border-gray-300 px-3 py-1 rounded text-xs">취소</button>
        </div>
      </form>
    </td>
  );
}
