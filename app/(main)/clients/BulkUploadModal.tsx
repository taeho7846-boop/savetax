"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export function BulkUploadButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-[#1a2e4a] text-[#1a2e4a] text-sm px-4 py-2 rounded-lg hover:bg-[#1a2e4a] hover:text-white transition-colors"
      >
        + 대량등록
      </button>
      {open && <BulkUploadModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function BulkUpdateButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-[#1a2e4a] text-[#1a2e4a] text-sm px-4 py-2 rounded-lg hover:bg-[#1a2e4a] hover:text-white transition-colors"
      >
        일괄수정
      </button>
      {open && <BulkUpdateModal onClose={() => setOpen(false)} />}
    </>
  );
}

type WithdrawalChange = { clientId: number; clientName: string; bizNumber: string; currentValue: string | null; newValue: string };

function BulkUpdateModal({ onClose }: { onClose: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number; errors: string[]; message: string } | null>(null);
  const [withdrawalPreview, setWithdrawalPreview] = useState<WithdrawalChange[] | null>(null);
  const [applyingWithdrawal, setApplyingWithdrawal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("파일을 선택해주세요.");

    setUploading(true);
    setResult(null);
    setWithdrawalPreview(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      // 1) 기존 일괄수정 (빈칸 채우기)
      const res = await fetch("/api/clients/bulk-update", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        router.refresh();
      } else {
        setResult({ updated: 0, skipped: 0, errors: [data.error], message: data.error });
      }

      // 2) 최초출금월 미리보기 (덮어쓰기 대상)
      const fd2 = new FormData();
      fd2.append("file", file);
      const res2 = await fetch("/api/clients/bulk-update-preview", { method: "POST", body: fd2 });
      const data2 = await res2.json();
      if (res2.ok && data2.changes?.length > 0) {
        setWithdrawalPreview(data2.changes);
      }
    } catch {
      setResult({ updated: 0, skipped: 0, errors: ["네트워크 오류"], message: "네트워크 오류" });
    } finally {
      setUploading(false);
    }
  }

  async function handleApplyWithdrawal() {
    if (!withdrawalPreview) return;
    if (!confirm(`${withdrawalPreview.length}건의 최초출금월을 덮어쓰시겠습니까?`)) return;
    setApplyingWithdrawal(true);
    try {
      const res = await fetch("/api/clients/bulk-update-preview", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: withdrawalPreview.map(c => ({ clientId: c.clientId, newValue: c.newValue })) }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`${data.updated}건 최초출금월 업데이트 완료`);
        setWithdrawalPreview(null);
        router.refresh();
      } else {
        alert(data.error || "오류 발생");
      }
    } catch { alert("네트워크 오류"); }
    finally { setApplyingWithdrawal(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">거래처 일괄수정</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-700">엑셀 파일 업로드</div>
            <a
              href="/api/clients/bulk-update-template"
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              템플릿 다운로드 ↓
            </a>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            사업자등록번호로 기존 거래처를 매칭하여 비어있는 항목만 채웁니다.<br />
            최초출금월은 미리보기 후 덮어쓰기 가능합니다.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-100"
          />
        </div>

        <div className="bg-blue-50 rounded-lg p-3 mb-4">
          <p className="text-xs text-blue-700">
            <span className="font-medium">지원하는 헤더:</span> 사업자등록번호, 고객사명, 대표자명, 주민등록번호, 연락처, 구분, 과세유형, 신고유형, 인건비, 주소, 홈택스ID, 홈택스PW, 기장료, 무료기장, 최초출금월, 은행, 계좌번호, 회계프로그램, 소통방법, 소속, 담당직원, 마이박스링크, 법인등록번호, 이메일, 특이사항
          </p>
        </div>

        {result && (
          <div className={`rounded-lg p-4 mb-4 text-sm ${result.updated > 0 ? "bg-green-50 text-green-800" : "bg-yellow-50 text-yellow-800"}`}>
            <div className="font-medium mb-1">{result.message}</div>
            {result.errors.length > 0 && (
              <ul className="text-xs mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-red-600">{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 최초출금월 덮어쓰기 미리보기 */}
        {withdrawalPreview && withdrawalPreview.length > 0 && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-orange-800">최초출금월 변경 미리보기 ({withdrawalPreview.length}건)</div>
              <button
                onClick={handleApplyWithdrawal}
                disabled={applyingWithdrawal}
                className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white font-bold hover:bg-orange-600 disabled:opacity-50"
              >
                {applyingWithdrawal ? "적용 중..." : "일괄 덮어쓰기"}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-orange-700">
                    <th className="text-left py-1">거래처명</th>
                    <th className="text-left py-1">현재값</th>
                    <th className="text-center py-1"></th>
                    <th className="text-left py-1">변경값</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawalPreview.map(c => (
                    <tr key={c.clientId} className="border-t border-orange-200">
                      <td className="py-1 text-gray-800">{c.clientName}</td>
                      <td className="py-1 text-gray-500">{c.currentValue || "(없음)"}</td>
                      <td className="py-1 text-center text-orange-500">→</td>
                      <td className="py-1 font-medium text-orange-800">{c.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              uploading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-[#1a2e4a] text-white hover:bg-[#243d61]"
            }`}
          >
            {uploading ? "업로드 중..." : "업로드"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkUploadModal({ onClose }: { onClose: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated?: number; errors: string[]; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("파일을 선택해주세요.");

    setUploading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/clients/bulk-upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        router.refresh();
      } else {
        setResult({ created: 0, errors: [data.error], message: data.error });
      }
    } catch {
      setResult({ created: 0, errors: ["네트워크 오류"], message: "네트워크 오류" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">거래처 대량등록</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        {/* 템플릿 다운로드 */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="text-sm font-medium text-gray-700 mb-2">1. 엑셀 템플릿 다운로드</div>
          <p className="text-xs text-gray-500 mb-3">양식에 맞춰 거래처 정보를 입력한 뒤 업로드하세요.<br />사업자등록번호가 일치하는 기존 거래처는 빈 항목만 자동으로 채워집니다.</p>
          <a
            href="/api/clients/bulk-template"
            className="inline-block bg-white border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            엑셀 파일 내려받기
          </a>
        </div>

        {/* 파일 업로드 */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="text-sm font-medium text-gray-700 mb-2">2. 엑셀 파일 업로드</div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-100"
          />
        </div>

        {/* 결과 표시 */}
        {result && (
          <div className={`rounded-lg p-4 mb-4 text-sm ${(result.created > 0 || (result.updated ?? 0) > 0) ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            <div className="font-medium mb-1">{result.message}</div>
            {result.errors.length > 0 && (
              <ul className="text-xs mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-red-600">{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              uploading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-[#1a2e4a] text-white hover:bg-[#243d61]"
            }`}
          >
            {uploading ? "업로드 중..." : "업로드"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
