// 위하고 일용직급여자료입력 자동화
// URL에 autoDailyWorker=N (N=월) 파라미터가 있으면 자동 실행

(function () {
  const hash = window.location.hash || "";
  const match = hash.match(/autoDailyWorker=(\d+)/);
  if (!match) return;

  const targetMonth = parseInt(match[1]);
  const yearMatch = hash.match(/yminsa=(\d{4})/);
  const nameMatch = hash.match(/companyName=([^&]+)/);
  const targetYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  const clientName = nameMatch ? decodeURIComponent(nameMatch[1]) : "거래처";

  console.log(`[SaveTax] 일용직 자동 다운로드 시작 - ${clientName} ${targetYear}년 ${targetMonth}월`);

  async function run() {
    await sleep(3000);

    // 1. 팝업 닫기 (ESC)
    for (let i = 0; i < 3; i++) {
      simulateKeyPress("Escape");
      await sleep(100);
    }
    console.log("[SaveTax] 팝업 닫기 완료");
    await sleep(1000);

    // 2. 조회조건 입력: 귀속년월 클릭 → 03 (자동이동) → 202603 → Enter Enter
    const monthPadded = String(targetMonth).padStart(2, "0");
    const yearMonth = `${targetYear}${monthPadded}`;

    // 귀속년월 fake_inputbox 클릭
    const fakeInputs = document.querySelectorAll('.fake_inputbox');
    if (fakeInputs.length >= 1) {
      fakeInputs[0].click();
      await sleep(500);

      // 귀속년월 월 입력 (03 → 자동으로 지급년월로 이동)
      for (const ch of monthPadded) {
        sendKeyToActive(ch);
        await sleep(200);
      }
      await sleep(500);

      // 지급년월 입력 (202603)
      for (const ch of yearMonth) {
        sendKeyToActive(ch);
        await sleep(100);
      }
      await sleep(300);

      // Enter 2번 → 조회
      sendKeyToActive("Enter");
      await sleep(300);
      sendKeyToActive("Enter");
      await sleep(300);
    }

    console.log(`[SaveTax] ${targetMonth}월 조회 중...`);
    await sleep(3000);
    console.log("[SaveTax] 조회 완료");

    // 3. F9 인쇄 미리보기
    simulateKeyPress("F9");
    console.log("[SaveTax] F9 인쇄 미리보기");
    await sleep(5000);

    // 4. 서버 API 호출 → pyautogui로 Shift+E → 파일 저장
    console.log("[SaveTax] pyautogui 저장 요청 중...");
    chrome.runtime.sendMessage(
      {
        type: "save-daily-worker",
        clientName: clientName,
        year: targetYear,
        month: targetMonth,
      },
      (res) => {
        if (res?.ok) {
          console.log("[SaveTax] 일용직 저장 완료:", res.path);
        } else {
          console.error("[SaveTax] 저장 실패:", res?.error);
        }
      }
    );
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function simulateKeyPress(key) {
    const keyCode = key === "Escape" ? 27 : key === "Enter" ? 13 : key.charCodeAt(0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode, which: keyCode, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keypress", { key, keyCode, which: keyCode, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key, keyCode, which: keyCode, bubbles: true }));
  }

  function sendKeyToActive(key) {
    const el = document.activeElement || document;
    const keyCode = key === "Enter" ? 13 : key === "Escape" ? 27 : key === "Tab" ? 9 : key.charCodeAt(0);
    el.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode, which: keyCode, bubbles: true }));
    if (key !== "Tab") el.dispatchEvent(new KeyboardEvent("keypress", { key, keyCode, which: keyCode, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key, keyCode, which: keyCode, bubbles: true }));
  }

  run().catch(err => console.error("[SaveTax] 오류:", err));
})();
