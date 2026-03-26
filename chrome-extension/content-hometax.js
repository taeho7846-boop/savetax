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

    // 인증 후 팝업 처리 - "취소" 클릭 (요소 나타나면 즉시)
    try {
      const cancelBtn = await waitForXPath("//input[contains(@id,'btn_cancel') and @value='취소']", 5000);
      if (cancelBtn) cancelBtn.click();
    } catch (e) {
      try {
        const closeBtn = await waitForXPath("//input[contains(@id,'btn_close')]", 2000);
        if (closeBtn) closeBtn.click();
      } catch (e2) {}
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
        await sleep(2000);
        window.location.href = "https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index4";
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

      // 2. 메뉴 이동 (1.5초 대기 후 시작)
      await sleep(1500);
      (await waitForId("mf_wfHeader_wq_uuid_619")).click();
      (await waitForXPath("//span[@escape='false' and @label='수임 납세자 관리']")).click();
      (await waitForXPath("//span[contains(text(),'기장대리 수임납세자 등록')]")).click();
      await sleep(500);

      // 3. 폼 입력 (요소가 나타나면 즉시 입력)
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

})();
