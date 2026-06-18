"use client";

import { useRef, useState } from "react";
import { FileTextIcon } from "@/components/icons";

interface Props {
  commissionFormPath: string | null;
  agentIdCardPath: string | null;
  cmsExcelPath: string | null;
  cmsExcelPersonalPath: string | null;
  cmsBulkExcelPath: string | null;
  cmsInstantExcelPath: string | null;
  pensionExcelPath: string | null;
  healthExcelPath: string | null;
  tiNormalExcelPath: string | null;
  tiBulkExcelPath: string | null;
  taxReductionExcelPath: string | null;
}

const badgeTones: Record<string, string> = {
  blue: "bg-[#EDF3FF] text-[#1B64DA]",
  violet: "bg-[#F3F0FF] text-[#7C3AED]",
};

function UploadSection({
  label,
  currentPath,
  uploadUrl,
  deleteUrl,
  accept,
  isImage,
  badge,
  badgeTone = "blue",
}: {
  label: string;
  currentPath: string | null;
  uploadUrl: string;
  deleteUrl: string;
  accept: string;
  isImage: boolean;
  badge?: string;
  badgeTone?: "blue" | "violet";
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
      <label className="flex items-center gap-1.5 text-xs text-[#6B7684] mb-2">
        {badge && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${badgeTones[badgeTone]}`}>
            {badge}
          </span>
        )}
        <span>{label}</span>
      </label>

      {path ? (
        <div className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] p-3 bg-[#F9FAFB]">
          {isImage ? (
            <img
              src={path}
              alt={label}
              className="max-h-40 rounded mb-2 object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <FileTextIcon width={18} height={18} className="text-[#16A865]" />
              <a
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#3182F6] hover:underline truncate"
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
              className="text-xs px-3 py-1.5 bg-white border border-[#D1D6DB] rounded hover:bg-[#F9FAFB] disabled:opacity-50"
            >
              교체
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={uploading}
              className="text-xs px-3 py-1.5 bg-white border border-red-300 text-[#DC2626] rounded hover:bg-[#FEF2F2] disabled:opacity-50"
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-[#3182F6] bg-[#3182F6]/5"
              : "border-[#E5E8EB] hover:border-[#8B95A1]"
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
          <p className="text-sm text-[#6B7684]">
            {uploading ? "업로드 중..." : "클릭하거나 파일을 드래그하세요"}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-[#E02E2E] mt-1">{error}</p>}

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

export default function SettingsUploads({ commissionFormPath, agentIdCardPath, cmsExcelPath, cmsExcelPersonalPath, cmsBulkExcelPath, cmsInstantExcelPath, pensionExcelPath, healthExcelPath, tiNormalExcelPath, tiBulkExcelPath, taxReductionExcelPath }: Props) {
  return (
    <div className="glass rounded-2xl p-6 space-y-6">
      <h2 className="text-sm font-bold text-[#333D4B]">파일</h2>

      <div className="grid grid-cols-2 gap-6">
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

      <div className="border-t border-[#F2F4F6] pt-4">
        <h3 className="text-xs font-bold text-[#8B95A1] mb-4">CMS</h3>

        {/* CMS 신청서 양식 — 지점용 / 개인사무소용 두 종류 */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold text-[#4E5968]">CMS 신청서 양식</span>
            <span className="text-[10.5px] text-[#B0B8C1]">거래처별 CMS 신청서 자동 생성에 사용</span>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <UploadSection
              label="세이브택스 논현지점"
              badge="지점"
              badgeTone="blue"
              currentPath={cmsExcelPath}
              uploadUrl="/api/settings/upload-cms-excel"
              deleteUrl="/api/settings/upload-cms-excel"
              accept=".xlsx,.xls"
              isImage={false}
            />
            <UploadSection
              label="개인 세무회계사무소"
              badge="개인"
              badgeTone="violet"
              currentPath={cmsExcelPersonalPath}
              uploadUrl="/api/settings/upload-cms-personal-excel"
              deleteUrl="/api/settings/upload-cms-personal-excel"
              accept=".xlsx,.xls"
              isImage={false}
            />
          </div>
        </div>

        {/* CMS 일괄등록 */}
        <div>
          <div className="text-[11px] font-semibold text-[#4E5968] mb-3">일괄등록</div>
          <div className="grid grid-cols-2 gap-6">
            <UploadSection
              label="CMS 일괄등록 엑셀"
              badge="자동이체"
              badgeTone="blue"
              currentPath={cmsBulkExcelPath}
              uploadUrl="/api/settings/upload-cms-bulk-excel"
              deleteUrl="/api/settings/upload-cms-bulk-excel"
              accept=".xlsx,.xls"
              isImage={false}
            />
            <UploadSection
              label="바로출금 일괄등록 엑셀"
              badge="바로출금"
              badgeTone="violet"
              currentPath={cmsInstantExcelPath}
              uploadUrl="/api/settings/upload-cms-instant-excel"
              deleteUrl="/api/settings/upload-cms-instant-excel"
              accept=".xlsx,.xls"
              isImage={false}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-[#F2F4F6] pt-4">
        <h3 className="text-xs font-bold text-[#8B95A1] mb-4">4대보험</h3>
        <div className="grid grid-cols-2 gap-6">
          <UploadSection
            label="국민연금 엑셀"
            currentPath={pensionExcelPath}
            uploadUrl="/api/settings/upload-pension-excel"
            deleteUrl="/api/settings/upload-pension-excel"
            accept=".xlsx,.xls"
            isImage={false}
          />
          <UploadSection
            label="건강보험 엑셀"
            currentPath={healthExcelPath}
            uploadUrl="/api/settings/upload-health-excel"
            deleteUrl="/api/settings/upload-health-excel"
            accept=".xlsx,.xls"
            isImage={false}
          />
        </div>
      </div>

      <div className="border-t border-[#F2F4F6] pt-4">
        <h3 className="text-xs font-bold text-[#8B95A1] mb-4">세금계산서</h3>
        <div className="grid grid-cols-2 gap-6">
          <UploadSection
            label="일반발행 엑셀"
            currentPath={tiNormalExcelPath}
            uploadUrl="/api/settings/upload-ti-normal"
            deleteUrl="/api/settings/upload-ti-normal"
            accept=".xlsx,.xls"
            isImage={false}
          />
          <UploadSection
            label="대량등록발행 엑셀"
            currentPath={tiBulkExcelPath}
            uploadUrl="/api/settings/upload-ti-bulk"
            deleteUrl="/api/settings/upload-ti-bulk"
            accept=".xlsx,.xls"
            isImage={false}
          />
        </div>
      </div>

      <div className="border-t border-[#F2F4F6] pt-4">
        <h3 className="text-xs font-bold text-[#8B95A1] mb-4">세액감면 판단</h3>
        <div className="grid grid-cols-2 gap-6">
          <UploadSection
            label="감면 판단 엑셀 (업종코드)"
            currentPath={taxReductionExcelPath}
            uploadUrl="/api/settings/upload-tax-reduction"
            deleteUrl="/api/settings/upload-tax-reduction"
            accept=".xlsx,.xls"
            isImage={false}
          />
        </div>
      </div>
    </div>
  );
}
