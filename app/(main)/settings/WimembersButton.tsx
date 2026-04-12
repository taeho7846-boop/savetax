"use client";

import { useState } from "react";

export function WimembersButton() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  async function handleClick() {
    if (!confirm("기존 거래처에 위멤버스 폴더를 일괄 생성하시겠습니까?")) return;
    setLoading(true);
    setProgress("준비 중...");
    try {
      const res = await fetch("/api/drive-create-wimembers", { method: "POST" });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("스트림 없음");
      const decoder = new TextDecoder();
      let buf = "";
      let finalResult: any = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const match = line.match(/^data: (.+)$/m);
          if (!match) continue;
          const ev = JSON.parse(match[1]);
          if (ev.type === "progress") {
            setProgress(`${ev.current}/${ev.total} - ${ev.name}`);
          } else if (ev.type === "done") {
            finalResult = ev;
          }
        }
      }

      setProgress(`완료! ${finalResult.created}개 생성${finalResult.failed > 0 ? `, ${finalResult.failed}개 실패` : ""}`);
      alert(`${finalResult.created}개 거래처에 위멤버스 폴더 생성 완료!${finalResult.failed > 0 ? ` (${finalResult.failed}개 실패)` : ""}`);
    } catch (err) {
      alert("오류가 발생했습니다: " + String(err));
      setProgress("");
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
      {progress && (
        <p className="mt-2 text-xs text-gray-500">{progress}</p>
      )}
    </div>
  );
}
