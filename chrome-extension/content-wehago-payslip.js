// 위하고 급여명세서 자동 다운로드
// URL에 autoPayslip=N (N=월) 파라미터가 있으면 자동 실행

(function () {
  const hash = window.location.hash || "";
  const match = hash.match(/autoPayslip=(\d+)/);
  if (!match) return; // autoPayslip 파라미터 없으면 무시

  const targetMonth = parseInt(match[1]);

  // URL에서 정보 추출
  const yearMatch = hash.match(/yminsa=(\d{4})/);
  const nameMatch = hash.match(/companyName=([^&]+)/);
  const targetYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  const clientName = nameMatch ? decodeURIComponent(nameMatch[1]) : "거래처";

  console.log(`[SaveTax] 급여명세서 자동 다운로드 시작 - ${clientName} ${targetYear}년 ${targetMonth}월`);

  // 단계별 실행
  async function run() {
    await sleep(3000); // 페이지 로딩 대기

    // 1. 팝업 닫기 (ESC 3번)
    for (let i = 0; i < 3; i++) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
      await sleep(300);
    }
    // 실제 ESC 이벤트
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
      await sleep(300);
    }
    console.log("[SaveTax] 팝업 닫기 완료");
    await sleep(1000);

    // 2. 지급일자 버튼 클릭
    const payDateBtn = document.querySelector('.sao_head_menu > div:nth-child(4) > div:nth-child(1) > button');
    if (payDateBtn) {
      payDateBtn.click();
      console.log("[SaveTax] 지급일자 버튼 클릭");
    } else {
      console.error("[SaveTax] 지급일자 버튼을 찾을 수 없습니다");
      return;
    }
    await sleep(1500);

    // 3. 왼쪽 캔버스에서 해당 월 클릭
    const leftCanvas = document.querySelector('#Dlg13_left_grid > div > canvas');
    if (leftCanvas) {
      const rowY = 29 + (targetMonth - 1) * 28;
      clickCanvas(leftCanvas, 50, rowY);
      console.log(`[SaveTax] ${targetMonth}월 선택`);
    }
    await sleep(500);

    // 4. 오른쪽 캔버스 첫 번째 행 클릭 (지급건 선택)
    const rightCanvas = document.querySelector('#Dlg13_right_grid > div > canvas');
    if (rightCanvas) {
      clickCanvas(rightCanvas, 100, 35);
      console.log("[SaveTax] 지급건 선택");
    }
    await sleep(500);

    // 5. 실행 버튼 클릭
    const buttons = document.querySelectorAll('button');
    let executed = false;
    for (const btn of buttons) {
      if (btn.textContent.trim() === "실행") {
        btn.click();
        console.log("[SaveTax] 실행 버튼 클릭");
        executed = true;
        break;
      }
    }
    if (!executed) {
      console.error("[SaveTax] 실행 버튼을 찾을 수 없습니다");
      return;
    }
    await sleep(3000);

    // 6. F9 인쇄 미리보기
    simulateKeyPress("F9");
    console.log("[SaveTax] F9 인쇄 미리보기 - 로딩 대기 중...");
    await sleep(5000);

    // 7. background.js를 통해 서버 API 호출 → pyautogui로 저장
    console.log("[SaveTax] pyautogui 저장 요청 중...");
    chrome.runtime.sendMessage(
      {
        type: "save-payslip-pdf",
        clientName: clientName,
        year: targetYear,
        month: targetMonth,
      },
      (res) => {
        if (res?.ok) {
          console.log("[SaveTax] PDF 저장 완료:", res.path);
        } else {
          console.error("[SaveTax] PDF 저장 실패:", res?.error);
        }
      }
    );
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function clickCanvas(canvas, x, y) {
    const rect = canvas.getBoundingClientRect();
    const events = ["mousedown", "mouseup", "click"];
    for (const type of events) {
      canvas.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
        button: 0,
      }));
    }
  }

  function simulateKeyPress(key, opts = {}) {
    const keyCode = key === "F9" ? 120 : key.charCodeAt(0);
    const eventOpts = {
      key,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      ...opts,
    };
    document.dispatchEvent(new KeyboardEvent("keydown", eventOpts));
    document.dispatchEvent(new KeyboardEvent("keypress", eventOpts));
    document.dispatchEvent(new KeyboardEvent("keyup", eventOpts));
  }

  run().catch(err => console.error("[SaveTax] 오류:", err));
})();
