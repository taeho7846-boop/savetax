"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export function BulkUploadButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-[#3182F6] text-[#191F28] text-sm px-4 py-2 rounded-lg hover:bg-[#3182F6] hover:text-white transition-colors"
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
        className="border border-[#3182F6] text-[#191F28] text-sm px-4 py-2 rounded-lg hover:bg-[#3182F6] hover:text-white transition-colors"
      >
        일괄수정
      </button>
      {open && <BulkUpdateModal onClose={() => setOpen(false)} />}
    </>
  );
}

type FieldChange = { field: string; from: string; to: string };
type ChangeItem = { clientName: string; bizNumber: string; fields: FieldChange[] };
type WithdrawalChange = { clientId: number; clientName: string; bizNumber: string; currentValue: string | null; newValue: string };

function BulkUpdateModal({ onClose }: { onClose: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<{ updated: number; skipped: number; errors: string[]; changes: ChangeItem[] } | null>(null);
  const [applied, setApplied] = useState(false);
  const [withdrawalPreview, setWithdrawalPreview] = useState<WithdrawalChange[] | null>(null);
  const [applyingWithdrawal, setApplyingWithdrawal] = useState(false);
  const [savedFile, setSavedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handlePreview() {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert("파일을 선택해주세요.");

    setUploading(true);
    setPreview(null);
    setApplied(false);
    setWithdrawalPreview(null);
    setSavedFile(file);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/clients/bulk-update?mode=preview", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setPreview(data);
      } else {
        setPreview({ updated: 0, skipped: 0, errors: [data.error], changes: [] });
      }
    } catch {
      setPreview({ updated: 0, skipped: 0, errors: ["네트워크 오류"], changes: [] });
    } finally {
      setUploading(false);
    }
  }

  async function handleApply() {
    if (!savedFile) return;
    setApplying(true);

    const fd = new FormData();
    fd.append("file", savedFile);

    try {
      const res = await fetch("/api/clients/bulk-update?mode=apply", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setApplied(true);
        router.refresh();

        // 최초출금월 미리보기
        const fd2 = new FormData();
        fd2.append("file", savedFile);
        const res2 = await fetch("/api/clients/bulk-update-preview", { method: "POST", body: fd2 });
        const data2 = await res2.json();
        if (res2.ok && data2.changes?.length > 0) {
          setWithdrawalPreview(data2.changes);
        }
      } else {
        alert(data.error || "적용 실패");
      }
    } catch {
      alert("네트워크 오류");
    } finally {
      setApplying(false);
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#191F28]">거래처 일괄수정</h2>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
        </div>

        <div className="bg-[#F9FAFB] rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-[#333D4B]">엑셀 파일 업로드</div>
            <a
              href="/api/clients/bulk-update-template"
              className="text-xs text-[#3182F6] hover:text-[#0049BC] hover:underline"
            >
              템플릿 다운로드 ↓
            </a>
          </div>
          <p className="text-xs text-[#6B7684] mb-3">
            사업자등록번호로 기존 거래처를 매칭하여 비어있는 항목만 채웁니다.
          </p>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="flex-1 text-sm text-[#4E5968] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-[#D1D6DB] file:text-sm file:bg-white file:text-[#333D4B] hover:file:bg-[#F2F4F6]"
            />
            <button
              onClick={handlePreview}
              disabled={uploading}
              className="px-4 py-2 bg-[#3182F6] text-white text-sm rounded-lg hover:bg-[#1B64DA] disabled:opacity-50 shrink-0"
            >
              {uploading ? "분석 중..." : "미리보기"}
            </button>
          </div>
        </div>

        {/* 미리보기 결과 */}
        {preview && !applied && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-[#333D4B]">
                변경 예정 <span className="text-[#3182F6]">{preview.updated}건</span> · 건너뜀 {preview.skipped}건
                {preview.errors.length > 0 && <span className="text-[#E02E2E]"> · 오류 {preview.errors.length}건</span>}
              </div>
              {preview.changes.length > 0 && (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="px-4 py-2 bg-[#16A865] text-white text-sm rounded-lg hover:bg-[#15803D] disabled:opacity-50"
                >
                  {applying ? "적용 중..." : `${preview.updated}건 적용하기`}
                </button>
              )}
            </div>

            {preview.changes.length > 0 && (
              <div className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-[#F9FAFB]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[#4E5968] font-medium">거래처</th>
                      <th className="px-3 py-2 text-left text-[#4E5968] font-medium">사업자번호</th>
                      <th className="px-3 py-2 text-left text-[#4E5968] font-medium">변경 항목</th>
                      <th className="px-3 py-2 text-left text-[#4E5968] font-medium">기존</th>
                      <th className="px-3 py-2 text-left text-[#4E5968] font-medium">변경</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2F4F6]">
                    {preview.changes.map((c, ci) =>
                      c.fields.map((f, fi) => (
                        <tr key={`${ci}-${fi}`} className="hover:bg-[#F5F9FF]/30">
                          {fi === 0 && (
                            <>
                              <td className="px-3 py-1.5 font-medium text-[#191F28]" rowSpan={c.fields.length}>{c.clientName}</td>
                              <td className="px-3 py-1.5 text-[#6B7684]" rowSpan={c.fields.length}>{c.bizNumber}</td>
                            </>
                          )}
                          <td className="px-3 py-1.5 text-[#333D4B]">{f.field}</td>
                          <td className="px-3 py-1.5 text-[#8B95A1]">{f.from || <span className="text-[#B0B8C1]">비어있음</span>}</td>
                          <td className="px-3 py-1.5 text-[#3182F6] font-medium">{f.to}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {preview.errors.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-[#E02E2E] cursor-pointer">오류 {preview.errors.length}건 보기</summary>
                <ul className="text-xs mt-1 space-y-0.5 text-[#DC2626] max-h-32 overflow-y-auto">
                  {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {applied && (
          <div className="rounded-lg p-4 mb-4 bg-[#F1FBF4] text-[#166534] text-sm font-medium">
            ✅ {preview?.updated}건 업데이트 완료!
          </div>
        )}

        {/* 최초출금월 덮어쓰기 미리보기 */}
        {withdrawalPreview && withdrawalPreview.length > 0 && (
          <div className="rounded-lg border border-orange-200 bg-[#FFFBEB] p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-[#92400E]">최초출금월 변경 미리보기 ({withdrawalPreview.length}건)</div>
              <button
                onClick={handleApplyWithdrawal}
                disabled={applyingWithdrawal}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#F59E0B] text-white font-bold hover:bg-[#B45309] disabled:opacity-50"
              >
                {applyingWithdrawal ? "적용 중..." : "일괄 덮어쓰기"}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#92400E]">
                    <th className="text-left py-1">거래처명</th>
                    <th className="text-left py-1">현재값</th>
                    <th className="text-center py-1"></th>
                    <th className="text-left py-1">변경값</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawalPreview.map(c => (
                    <tr key={c.clientId} className="border-t border-orange-200">
                      <td className="py-1 text-[#191F28]">{c.clientName}</td>
                      <td className="py-1 text-[#6B7684]">{c.currentValue || "(없음)"}</td>
                      <td className="py-1 text-center text-[#D97706]">→</td>
                      <td className="py-1 font-medium text-[#92400E]">{c.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
          <h2 className="text-lg font-bold text-[#191F28]">거래처 대량등록</h2>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#333D4B] text-xl">✕</button>
        </div>

        {/* 템플릿 다운로드 */}
        <div className="bg-[#F9FAFB] rounded-lg p-4 mb-4">
          <div className="text-sm font-medium text-[#333D4B] mb-2">1. 엑셀 템플릿 다운로드</div>
          <p className="text-xs text-[#6B7684] mb-3">양식에 맞춰 거래처 정보를 입력한 뒤 업로드하세요.<br />사업자등록번호가 일치하는 기존 거래처는 빈 항목만 자동으로 채워집니다.</p>
          <a
            href="/api/clients/bulk-template"
            className="inline-block bg-white border border-[#D1D6DB] text-[#333D4B] text-sm px-4 py-2 rounded-lg hover:bg-[#F2F4F6] transition-colors"
          >
            엑셀 파일 내려받기
          </a>
        </div>

        {/* 파일 업로드 */}
        <div className="bg-[#F9FAFB] rounded-lg p-4 mb-4">
          <div className="text-sm font-medium text-[#333D4B] mb-2">2. 엑셀 파일 업로드</div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="w-full text-sm text-[#4E5968] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-[#D1D6DB] file:text-sm file:bg-white file:text-[#333D4B] hover:file:bg-[#F2F4F6]"
          />
        </div>

        {/* 결과 표시 */}
        {result && (
          <div className={`rounded-lg p-4 mb-4 text-sm ${(result.created > 0 || (result.updated ?? 0) > 0) ? "bg-[#F1FBF4] text-[#166534]" : "bg-[#FEF2F2] text-[#991B1B]"}`}>
            <div className="font-medium mb-1">{result.message}</div>
            {result.errors.length > 0 && (
              <ul className="text-xs mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-[#DC2626]">{e}</li>
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
                ? "bg-[#D1D6DB] text-[#6B7684] cursor-not-allowed"
                : "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
            }`}
          >
            {uploading ? "업로드 중..." : "업로드"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] text-sm text-[#4E5968] hover:bg-[#F9FAFB]"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
