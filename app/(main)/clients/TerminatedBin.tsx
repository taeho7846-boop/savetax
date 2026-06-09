import Link from "next/link";

// 해지거래처 → 해지관리 페이지로 연결 (해지 체크리스트는 /termination 에서 관리)
export function TerminatedBinButton({ count }: { count: number }) {
  return (
    <Link
      href="/termination"
      className="text-sm px-3 py-2 rounded-lg border border-[#D1D6DB] text-[#6B7684] hover:bg-[#F9FAFB] transition-colors flex items-center gap-1.5"
    >
      <span>🗂</span>
      해지관리
      {count > 0 && (
        <span className="bg-[#E5E8EB] text-[#4E5968] text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {count}
        </span>
      )}
    </Link>
  );
}
