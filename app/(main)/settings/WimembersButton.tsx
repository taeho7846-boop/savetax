"use client";

import { useState } from "react";

export function WimembersButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ total: number; created: number; failed: number } | null>(null);

  async function handleClick() {
    if (!confirm("기존 거래처에 위멤버스 폴더를 일괄 생성하시겠습니까?")) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/drive-create-wimembers", { method: "POST" });
      const data = await res.json();
      setResult({ total: data.total, created: data.created, failed: data.failed });
      if (data.failed > 0) {
        alert(`${data.created}개 생성, ${data.failed}개 실패\n${(data.errors || []).join("\n")}`);
      } else {
        alert(`${data.created}개 거래처에 위멤버스 폴더 생성 완료!`);
      }
    } catch {
      alert("오류가 발생했습니다.");
    }
    setLoading(false);
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors disabled:opacity-50"
      >
        {loading ? "생성 중..." : "위멤버스 폴더 일괄 생성"}
      </button>
      {result && (
        <p className="mt-2 text-xs text-gray-500">
          전체 {result.total}개 중 {result.created}개 생성 완료
          {result.failed > 0 && `, ${result.failed}개 실패`}
        </p>
      )}
    </div>
  );
}
