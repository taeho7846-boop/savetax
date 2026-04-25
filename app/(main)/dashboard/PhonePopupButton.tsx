"use client";

export function PhonePopupButton() {
  function open() {
    // 폰 사이즈에 거의 딱 맞게 (320 + 22 frame ≈ 342, 690 + 22 + WCO header)
    const w = 350;
    const h = 740;
    const left = window.screen.availWidth - w - 40;
    const top = 80;
    window.open(
      "/phone",
      "savetax-phone",
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );
  }

  return (
    <div className="flex justify-center mb-2">
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 text-[11.5px] text-[#6B7684] hover:text-[#3182F6] hover:bg-white px-2.5 py-1 rounded-[8px] border border-[#E5E8EB] bg-[#F9FAFB] hover:border-[#3182F6] transition-colors"
        title="별도 창으로 열어 다른 작업 옆에 띄워두기"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6" />
          <path d="M10 14L21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
        팝업창으로 띄우기
      </button>
    </div>
  );
}
