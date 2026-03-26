"use client";

import { useRef, useState } from "react";

interface Props {
  commissionFormPath: string | null;
  agentIdCardPath: string | null;
}

function UploadSection({
  label,
  currentPath,
  uploadUrl,
  deleteUrl,
  accept,
  isImage,
}: {
  label: string;
  currentPath: string | null;
  uploadUrl: string;
  deleteUrl: string;
  accept: string;
  isImage: boolean;
}) {
  const [path, setPath] = useState<string | null>(currentPath);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");
      setPath(data.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function doDelete() {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(deleteUrl, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      setPath(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-2">{label}</label>

      {path ? (
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          {isImage ? (
            <img
              src={path}
              alt={label}
              className="max-h-40 rounded mb-2 object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-600 text-lg">📄</span>
              <a
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline truncate"
              >
                {path.split("/").pop()}
              </a>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              교체
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={uploading}
              className="text-xs px-3 py-1.5 bg-white border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-[#1a2e4a] bg-[#1a2e4a]/5"
              : "border-gray-200 hover:border-gray-400"
          } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) upload(file);
          }}
        >
          <div className="text-2xl mb-1">📁</div>
          <p className="text-sm text-gray-500">
            {uploading ? "업로드 중..." : "클릭하거나 파일을 드래그하세요"}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function SettingsUploads({ commissionFormPath, agentIdCardPath }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6">
      <h2 className="text-sm font-semibold text-gray-700">파일</h2>

      <UploadSection
        label="홈택스수임신청서 엑셀 템플릿"
        currentPath={commissionFormPath}
        uploadUrl="/api/settings/upload-commission-form"
        deleteUrl="/api/settings/upload-commission-form"
        accept=".xlsx,.xls"
        isImage={false}
      />

      <UploadSection
        label="세무대리인 신분증"
        currentPath={agentIdCardPath}
        uploadUrl="/api/settings/upload-agent-idcard"
        deleteUrl="/api/settings/upload-agent-idcard"
        accept="image/*,.pdf"
        isImage={true}
      />
    </div>
  );
}
