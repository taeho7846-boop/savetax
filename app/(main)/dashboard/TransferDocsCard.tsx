"use client";

import { useState, useEffect } from "react";

type TransferFile = {
  id: string;
  name: string;
  isFolder: boolean;
  modifiedTime: string;
  webViewLink: string;
  confirmed: boolean;
};

export function TransferDocsCard() {
  const [files, setFiles] = useState<TransferFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveResult, setMoveResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/transfer-docs")
      .then((r) => r.json())
      .then((data) => {
        setFiles(data.pending || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleConfirm(fileId: string, fileName: string) {
    setConfirming(fileId);
    try {
      await fetch("/api/transfer-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: fileId, fileName }),
      });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {} finally {
      setConfirming(null);
    }
  }

  async function handleMove(fileId: string, fileName: string) {
    setMoving(fileId);
    setMoveResult(null);
    try {
      const res = await fetch("/api/transfer-docs/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: fileId, fileName }),
      });
      const data = await res.json();
      if (res.ok) {
        setMoveResult({ id: fileId, ok: true, message: data.message });
        // 이동 성공 시 자동으로 이관완료 처리
        await fetch("/api/transfer-docs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveFileId: fileId, fileName }),
        });
        // 3초 후 목록에서 제거
        setTimeout(() => {
          setFiles((prev) => prev.filter((f) => f.id !== fileId));
          setMoveResult(null);
        }, 3000);
      } else {
        setMoveResult({ id: fileId, ok: false, message: data.message || data.error });
      }
    } catch {
      setMoveResult({ id: fileId, ok: false, message: "네트워크 오류" });
    } finally {
      setMoving(null);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-orange-200">
      <div className="px-5 py-3 border-b border-orange-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📦</span>
          <h2 className="font-medium text-orange-800">이관자료 수신</h2>
          <span className="bg-orange-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {files.length}
          </span>
        </div>
        <a
          href="https://drive.google.com/drive/u/3/folders/0ACGF_pTVEHtDUk9PVA"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-orange-600 hover:underline"
        >
          드라이브 열기 →
        </a>
      </div>
      <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
        {loading && (
          <div className="px-5 py-6 text-center text-sm text-gray-400">확인 중...</div>
        )}
        {!loading && files.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-gray-400">새로운 이관자료가 없습니다</div>
        )}
        {files.map((file) => (
          <div key={file.id} className="px-5 py-3 hover:bg-orange-50/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-lg shrink-0">{file.isFolder ? "📁" : "📄"}</span>
              <div className="flex-1 min-w-0">
                <a
                  href={file.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-800 hover:text-blue-600 hover:underline truncate block"
                >
                  {file.name}
                </a>
                <div className="text-[10px] text-gray-400">
                  {new Date(file.modifiedTime).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => handleMove(file.id, file.name)}
                  disabled={moving === file.id || confirming === file.id}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50"
                >
                  {moving === file.id ? "이동중..." : "자료이동"}
                </button>
                <button
                  onClick={() => handleConfirm(file.id, file.name)}
                  disabled={confirming === file.id || moving === file.id}
                  className="text-xs px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors disabled:opacity-50"
                >
                  {confirming === file.id ? "처리중..." : "이관완료"}
                </button>
              </div>
            </div>
            {/* 이동 결과 메시지 */}
            {moveResult?.id === file.id && (
              <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${
                moveResult.ok
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}>
                {moveResult.message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
