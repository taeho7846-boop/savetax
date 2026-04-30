"use client";

import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";

type MatchResult =
  | { filename: string; status: "matched"; clientId: number; clientName: string; ceoName: string | null; driveFolderId: string; year: string; warning?: string }
  | { filename: string; status: "warning_no_drive"; clientId: number; clientName: string; ceoName: string | null; year: string; reason: string }
  | { filename: string; status: "fail_parse"; reason: string }
  | { filename: string; status: "fail_no_match"; reason: string; parsedName?: string; parsedRRN?: string; parsedYear?: string }
  | { filename: string; status: "fail_rrn_mismatch"; reason: string; parsedName: string; parsedRRN: string; candidateClients: { id: number; name: string; rrn: string | null }[] };

type Row = {
  filename: string;
  blob: Blob | null;
  result: MatchResult;
  uploadStatus: "idle" | "uploading" | "uploaded" | "skipped" | "error";
  uploadMessage?: string;
};

// 매칭은 됐지만 추가 액션이 가능한 행 (matched만 업로드 대상)
function isUploadable(r: MatchResult): r is Extract<MatchResult, { status: "matched" }> {
  return r.status === "matched";
}

const STATUS_LABEL: Record<MatchResult["status"], { label: string; tone: "ok" | "warn" | "err" }> = {
  matched: { label: "매칭", tone: "ok" },
  warning_no_drive: { label: "드라이브 미연결", tone: "err" },
  fail_parse: { label: "파일명 파싱 실패", tone: "err" },
  fail_no_match: { label: "거래처 없음", tone: "err" },
  fail_rrn_mismatch: { label: "이름/주민번호 불일치", tone: "err" },
};

export function NoticeUploadModal({ taxYear, onClose }: { taxYear: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [zipName, setZipName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setRows([]);
    setZipName("");
    setProgress({ done: 0, total: 0 });
  }, []);

  const handleZip = useCallback(
    async (file: File) => {
      reset();
      setParsing(true);
      setZipName(file.name);
      try {
        const zip = await JSZip.loadAsync(file);
        const entries: { filename: string; blob: Blob }[] = [];
        await Promise.all(
          Object.values(zip.files).map(async (entry) => {
            if (entry.dir) return;
            // 폴더 안에 들어있을 수 있으니 베이스네임만
            const baseName = entry.name.split("/").pop() || entry.name;
            if (!baseName.toLowerCase().endsWith(".pdf")) return;
            const blob = await entry.async("blob");
            entries.push({ filename: baseName, blob });
          })
        );

        if (entries.length === 0) {
          alert("ZIP 안에 PDF 파일이 없습니다.");
          setParsing(false);
          return;
        }

        // 매칭 API 호출
        const res = await fetch("/api/income-tax/notice-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: entries.map((e) => ({ filename: e.filename })), taxYear }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "매칭 실패");

        const blobByName = new Map(entries.map((e) => [e.filename, e.blob]));
        const newRows: Row[] = (data.results as MatchResult[]).map((r) => ({
          filename: r.filename,
          blob: blobByName.get(r.filename) || null,
          result: r,
          uploadStatus: "idle",
        }));
        setRows(newRows);
      } catch (err: any) {
        alert("ZIP 처리 중 오류: " + (err?.message || err));
      } finally {
        setParsing(false);
      }
    },
    [taxYear, reset]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".zip")) {
        alert("ZIP 파일을 올려주세요.");
        return;
      }
      handleZip(file);
    },
    [handleZip]
  );

  async function uploadOne(idx: number) {
    const row = rows[idx];
    if (!row || !isUploadable(row.result) || !row.blob) return;
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, uploadStatus: "uploading", uploadMessage: undefined } : r)));
    try {
      const fd = new FormData();
      fd.append("clientId", String(row.result.clientId));
      fd.append("file", row.blob, row.filename);
      const res = await fetch("/api/income-tax/notice-upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setRows((prev) =>
          prev.map((r, i) =>
            i === idx ? { ...r, uploadStatus: "error", uploadMessage: data.message || data.error || "업로드 실패" } : r
          )
        );
        return;
      }
      if (data.status === "skipped") {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, uploadStatus: "skipped", uploadMessage: data.reason } : r)));
      } else {
        setRows((prev) =>
          prev.map((r, i) => (i === idx ? { ...r, uploadStatus: "uploaded", uploadMessage: data.fileUrl } : r))
        );
      }
    } catch (err: any) {
      setRows((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, uploadStatus: "error", uploadMessage: err?.message ?? "네트워크 오류" } : r))
      );
    }
  }

  async function uploadAllMatched() {
    const targets = rows
      .map((r, i) => ({ row: r, idx: i }))
      .filter(({ row }) => isUploadable(row.result) && row.uploadStatus !== "uploaded" && row.uploadStatus !== "skipped");

    if (targets.length === 0) return;
    setBulkUploading(true);
    setProgress({ done: 0, total: targets.length });

    // 동시 5개 큐
    const concurrency = 5;
    let cursor = 0;
    let done = 0;
    async function worker() {
      while (cursor < targets.length) {
        const my = cursor++;
        const t = targets[my];
        await uploadOne(t.idx);
        done++;
        setProgress({ done, total: targets.length });
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
    setBulkUploading(false);
  }

  const matchedCount = rows.filter((r) => isUploadable(r.result)).length;
  const uploadedCount = rows.filter((r) => r.uploadStatus === "uploaded").length;
  const skippedCount = rows.filter((r) => r.uploadStatus === "skipped").length;
  const failCount = rows.filter((r) => !isUploadable(r.result)).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[6vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[920px] mx-4 bg-white rounded-2xl shadow-2xl border border-[#E5E8EB] overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-[#F2F4F6] flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#191F28]">신고도움서비스 업로드</h2>
            <p className="text-[12.5px] text-[#6B7684] mt-0.5">위멤버스에서 다운받은 ZIP을 거래처별 구글드라이브로 자동 분류</p>
          </div>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#191F28] text-2xl leading-none">×</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {rows.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
                dragOver ? "border-[#3182F6] bg-[#F5F9FF]" : "border-[#E5E8EB] hover:border-[#3182F6] bg-[#F9FAFB]"
              }`}
            >
              <div className="text-[40px] mb-2">📥</div>
              <div className="text-[15px] font-bold text-[#191F28] mb-1">ZIP 파일을 드래그하거나 클릭해서 업로드</div>
              <div className="text-[12px] text-[#8B95A1]">위멤버스 → 종합소득세 신고안내문 일괄다운로드</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleZip(f);
                  e.target.value = "";
                }}
              />
              {parsing && <div className="mt-4 text-[13px] text-[#3182F6]">분석 중...</div>}
            </div>
          ) : (
            <>
              {/* 요약 */}
              <div className="flex items-center gap-2 mb-3 flex-wrap text-[12.5px]">
                <span className="px-2.5 py-1 rounded-full bg-[#F2F4F6] text-[#6B7684]">
                  {zipName} · 총 <strong className="text-[#191F28]">{rows.length}</strong>개
                </span>
                <span className="px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#059669]">
                  매칭 <strong>{matchedCount}</strong>
                </span>
                {failCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-[#FEF2F2] text-[#DC2626]">
                    실패/경고 <strong>{failCount}</strong>
                  </span>
                )}
                {uploadedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-[#EFF6FF] text-[#1D4ED8]">
                    업로드 완료 <strong>{uploadedCount}</strong>
                  </span>
                )}
                {skippedCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-[#FFFBEB] text-[#B45309]">
                    중복 스킵 <strong>{skippedCount}</strong>
                  </span>
                )}
              </div>

              {/* 진행률 */}
              {bulkUploading && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[12px] text-[#6B7684] mb-1">
                    <span>업로드 진행 중...</span>
                    <span>
                      {progress.done} / {progress.total}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#F2F4F6] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#3182F6] transition-all"
                      style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 표 */}
              <div className="border border-[#F2F4F6] rounded-xl overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-[#F9FAFB] text-[#6B7684]">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">상태</th>
                      <th className="text-left px-3 py-2 font-medium">파일</th>
                      <th className="text-left px-3 py-2 font-medium">매칭 거래처 / 사유</th>
                      <th className="text-right px-3 py-2 font-medium w-[100px]">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const meta = STATUS_LABEL[row.result.status];
                      const r = row.result;
                      const isUp = r.status === "matched";
                      return (
                        <tr key={idx} className="border-t border-[#F2F4F6] align-top">
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                                meta.tone === "ok"
                                  ? "bg-[#ECFDF5] text-[#059669]"
                                  : meta.tone === "warn"
                                  ? "bg-[#FFFBEB] text-[#B45309]"
                                  : "bg-[#FEF2F2] text-[#DC2626]"
                              }`}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[#191F28] break-all">{row.filename}</td>
                          <td className="px-3 py-2 text-[#333D4B]">
                            {r.status === "matched" ? (
                              <div>
                                <div className="font-medium">
                                  {r.clientName}{" "}
                                  <span className="text-[#8B95A1]">({r.ceoName})</span>
                                </div>
                                {r.warning && (
                                  <div className="text-[11px] text-[#B45309] mt-0.5">⚠ {r.warning}</div>
                                )}
                              </div>
                            ) : r.status === "warning_no_drive" ? (
                              <div>
                                <div className="font-medium">
                                  {r.clientName}{" "}
                                  <span className="text-[#8B95A1]">({r.ceoName})</span>
                                </div>
                                <div className="text-[11px] text-[#DC2626] mt-0.5">{r.reason}</div>
                              </div>
                            ) : (
                              <div className="text-[#DC2626]">{r.reason}</div>
                            )}
                            {row.uploadStatus === "uploaded" && row.uploadMessage && (
                              <a
                                href={row.uploadMessage}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block mt-1 text-[11px] text-[#1D4ED8] hover:underline"
                              >
                                ↗ 드라이브에서 보기
                              </a>
                            )}
                            {row.uploadStatus === "skipped" && (
                              <div className="text-[11px] text-[#B45309] mt-1">⚠ {row.uploadMessage}</div>
                            )}
                            {row.uploadStatus === "error" && (
                              <div className="text-[11px] text-[#DC2626] mt-1">✕ {row.uploadMessage}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isUp && row.uploadStatus !== "uploaded" && row.uploadStatus !== "skipped" && (
                              <button
                                onClick={() => uploadOne(idx)}
                                disabled={row.uploadStatus === "uploading" || bulkUploading}
                                className="px-3 py-1 rounded-lg bg-[#3182F6] text-white text-[11.5px] font-medium hover:bg-[#1B64DA] disabled:opacity-50"
                              >
                                {row.uploadStatus === "uploading" ? "..." : "업로드"}
                              </button>
                            )}
                            {row.uploadStatus === "uploaded" && (
                              <span className="text-[11px] text-[#059669] font-bold">✓ 완료</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        {rows.length > 0 && (
          <div className="px-6 py-3 border-t border-[#F2F4F6] bg-[#F9FAFB] flex items-center justify-between">
            <button onClick={reset} className="text-[12.5px] text-[#6B7684] hover:text-[#191F28]">
              다른 ZIP 올리기
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-[#6B7684] hover:bg-white text-[13px] font-medium"
              >
                닫기
              </button>
              <button
                onClick={uploadAllMatched}
                disabled={bulkUploading || matchedCount === uploadedCount + skippedCount}
                className="px-4 py-2 rounded-lg bg-[#3182F6] text-white text-[13px] font-bold hover:bg-[#1B64DA] disabled:opacity-50"
              >
                {bulkUploading ? "업로드 중..." : `매칭된 ${matchedCount - uploadedCount - skippedCount}개 일괄 업로드`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
