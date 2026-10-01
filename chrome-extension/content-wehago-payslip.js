// 위하고 급여자료입력 엑셀 자동 다운로드 (Ctrl+G 엑셀 내려받기 → 서버가 급여명세서 양식으로 변환)
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

    // 6. 화면의 지급일 읽기 (엑셀에는 지급일이 없어 따로 보냄 — 예: 2026.09.30)
    const payDate = readPayDate();
    console.log("[SaveTax] 지급일:", payDate || "(못 읽음)");

    // 7. 엑셀 내려받기 (Ctrl+G) → background가 내려받은 파일을 서버로 전송 (로컬 서버 불필요)
    let since = Date.now();
    simulateKeyPress("g", { ctrlKey: true, code: "KeyG" });
    console.log("[SaveTax] Ctrl+G 엑셀 내려받기");
    let res = await uploadSalary(since, payDate);

    // Ctrl+G가 안 먹었으면 메뉴의 엑셀 내려받기 항목을 직접 클릭
    if (res?.noDownload) {
      since = Date.now();
      const collectBtn = document.querySelector('#collect');
      if (collectBtn) collectBtn.click();
      await sleep(300);
      for (const a of document.querySelectorAll('a')) {
        if (/엑셀\s*(내려받기|내보내기)/.test(a.textContent)) {
          a.click();
          console.log("[SaveTax] 엑셀 내려받기 메뉴 클릭");
          break;
        }
      }
      res = await uploadSalary(since, payDate);
    }

    if (res?.ok) {
      console.log("[SaveTax] 급여 엑셀 업로드 완료:", res.message);
      setTimeout(() => window.close(), 1000);
    } else {
      console.error("[SaveTax] 급여 엑셀 업로드 실패:", res?.error);
    }
  }

  // 조회조건의 '지급일' 라벨 바로 뒤에 나오는 날짜를 읽는다 (입력칸 값·일반 글자 모두 대상)
  function readPayDate() {
    const toDate = (t) => {
      const m = String(t || "").match(/(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/);
      return m ? `${m[1]}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}` : "";
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let afterLabel = false;
    let firstInputDate = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let text = "";
      if (node.nodeType === Node.TEXT_NODE) text = node.nodeValue;
      else if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") text = node.value;
      else continue;
      text = (text || "").trim();
      if (!text) continue;
      if (text.replace(/\s/g, "") === "지급일") { afterLabel = true; continue; }
      const d = toDate(text);
      if (!d) continue;
      if (afterLabel) return d;
      if (!firstInputDate && node.nodeType !== Node.TEXT_NODE) firstInputDate = d;
    }
    return firstInputDate;
  }

  function uploadSalary(since, payDate) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "upload-salary", clientName, year: targetYear, month: targetMonth, payDate, since, waitMs: 10000 },
        (res) => resolve(res)
      );
    });
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
    const keyCode = key === "F9" ? 120 : key.toUpperCase().charCodeAt(0);
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
