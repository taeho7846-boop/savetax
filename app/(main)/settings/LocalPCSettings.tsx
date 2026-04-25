"use client";

import { useState, useEffect } from "react";

const DRIVE_BASE_KEY = "savetax-drive-base-path";

export function LocalPCSettings() {
  const [basePath, setBasePath] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/drive-base-path")
      .then((r) => r.json())
      .then((data) => {
        const v = data.driveBasePath ?? "";
        setBasePath(v);
        if (v) localStorage.setItem(DRIVE_BASE_KEY, v);
        else localStorage.removeItem(DRIVE_BASE_KEY);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    const trimmed = basePath.trim();
    const res = await fetch("/api/settings/drive-base-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveBasePath: trimmed }),
    });
    if (res.ok) {
      if (trimmed) localStorage.setItem(DRIVE_BASE_KEY, trimmed);
      else localStorage.removeItem(DRIVE_BASE_KEY);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } else {
      alert("저장 실패");
    }
  }

  async function clear() {
    setBasePath("");
    await fetch("/api/settings/drive-base-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveBasePath: "" }),
    });
    localStorage.removeItem(DRIVE_BASE_KEY);
  }

  function testProtocol() {
    window.location.href = "savetax-app://folder?path=" + encodeURIComponent("C:\\Users");
  }

  function testDrive() {
    if (!basePath.trim()) {
      alert("먼저 기본 경로를 저장하세요");
      return;
    }
    window.location.href = "savetax-app://folder?path=" + encodeURIComponent(basePath.trim());
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] p-5">
      <h2 className="text-sm font-bold text-[#333D4B] mb-2">내 PC 연동 (로컬 설정)</h2>
      <p className="text-xs text-[#6B7684] mb-4">
        파일탐색기로 거래처 폴더 바로 열기. 이 PC에만 적용됩니다.
      </p>

      {/* Step 1: 런처 설치 */}
      <div className="border border-[#F2F4F6] rounded-[10px] p-3 mb-3 bg-[#F9FAFB]">
        <div className="text-[12px] font-bold text-[#333D4B] mb-1.5">1단계: 런처 설치 (PC당 1회)</div>
        <p className="text-[11px] text-[#6B7684] mb-2 leading-relaxed">
          아래 <strong>3개 파일</strong>을 같은 폴더에 다운받고{" "}
          <code className="px-1 py-0.5 bg-white rounded text-[10.5px]">install.bat</code> 더블클릭하면 설치됩니다.
        </p>
        <div className="flex gap-2 flex-wrap">
          <a
            href="/launcher/install.bat?v=3"
            download
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-[8px] bg-[#3182F6] text-white hover:bg-[#1B64DA] transition-colors font-bold"
          >
            ⬇ install.bat
          </a>
          <a
            href="/launcher/install.ps1?v=3"
            download
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-[8px] bg-[#3182F6] text-white hover:bg-[#1B64DA] transition-colors font-bold"
          >
            ⬇ install.ps1
          </a>
          <a
            href="/launcher/launcher.ps1?v=3"
            download
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-[8px] bg-[#3182F6] text-white hover:bg-[#1B64DA] transition-colors font-bold"
          >
            ⬇ launcher.ps1
          </a>
          <button
            type="button"
            onClick={testProtocol}
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-[8px] border border-[#E5E8EB] text-[#4E5968] hover:bg-[#F2F4F6] transition-colors"
          >
            테스트 (C:\Users 열기)
          </button>
        </div>
      </div>

      {/* Step 2: 드라이브 기본 경로 */}
      <div className="border border-[#F2F4F6] rounded-[10px] p-3">
        <div className="text-[12px] font-bold text-[#333D4B] mb-1.5">2단계: 거래처 폴더 기본 경로</div>
        <p className="text-[11px] text-[#6B7684] mb-2 leading-relaxed">
          여기 + <code className="px-1 py-0.5 bg-[#F2F4F6] rounded text-[10.5px]">\거래처명</code> 으로 폴더를 엽니다.
          <br />
          예) <code className="px-1 py-0.5 bg-[#F2F4F6] rounded text-[10.5px]">G:\공유 드라이브\고객사 관리\김태호</code>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={basePath}
            onChange={(e) => setBasePath(e.target.value)}
            placeholder="G:\공유 드라이브\고객사 관리\본인이름"
            className="flex-1 border border-[#F2F4F6] bg-[#F9FAFB] rounded-[8px] px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#3182F6]"
          />
          <button
            type="button"
            onClick={save}
            className="text-[11px] px-3 py-1.5 rounded-[8px] bg-[#3182F6] text-white hover:bg-[#1B64DA] transition-colors font-bold shrink-0"
          >
            {saved ? "저장됨 ✓" : "저장"}
          </button>
          <button
            type="button"
            onClick={testDrive}
            className="text-[11px] px-3 py-1.5 rounded-[8px] border border-[#E5E8EB] text-[#4E5968] hover:bg-[#F2F4F6] transition-colors shrink-0"
          >
            열어보기
          </button>
          {basePath && (
            <button
              type="button"
              onClick={clear}
              className="text-[11px] px-2 py-1.5 rounded-[8px] text-[#DC2626] hover:bg-[#FEF2F2] transition-colors shrink-0"
            >
              해제
            </button>
          )}
        </div>
        <p className="text-[10.5px] text-[#8B95A1] mt-2 leading-relaxed">
          저장 후 검색에서 <kbd className="px-1 py-0.5 bg-[#F2F4F6] rounded text-[10px] font-bold">/거래처명 드라이브</kbd> 누르면 웹 대신 파일탐색기로 열립니다.
          <br />
          해제하면 기존처럼 웹 구글드라이브로 동작.
        </p>
      </div>
    </div>
  );
}
