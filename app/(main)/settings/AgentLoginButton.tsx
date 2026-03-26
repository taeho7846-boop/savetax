"use client";

import { useState } from "react";

interface Props {
  agentHometaxId: string | null;
  agentHometaxPw: string | null;
  certName: string | null;
  certPassword: string | null;
}

type Status = "idle" | "loading" | "success" | "error";

export function AgentLoginButton({ agentHometaxId, agentHometaxPw, certName, certPassword }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const missing = !agentHometaxId || !agentHometaxPw;

  async function handleLogin() {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/automation/hometax-agent-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentHometaxId, agentHometaxPw, certName, certPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
        setTimeout(() => setStatus("idle"), 6000);
      } else {
        setStatus("error");
        setErrorMsg(data.error ?? "오류 발생");
      }
    } catch {
      setStatus("error");
      setErrorMsg("네트워크 오류");
    }
  }

  return (
    <div className="mb-6">
      <div className="bg-gradient-to-r from-[#1a2e4a] to-[#243d61] rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-semibold text-sm">세무대리인 홈택스 로그인</div>
            <div className="text-blue-200 text-xs mt-0.5">
              {missing
                ? "아래에서 홈택스 ID / PW를 먼저 입력하고 저장해주세요"
                : agentHometaxId}
            </div>
          </div>

          {status === "idle" && (
            <button
              onClick={handleLogin}
              disabled={missing}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                missing
                  ? "bg-white/10 text-white/30 cursor-not-allowed"
                  : "bg-white text-[#1a2e4a] hover:bg-blue-50 shadow"
              }`}
            >
              로그인 실행
            </button>
          )}

          {status === "loading" && (
            <div className="flex items-center gap-2 text-blue-200 text-sm">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              실행 중...
            </div>
          )}

          {status === "success" && (
            <div className="flex items-center gap-2 text-green-300 text-sm font-medium">
              <span>✓</span> 로그인 완료
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-red-300 text-sm font-medium">✕ 실패</span>
              {errorMsg && <span className="text-red-200 text-xs">{errorMsg}</span>}
              <button
                onClick={handleLogin}
                className="text-xs text-white/60 hover:text-white underline"
              >
                재시도
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
