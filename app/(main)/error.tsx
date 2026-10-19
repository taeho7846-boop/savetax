"use client";

import { useEffect } from "react";
import Link from "next/link";

// 페이지 렌더 중 예외가 나면 흰 화면 대신 보이는 공용 오류 카드
export default function MainError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="glass-strong w-full max-w-md rounded-[28px] p-8 text-center shadow-[0_30px_80px_-20px_rgba(15,23,42,0.25)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FEF2F2] text-[24px] font-bold text-[#E02E2E]">!</div>
        <h2 className="text-[18px] font-bold tracking-tight text-[#191F28]">화면을 불러오지 못했어요</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B7684]">
          일시적인 문제일 수 있어요. 다시 시도해도 반복되면 오류 코드를 알려 주세요.
        </p>
        {error.digest && (
          <div className="mt-3 inline-block rounded-lg bg-[#F2F4F6] px-2.5 py-1 font-mono text-[11px] text-[#8B95A1]">{error.digest}</div>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/dashboard" className="h-10 rounded-xl bg-[#F2F4F6] px-4 text-[13px] font-bold leading-10 text-[#4E5968] transition hover:bg-[#E5E8EB]">
            홈으로
          </Link>
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-xl bg-[#3182F6] px-5 text-[13px] font-bold text-white shadow-md shadow-[#3182F6]/25 transition hover:bg-[#1B64DA]"
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}
