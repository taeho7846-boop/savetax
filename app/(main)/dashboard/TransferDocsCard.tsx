"use client";

import { useState, useEffect, useRef } from "react";

type TransferFile = {
  id: string;
  name: string;
  isFolder: boolean;
  modifiedTime: string;
  webViewLink: string;
  confirmed: boolean;
};

type Suggestion = {
  id: number;
  name: string;
  score: number;
};

type FileState = {
  suggestions: Suggestion[];
  loadingSuggestions: boolean;
  searchQuery: string;
  searchResults: Suggestion[];
  copying: number | null; // clientId
  status: "pending" | "copied" | "skipped";
  copiedClientName?: string;
  copiedFileId?: string;
  error?: string;
};

export function TransferDocsCard() {
  const [files, setFiles] = useState<TransferFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileStates, setFileStates] = useState<Record<string, FileState>>({});

  useEffect(() => {
    fetch("/api/transfer-docs")
      .then((r) => r.json())
      .then((data) => {
        setFiles(data.pending || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 파일이 로드되면 각 파일에 대해 추천 거래처 가져오기
  useEffect(() => {
    files.forEach((file) => {
      if (fileStates[file.id]) return;
      setFileStates((prev) => ({
        ...prev,
        [file.id]: { suggestions: [], loadingSuggestions: true, searchQuery: "", searchResults: [], copying: null, status: "pending" },
      }));
      fetch(`/api/transfer-docs/move?fileName=${encodeURIComponent(file.name)}`)
        .then((r) => r.json())
        .then((data) => {
          setFileStates((prev) => ({
            ...prev,
            [file.id]: { ...prev[file.id], suggestions: data.suggestions || [], loadingSuggestions: false },
          }));
        })
        .catch(() => {
          setFileStates((prev) => ({
            ...prev,
            [file.id]: { ...prev[file.id], loadingSuggestions: false },
          }));
        });
    });
  }, [files]);

  async function handleCopy(fileId: string, fileName: string, clientId: number) {
    setFileStates((prev) => ({ ...prev, [fileId]: { ...prev[fileId], copying: clientId, error: undefined } }));
    try {
      const res = await fetch("/api/transfer-docs/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: fileId, fileName, clientId }),
      });
      const data = await res.json();
      if (res.ok) {
        // 이관완료 처리도 함께
        await fetch("/api/transfer-docs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveFileId: fileId, fileName }),
        });
        setFileStates((prev) => ({
          ...prev,
          [fileId]: { ...prev[fileId], copying: null, status: "copied", copiedClientName: data.clientName, copiedFileId: data.copiedFileId },
        }));
      } else {
        setFileStates((prev) => ({
          ...prev,
          [fileId]: { ...prev[fileId], copying: null, error: data.error },
        }));
      }
    } catch {
      setFileStates((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], copying: null, error: "네트워크 오류" },
      }));
    }
  }

  async function handleSkip(fileId: string, fileName: string) {
    await fetch("/api/transfer-docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveFileId: fileId, fileName }),
    });
    setFileStates((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], status: "skipped" },
    }));
  }

  // 복사 취소 (복사된 파일 삭제)
  async function handleUndo(fileId: string) {
    const state = fileStates[fileId];
    if (!state?.copiedFileId) return;
    try {
      // 복사된 파일을 휴지통으로
      await fetch(`/api/transfer-docs/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copiedFileId: state.copiedFileId, driveFileId: fileId }),
      });
      setFileStates((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], status: "pending", copiedClientName: undefined, copiedFileId: undefined },
      }));
    } catch {}
  }

  const pendingFiles = files.filter((f) => {
    const state = fileStates[f.id];
    return !state || state.status === "pending";
  });
  const doneFiles = files.filter((f) => {
    const state = fileStates[f.id];
    return state && (state.status === "copied" || state.status === "skipped");
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-orange-200">
      <div className="px-5 py-3 border-b border-orange-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📦</span>
          <h2 className="font-medium text-orange-800">이관자료 수신</h2>
          <span className="bg-orange-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {pendingFiles.length}
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
      <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
        {loading && (
          <div className="px-5 py-6 text-center text-sm text-gray-400">확인 중...</div>
        )}
        {!loading && files.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-gray-400">새로운 이관자료가 없습니다</div>
        )}

        {/* 처리 대기 */}
        {pendingFiles.map((file) => (
          <TransferFileItem
            key={file.id}
            file={file}
            state={fileStates[file.id]}
            onCopy={(clientId) => handleCopy(file.id, file.name, clientId)}
            onSkip={() => handleSkip(file.id, file.name)}
            onSearchChange={(q) => {
              setFileStates((prev) => ({ ...prev, [file.id]: { ...prev[file.id], searchQuery: q } }));
              if (q.length >= 1) {
                fetch(`/api/transfer-docs/move?q=${encodeURIComponent(q)}`)
                  .then((r) => r.json())
                  .then((data) => {
                    setFileStates((prev) => ({ ...prev, [file.id]: { ...prev[file.id], searchResults: data.suggestions || [] } }));
                  });
              } else {
                setFileStates((prev) => ({ ...prev, [file.id]: { ...prev[file.id], searchResults: [] } }));
              }
            }}
          />
        ))}

        {/* 처리 완료 */}
        {doneFiles.map((file) => {
          const state = fileStates[file.id];
          return (
            <div key={file.id} className="px-5 py-3 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <span className="text-lg shrink-0">{state.status === "copied" ? "✅" : "⏭️"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-500 truncate">{file.name}</div>
                  <div className="text-xs text-gray-400">
                    {state.status === "copied"
                      ? `→ ${state.copiedClientName}/4. 이관자료 복사 완료`
                      : "건너뜀"}
                  </div>
                </div>
                {state.status === "copied" && (
                  <button
                    onClick={() => handleUndo(file.id)}
                    className="text-[10px] text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransferFileItem({
  file,
  state,
  onCopy,
  onSkip,
  onSearchChange,
}: {
  file: TransferFile;
  state?: FileState;
  onCopy: (clientId: number) => void;
  onSkip: () => void;
  onSearchChange: (q: string) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const suggestions = state?.suggestions || [];
  const searchResults = state?.searchResults || [];
  const copying = state?.copying;
  const error = state?.error;

  return (
    <div className="px-5 py-4">
      {/* 파일 정보 */}
      <div className="flex items-center gap-3 mb-3">
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
      </div>

      {/* 추천 거래처 */}
      {state?.loadingSuggestions ? (
        <div className="text-xs text-gray-400 ml-8 mb-2">거래처 매칭 중...</div>
      ) : suggestions.length > 0 ? (
        <div className="ml-8 mb-2">
          <div className="text-[11px] text-gray-400 mb-1.5 flex items-center gap-1">
            <span>💡</span> 추천 거래처:
          </div>
          <div className="space-y-1">
            {suggestions.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs">🏢</span>
                  <span className="text-sm font-medium text-gray-700">{s.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    s.score >= 90 ? "bg-green-100 text-green-700" : s.score >= 75 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {s.score}% 일치
                  </span>
                </div>
                <button
                  onClick={() => onCopy(s.id)}
                  disabled={copying !== null}
                  className="text-xs px-3 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50 shrink-0"
                >
                  {copying === s.id ? "복사중..." : "복사"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-400 ml-8 mb-2">매칭되는 거래처가 없습니다</div>
      )}

      {/* 직접 검색 */}
      <div className="ml-8 mb-2">
        {!showSearch ? (
          <button
            onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50); }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <span>🔍</span> 직접 검색
          </button>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs">🔍</span>
              <input
                ref={searchRef}
                type="text"
                placeholder="거래처명 검색..."
                value={state?.searchQuery || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button onClick={() => setShowSearch(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-1 ml-5">
                {searchResults.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="text-xs">🏢</span>
                    <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                    <button
                      onClick={() => onCopy(s.id)}
                      disabled={copying !== null}
                      className="text-xs px-3 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50"
                    >
                      {copying === s.id ? "복사중..." : "복사"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="ml-8 mb-2 text-xs px-3 py-2 rounded-lg bg-red-50 text-red-700">{error}</div>
      )}

      {/* 건너뛰기 */}
      <div className="ml-8">
        <button
          onClick={onSkip}
          className="text-[11px] text-gray-400 hover:text-gray-600 hover:underline"
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}
