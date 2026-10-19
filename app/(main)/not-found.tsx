import Link from "next/link";

// 없는 주소(삭제된 옛 페이지 등)로 들어왔을 때
export default function MainNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="glass-strong w-full max-w-md rounded-[28px] p-8 text-center shadow-[0_30px_80px_-20px_rgba(15,23,42,0.25)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F3FF] text-[22px]">🔍</div>
        <h2 className="text-[18px] font-bold tracking-tight text-[#191F28]">이 주소에는 화면이 없어요</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B7684]">
          옮겨졌거나 정리된 페이지일 수 있어요. 상단 메뉴나 검색(/)으로 찾아보세요.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/dashboard" className="h-10 rounded-xl bg-[#3182F6] px-5 text-[13px] font-bold leading-10 text-white shadow-md shadow-[#3182F6]/25 transition hover:bg-[#1B64DA]">
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
