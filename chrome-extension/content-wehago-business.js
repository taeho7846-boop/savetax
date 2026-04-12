// 위하고 사업소득조회 엑셀 자동 다운로드
// URL에 autoBusinessIncome=N (N=월) 파라미터가 있으면 자동 실행

(function () {
  const hash = window.location.hash || "";
  const match = hash.match(/autoBusinessIncome=(\d+)/);
  if (!match) return;

  const targetMonth = parseInt(match[1]);
  const yearMatch = hash.match(/yminsa=(\d{4})/);
  const nameMatch = hash.match(/companyName=([^&]+)/);
  const targetYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  const clientName = nameMatch ? decodeURIComponent(nameMatch[1]) : "거래처";

  console.log(`[SaveTax] 사업소득 자동 다운로드 시작 - ${clientName} ${targetYear}년 ${targetMonth}월`);

  async function run() {
    await sleep(2000); // 페이지 로딩

    // 1. ESC로 팝업 닫기
    for (let i = 0; i < 3; i++) {
      simulateKeyPress("Escape");
      await sleep(100);
    }
    console.log("[SaveTax] 팝업 닫기 완료");
    await sleep(500);

    // 2. 귀속년월 클릭 → Tab → 시작월(0X) → 종료월(0X) → Enter×3 → 조회
    const monthPadded = String(targetMonth).padStart(2, "0");
    const fakeInputs = document.querySelectorAll('.fake_inputbox');
    if (fakeInputs.length >= 1) {
      fakeInputs[0].click();
      await sleep(300);
      sendKeyToActive("Tab");
      await sleep(200);

      // 시작월
      for (const ch of monthPadded) {
        sendKeyToActive(ch);
        await sleep(150);
      }
      await sleep(300);

      // 종료월 (자동 이동됨)
      for (const ch of monthPadded) {
        sendKeyToActive(ch);
        await sleep(150);
      }
      await sleep(200);

      // Enter×3 → 조회
      for (let i = 0; i < 3; i++) {
        sendKeyToActive("Enter");
        await sleep(200);
      }
    }
    console.log("[SaveTax] 조회 중...");
    await sleep(2000); // 조회 결과 로딩
    console.log("[SaveTax] 조회 완료");

    // 3. 엑셀 내보내기 클릭
    const collectBtn = document.querySelector('#collect');
    if (collectBtn) collectBtn.click();
    await sleep(300);

    let clicked = false;
    const allLinks = document.querySelectorAll('a');
    for (const a of allLinks) {
      if (a.textContent.includes("엑셀 내보내기")) {
        let el = a;
        while (el && el !== document.body) {
          el.style.display = '';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el = el.parentElement;
        }
        await sleep(200);
        a.click();
        clicked = true;
        console.log("[SaveTax] 엑셀 내보내기 클릭");
        break;
      }
    }
    if (!clicked) {
      console.error("[SaveTax] 엑셀 내보내기를 찾을 수 없습니다");
      return;
    }
    await sleep(2000);

    // 4. 확인 팝업 닫기
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === "확인") {
        btn.click();
        console.log("[SaveTax] 확인 클릭");
        break;
      }
    }

    console.log("[SaveTax] 엑셀 다운로드 완료! 구글드라이브 업로드 요청...");

    // 5. background에 업로드 요청 (최근 다운로드 파일 찾기 + 서버 전송)
    chrome.runtime.sendMessage(
      {
        type: "upload-business-income",
        clientName: clientName,
        year: targetYear,
        month: targetMonth,
      },
      (res) => {
        if (res?.ok) {
          console.log("[SaveTax] 구글드라이브 업로드 완료:", res.message);
          // 업로드 완료 후 탭 닫기
          setTimeout(() => window.close(), 1000);
        } else {
          console.error("[SaveTax] 업로드 실패:", res?.error);
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
