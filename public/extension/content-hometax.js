// 페이지 이동 후에도 자동화 이어서 진행
(async function () {
  const pendingData = sessionStorage.getItem("savetax_register_data");
  if (!pendingData) return;

  // 기장등록 폼 입력 이어서 진행
  sessionStorage.removeItem("savetax_register_data");
  const creds = JSON.parse(pendingData);

  function waitForId(id, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.getElementById(id);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error("Timeout: #" + id));
        setTimeout(check, 300);
      };
      check();
    });
  }
  function waitForXPath(xpath, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error("Timeout"));
        setTimeout(check, 300);
      };
      check();
    });
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function setInput(el, value) {
    el.focus(); el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  try {
    // 메뉴 이동: 세무대리·납세관리
    await sleep(2000);
    (await waitForId("mf_wfHeader_wq_uuid_619")).click();
    await sleep(1000);

    (await waitForXPath("//span[@escape='false' and @label='수임 납세자 관리']")).click();
    await sleep(1000);

    (await waitForXPath("//span[contains(text(),'기장대리 수임납세자 등록')]")).click();
    await sleep(2000);

    // 폼 입력
    const clientType = creds.clientType;
    const bizNumber = (creds.bizNumber || "").replace(/[-\s]/g, "");
    const residentNumber = (creds.residentNumber || "").replace(/[-\s]/g, "");
    const phone = (creds.phone || "").replace(/[-\s]/g, "");

    const biz1 = bizNumber.slice(0, 3), biz2 = bizNumber.slice(3, 5), biz3 = bizNumber.slice(5, 10);
    const phone1 = phone.slice(0, 3), phone2 = phone.slice(3, 7), phone3 = phone.slice(7, 11);

    if (clientType === "individual") {
      try { (await waitForXPath("//label[@for='mf_txppWframe_taPrxClntClCd_input_0']")).click(); } catch (e) {}
    } else {
      try { (await waitForXPath("//label[@for='mf_txppWframe_taPrxClntClCd_input_1']")).click(); } catch (e) {}
    }
    await sleep(500);

    setInput(await waitForId("mf_txppWframe_bsno1"), biz1);
    setInput(await waitForId("mf_txppWframe_bsno2"), biz2);
    setInput(await waitForId("mf_txppWframe_bsno3"), biz3);
    setInput(await waitForId("mf_txppWframe_resno"), residentNumber);
    setInput(await waitForId("mf_txppWframe_telno1"), phone1);
    setInput(await waitForId("mf_txppWframe_telno2"), phone2);
    setInput(await waitForId("mf_txppWframe_telno3"), phone3);

    const mpSelect = document.getElementById("mf_txppWframe_mp1");
    if (mpSelect) { mpSelect.value = phone1; mpSelect.dispatchEvent(new Event("change", { bubbles: true })); }
    setInput(await waitForId("mf_txppWframe_mp2"), phone2);
    setInput(await waitForId("mf_txppWframe_mp3"), phone3);

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setInput(await waitForId("mf_txppWframe_afaDt_input"), dateStr);

    if (clientType === "individual") {
      try { (await waitForXPath("//label[@for='mf_txppWframe_infrOfrRngCd_input_0']")).click(); } catch (e) {}
    }

    console.log("SaveTax: 기장등록 입력 완료");
  } catch (e) {
    console.error("SaveTax 기장등록 실패:", e);
  }
})();

// URL hash에서 자격증명 읽기
(async function () {
  const hash = window.location.hash;
  if (!hash.includes("savetax=")) return;

  // 인증서 처리 후 페이지 새로고침에 대비
  sessionStorage.setItem("savetax_pending", "true");

  const encoded = hash.split("savetax=")[1];
  if (!encoded) return;

  let creds;
  try {
    creds = JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    try { creds = JSON.parse(atob(encoded)); } catch { return; }
  }

  // hash 제거 (보안)
  history.replaceState(null, "", window.location.pathname + window.location.search);

  const mode = creds.mode || "login";

  // === 공통 유틸 ===
  function waitForId(id, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.getElementById(id);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error("Timeout: #" + id));
        setTimeout(check, 300);
      };
      check();
    });
  }

  function waitForXPath(xpath, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error("Timeout: " + xpath));
        setTimeout(check, 300);
      };
      check();
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function setInput(el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // 페이지 메인 환경에서 코드 실행 (콘솔과 동일)
  function pageClick(id) {
    const s = document.createElement("script");
    s.textContent = `document.getElementById("${id}")?.click();`;
    document.documentElement.appendChild(s);
    s.remove();
  }

  function pageExec(code) {
    const s = document.createElement("script");
    s.textContent = code;
    document.documentElement.appendChild(s);
    s.remove();
  }

  // === 로그아웃 체크 ===
  async function checkLogout() {
    await sleep(1500);
    const logoutBtn = document.evaluate(
      "//*[contains(text(),'로그아웃')]",
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (logoutBtn) {
      logoutBtn.click();
      await sleep(2000);
      window.location.href = window.location.pathname + window.location.search + "#savetax=" + encoded;
      return true;
    }
    return false;
  }

  // === 로그인 처리 ===
  async function doLogin(id, pw) {
    (await waitForId("mf_wfHeader_group1503")).click();
    (await waitForId("mf_txppWframe_anchor15")).click();
    await sleep(300);
    setInput(await waitForId("mf_txppWframe_iptUserId"), id);
    setInput(await waitForId("mf_txppWframe_iptUserPw"), pw);
    await sleep(200);
    (await waitForId("mf_txppWframe_anchor25")).click();

    // 권한 팝업
    try {
      const allowBtn = await waitForXPath("//*[normalize-space(text())='허용']", 2000);
      if (allowBtn) allowBtn.click();
    } catch (e) {}
  }

  // === 인증서 처리 ===
  async function doCert(certName, certPw) {
    if (!certPw) return;
    try {
      await sleep(1000);
      const iframes = document.querySelectorAll("iframe");
      let doc = null;
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument?.getElementById("input_cert_pw")) {
            doc = iframe.contentDocument;
            break;
          }
        } catch (e) {}
      }

      if (doc) {
        if (certName) {
          const certSpan = doc.evaluate(`//span[contains(@title, '${certName}')]`, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (certSpan) certSpan.click();
        } else {
          const firstCert = doc.evaluate("//span[@title and string-length(@title) > 0]", doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (firstCert) firstCert.click();
        }
        await sleep(300);

        const pwField = doc.getElementById("input_cert_pw");
        if (pwField) { pwField.focus(); pwField.value = certPw; pwField.dispatchEvent(new Event("input", { bubbles: true })); }
        await sleep(200);

        const confirmBtn = doc.getElementById("btn_confirm_iframe");
        if (confirmBtn) confirmBtn.click();
        await sleep(1000);
      } else {
        await sleep(5000);
      }
    } catch (e) {
      await sleep(3000);
    }

    // 인증 후 팝업 처리 - "취소" 클릭 (빠르게 시도)
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(300);
      // 방법1: btn_cancel
      const cancel1 = document.querySelector("input[id*='btn_cancel'][value='취소']");
      if (cancel1) { cancel1.click(); console.log("SaveTax: 취소 클릭 (btn_cancel)"); break; }
      // 방법2: 취소 버튼 (button 태그)
      const cancel2 = document.querySelector("button[id*='cancel']");
      if (cancel2) { cancel2.click(); console.log("SaveTax: 취소 클릭 (button cancel)"); break; }
      // 방법3: XPath로 취소 텍스트 찾기
      const cancel3 = document.evaluate("//input[@value='취소']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (cancel3) { cancel3.click(); console.log("SaveTax: 취소 클릭 (XPath)"); break; }
      // 방법4: 팝업 내 취소 버튼
      const cancel4 = document.evaluate("//div[contains(@class,'popup')]//input[@value='취소'] | //div[contains(@class,'alert')]//input[@value='취소']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (cancel4) { cancel4.click(); console.log("SaveTax: 취소 클릭 (popup)"); break; }
    }
  }

  // === 주민등록번호 입력 ===
  async function doJumin(rn) {
    if (!rn) return;
    const jumin1 = rn.slice(0, 6);
    const jumin2 = rn.slice(6, 7);
    try {
      await sleep(2000);
      const j1 = await waitForId("mf_txppWframe_UTXPPABC12_wframe_iptUserJuminNo1", 10000);
      setInput(j1, jumin1);
      const j2 = document.getElementById("mf_txppWframe_UTXPPABC12_wframe_iptUserJuminNo2");
      if (j2) setInput(j2, jumin2);
      const confirmBtn = document.getElementById("mf_txppWframe_UTXPPABC12_wframe_trigger46");
      if (confirmBtn) confirmBtn.click();
    } catch (e) {}
  }

  // ============================================================
  // MODE: login (기본 - 거래처 홈택스 로그인)
  // ============================================================
  if (mode === "login") {
    try {
      if (await checkLogout()) return;
      await doLogin(creds.id, creds.pw);

      const rn = (creds.rn || "").replace(/[-\s]/g, "");
      if (rn) await doJumin(rn);
      if (creds.certPw) {
        await doCert(creds.certName, creds.certPw);
      }
    } catch (e) {
      console.error("SaveTax 자동 로그인 실패:", e);
    }
  }

  // ============================================================
  // MODE: register (기장대리 수임납세자 등록)
  // ============================================================
  if (mode === "register") {
    try {
      if (await checkLogout()) return;

      // 1. 세무대리인 로그인 + 인증서
      await doLogin(creds.id, creds.pw);
      await doCert(creds.certName, creds.certPw);

      // 2. 메뉴 이동
      await sleep(1500);
      (await waitForId("mf_wfHeader_wq_uuid_619")).click();
      await sleep(200);
      (await waitForXPath("//span[@escape='false' and @label='수임 납세자 관리']")).click();
      await sleep(200);
      (await waitForXPath("//span[contains(text(),'기장대리 수임납세자 등록')]")).click();
      await sleep(1000);

      // 3. 폼 입력
      const clientType = creds.clientType;
      const bizNumber = (creds.bizNumber || "").replace(/[-\s]/g, "");
      const residentNumber = (creds.residentNumber || "").replace(/[-\s]/g, "");
      const phone = (creds.phone || "").replace(/[-\s]/g, "");

      const biz1 = bizNumber.slice(0, 3), biz2 = bizNumber.slice(3, 5), biz3 = bizNumber.slice(5, 10);
      const phone1 = phone.slice(0, 3), phone2 = phone.slice(3, 7), phone3 = phone.slice(7, 11);

      if (clientType === "individual") {
        try { (await waitForXPath("//label[@for='mf_txppWframe_taPrxClntClCd_input_0']")).click(); } catch (e) {}
      } else {
        try { (await waitForXPath("//label[@for='mf_txppWframe_taPrxClntClCd_input_1']")).click(); } catch (e) {}
      }

      setInput(await waitForId("mf_txppWframe_bsno1"), biz1);
      setInput(await waitForId("mf_txppWframe_bsno2"), biz2);
      setInput(await waitForId("mf_txppWframe_bsno3"), biz3);
      setInput(await waitForId("mf_txppWframe_resno"), residentNumber);
      setInput(await waitForId("mf_txppWframe_telno1"), phone1);
      setInput(await waitForId("mf_txppWframe_telno2"), phone2);
      setInput(await waitForId("mf_txppWframe_telno3"), phone3);

      const mpSelect = document.getElementById("mf_txppWframe_mp1");
      if (mpSelect) { mpSelect.value = phone1; mpSelect.dispatchEvent(new Event("change", { bubbles: true })); }
      setInput(await waitForId("mf_txppWframe_mp2"), phone2);
      setInput(await waitForId("mf_txppWframe_mp3"), phone3);

      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      setInput(await waitForId("mf_txppWframe_afaDt_input"), dateStr);

      if (clientType === "individual") {
        try { (await waitForXPath("//label[@for='mf_txppWframe_infrOfrRngCd_input_0']")).click(); } catch (e) {}
      }

      console.log("SaveTax: 기장등록 입력 완료 - 확인 후 등록 버튼을 눌러주세요");

    } catch (e) {
      console.error("SaveTax 기장등록 실패:", e);
    }
  }

  // ============================================================
  // MODE: commission / recommission (기장수임 / 해지후수임)
  // ============================================================
  if (mode === "commission" || mode === "recommission") {
    try {
      if (await checkLogout()) return;

      // 1. 세무대리인 로그인 + 인증서
      await doLogin(creds.id, creds.pw);
      await doCert(creds.certName, creds.certPw);

      // 2. 메뉴 이동
      await sleep(1500);
      (await waitForId("mf_wfHeader_wq_uuid_619")).click();
      (await waitForXPath("//span[@escape='false' and @label='수임 납세자 관리']")).click();
      if (mode === "commission") {
        (await waitForXPath("//span[contains(text(),'세무대리정보 이용 신청서(기장수임용)')]")).click();
      } else {
        (await waitForXPath("//span[contains(text(),'기장 기존해지와 신규수임')]")).click();
      }
      await sleep(2000);

      // 3. 폼 입력
      const rn = (creds.residentNumber || "").replace(/[-\s]/g, "");
      const jumin1 = rn.slice(0, 6);
      const jumin2 = rn.slice(6);

      setInput(await waitForId("mf_txppWframe_pf_UTECAAAZ07_inputCvaAplnBscClntResRgtNo1"), jumin1);
      setInput(await waitForId("mf_txppWframe_pf_UTECAAAZ07_inputCvaAplnBscClntResRgtNo2"), jumin2);
      setInput(await waitForId("mf_txppWframe_pf_UTECAAAZ07_inputClntFnm"), creds.ceoName || "");
      await sleep(300);

      // 확인 버튼 클릭 (알럿은 suppress-alert.js가 자동 처리)
      (await waitForId("mf_txppWframe_pf_UTECAAAZ07_btnClntFnmCnfr")).click();
      await sleep(1500);

      // 혹시 DOM 알럿이면 처리
      try {
        const alertEl = await waitForXPath("//input[@value='확인' and contains(@id,'btn_confirm')]", 2000);
        if (alertEl) alertEl.click();
      } catch (e) {}
      await sleep(500);

      // 4. 첨부파일 자동 업로드 (Debugger Protocol로 파일 다이얼로그 가로채기)
      const filesToUpload = [
        { label: "세무대리인 신분증", url: creds.agentIdCardUrl, filename: "agent-idcard.jpg" },
        { label: "대표자 신분증", url: creds.clientIdCardUrl, filename: "client-idcard.jpg" },
        { label: "홈택스수임신청서", url: creds.pdfUrl, filename: "commission-form.pdf" },
      ].filter(f => f.url);

      if (filesToUpload.length > 0) {
        console.log(`SaveTax: ${filesToUpload.length}개 파일 업로드 시작...`);
        try {
          const result = await chrome.runtime.sendMessage({
            type: "upload-files",
            files: filesToUpload,
          });
          if (result && result.ok) {
            console.log(`SaveTax: ${result.count}개 파일 업로드 완료`);
          } else {
            console.log("SaveTax: 파일 업로드 실패 -", result?.error || "알 수 없는 오류");
          }
        } catch (e) {
          console.error("SaveTax: 파일 업로드 실패:", e);
        }
      }

      const modeLabel = mode === "commission" ? "기장수임" : "해지후수임";
      console.log(`SaveTax: ${modeLabel} 입력 완료 - 확인 후 신청 버튼을 눌러주세요`);

    } catch (e) {
      console.error("SaveTax 기장수임 실패:", e);
    }
  }

  // ============================================================
  // MODE: collect_biz_cert (사업자등록증명 자동 수집)
  // ============================================================
  if (mode === "collect_biz_cert") {
    try {
      if (await checkLogout()) return;

      // 1. 로그인
      await doLogin(creds.id, creds.pw);
      await doCert(creds.certName, creds.certPw);

      await sleep(2000);

      // 2. 증명·등록·신청 메뉴
      console.log("SaveTax: 사업자등록증명 수집 시작");
      (await waitForId("mf_wfHeader_wq_uuid_379")).click();
      await sleep(500);

      // 민원증명
      (await waitForXPath("//span[@escape='false' and @label='민원증명']")).click();
      await sleep(500);

      // 국세 민원 서류 찾기
      (await waitForXPath("//span[contains(text(),'국세 민원 서류 찾기')]")).click();
      await sleep(2000);

      // 3. 사업자등록증명 → 신청하기 (6번째 항목)
      const applyBtn = await waitForId("mf_txppWframe_gen_cvaInf_6_btn_apln", 10000);
      applyBtn.click();
      await sleep(2000);

      // 4. 사업자등록번호 선택
      const bizNumber = creds.bizNumber || "";
      if (bizNumber) {
        const bizSelect = document.getElementById("mf_txppWframe_pfm_UTECAAA0Z001_sbx_pfbPsenNtplBsno");
        if (bizSelect) {
          // 매칭되는 사업자번호 찾기
          for (let i = 0; i < bizSelect.options.length; i++) {
            if (bizSelect.options[i].text.replace(/[^0-9]/g, "").includes(bizNumber.replace(/[^0-9]/g, ""))) {
              bizSelect.selectedIndex = i;
              bizSelect.dispatchEvent(new Event("change", { bubbles: true }));
              break;
            }
          }
        }
      }
      await sleep(500);

      // 5. 사용용도 → 기타
      const useSelect = document.getElementById("mf_txppWframe_sbx_cvaDcumUseUsgCd");
      if (useSelect) {
        for (let i = 0; i < useSelect.options.length; i++) {
          if (useSelect.options[i].text === "기타") { useSelect.selectedIndex = i; break; }
        }
        useSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await sleep(300);

      // 6. 제출처 → 기타
      const submitSelect = document.getElementById("mf_txppWframe_sbx_cvaDcumSbmsOrgnClCd");
      if (submitSelect) {
        for (let i = 0; i < submitSelect.options.length; i++) {
          if (submitSelect.options[i].text === "기타") { submitSelect.selectedIndex = i; break; }
        }
        submitSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await sleep(300);

      // 7. 수령방법 → 인터넷발급(프린터출력)
      const receiveSelect = document.getElementById("mf_txppWframe_pfm_UTECAAA0Z002_sbx_cvaAplnRecptMthd");
      if (receiveSelect) {
        for (let i = 0; i < receiveSelect.options.length; i++) {
          if (receiveSelect.options[i].text.includes("프린터출력")) { receiveSelect.selectedIndex = i; break; }
        }
        receiveSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await sleep(500);

      // 8. 작성완료
      (await waitForId("mf_txppWframe_btn_wrtCmpl")).click();
      await sleep(2000);

      // 9. 신청하기
      (await waitForId("mf_txppWframe_UTECAAA0A016_wframe_btn_sbms")).click();
      await sleep(2000);

      // 10. 확인 버튼
      try {
        (await waitForId("mf_txppWframe_info812008528_wframe_btn_confirm", 5000)).click();
        await sleep(2000);
      } catch (e) {}

      // 11. 민원처리결과 조회
      (await waitForId("mf_txppWframe_btn_cvaTrtRsltInqr")).click();
      await sleep(3000);

      // 12. 출력 버튼
      (await waitForId("mf_txppWframe_gen_cvaInf_0_btn_cvaDcumGranMthdNm")).click();
      await sleep(1000);

      // 13. 예 (새창)
      (await waitForId("mf_txppWframe_UTECAAP0A024_wframe_btn_yes")).click();
      await sleep(3000);

      // 14. 새 창에서 PDF 다운로드 요청 (service worker에게)
      try {
        const result = await chrome.runtime.sendMessage({
          type: "print-pdf",
          clientName: creds.clientName || "거래처",
          docName: "사업자등록증명",
        });
        if (result && result.ok) {
          console.log("SaveTax: 사업자등록증명 PDF 저장 완료");
        }
      } catch (e) {
        console.log("SaveTax: PDF 저장은 수동으로 해주세요");
      }

      console.log("SaveTax: 사업자등록증명 수집 완료");

    } catch (e) {
      console.error("SaveTax 사업자등록증명 수집 실패:", e);
    }
  }

})();
