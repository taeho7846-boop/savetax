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

function BulkUploadModal({ onClose }: { onClose: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[]; message: string } | null>(null);
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
          <p className="text-xs text-gray-500 mb-3">양식에 맞춰 거래처 정보를 입력한 뒤 업로드하세요.</p>
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
          <div className={`rounded-lg p-4 mb-4 text-sm ${result.created > 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
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
