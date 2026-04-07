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

  if (loading) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-orange-200 mb-6">
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
        {files.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-gray-400">새로운 이관자료가 없습니다</div>
        )}
        {files.map((file) => (
          <div key={file.id} className="px-5 py-3 flex items-center gap-3 hover:bg-orange-50/50 transition-colors">
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
            <button
              onClick={() => handleConfirm(file.id, file.name)}
              disabled={confirming === file.id}
              className="text-xs px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors shrink-0 disabled:opacity-50"
            >
              {confirming === file.id ? "처리중..." : "이관완료"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
