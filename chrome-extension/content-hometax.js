// URL hash에서 자격증명 읽기
(async function () {
  const hash = window.location.hash;
  if (!hash.includes("savetax=")) return;

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
    const loginBtn = await waitForId("mf_wfHeader_group1503");
    loginBtn.click();

    await sleep(1000);
    const idLoginTab = await waitForId("mf_txppWframe_anchor15");
    idLoginTab.click();

    await sleep(500);
    setInput(await waitForId("mf_txppWframe_iptUserId"), id);
    setInput(await waitForId("mf_txppWframe_iptUserPw"), pw);

    await sleep(300);
    (await waitForId("mf_txppWframe_anchor25")).click();

    // 권한 팝업
    await sleep(1000);
    try {
      const allowBtn = await waitForXPath("//*[normalize-space(text())='허용']", 3000);
      if (allowBtn) allowBtn.click();
    } catch (e) {}
  }

  // === 인증서 처리 ===
  async function doCert(certName, certPw) {
    if (!certPw) return;
    try {
      await sleep(3000);
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
      if (!doc) return;

      if (certName) {
        const certSpan = doc.evaluate(`//span[contains(@title, '${certName}')]`, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (certSpan) certSpan.click();
      } else {
        const firstCert = doc.evaluate("//span[@title and string-length(@title) > 0]", doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (firstCert) firstCert.click();
      }
      await sleep(500);

      const pwField = doc.getElementById("input_cert_pw");
      if (pwField) { pwField.focus(); pwField.value = certPw; pwField.dispatchEvent(new Event("input", { bubbles: true })); }
      await sleep(300);

      const confirmBtn = doc.getElementById("btn_confirm_iframe");
      if (confirmBtn) confirmBtn.click();
      await sleep(2000);

      // 인증 후 팝업 처리
      for (const xp of [
        "//input[contains(@id,'mf_txppWframe') and contains(@id,'btn_confirm') and @value='확인']",
        "//input[contains(@id,'mf_wfHeader') and contains(@id,'btn_confirm') and @value='확인']",
      ]) {
        try { const btn = await waitForXPath(xp, 5000); if (btn) btn.click(); } catch (e) {}
        await sleep(1000);
      }

      // 현행 홈택스 이용하기 (버튼이 나타날 때까지 반복 시도)
      for (let retry = 0; retry < 10; retry++) {
        await sleep(1000);
        try {
          const btn = document.getElementById("mf_wfHeader_group878");
          if (btn && btn.offsetParent !== null) {
            btn.click();
            break;
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error("SaveTax 인증서 처리 실패:", e);
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
      if (creds.certPw) await doCert(creds.certName, creds.certPw);
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

      // 1. 세무대리인 로그인
      await doLogin(creds.id, creds.pw);
      await doCert(creds.certName, creds.certPw);
      await sleep(2000);

      // 2. 메뉴 이동: 세무대리·납세관리
      const menuBtn = await waitForId("mf_wfHeader_wq_uuid_619");
      menuBtn.click();
      await sleep(1000);

      // 수임 납세자 관리
      const subMenu = await waitForXPath("//span[@escape='false' and @label='수임 납세자 관리']");
      subMenu.click();
      await sleep(1000);

      // 기장대리 수임납세자 등록
      const regMenu = await waitForXPath("//span[contains(text(),'기장대리 수임납세자 등록')]");
      regMenu.click();
      await sleep(2000);

      // 3. 폼 입력
      const clientType = creds.clientType;
      const bizNumber = (creds.bizNumber || "").replace(/[-\s]/g, "");
      const residentNumber = (creds.residentNumber || "").replace(/[-\s]/g, "");
      const phone = (creds.phone || "").replace(/[-\s]/g, "");

      const biz1 = bizNumber.slice(0, 3);
      const biz2 = bizNumber.slice(3, 5);
      const biz3 = bizNumber.slice(5, 10);
      const phone1 = phone.slice(0, 3);
      const phone2 = phone.slice(3, 7);
      const phone3 = phone.slice(7, 11);

      // 개인/법인 선택
      if (clientType === "individual") {
        try { (await waitForXPath("//label[@for='mf_txppWframe_taPrxClntClCd_input_0']")).click(); } catch (e) {}
      } else {
        try { (await waitForXPath("//label[@for='mf_txppWframe_taPrxClntClCd_input_1']")).click(); } catch (e) {}
      }
      await sleep(500);

      // 사업자등록번호
      setInput(await waitForId("mf_txppWframe_bsno1"), biz1);
      setInput(await waitForId("mf_txppWframe_bsno2"), biz2);
      setInput(await waitForId("mf_txppWframe_bsno3"), biz3);

      // 주민등록번호
      setInput(await waitForId("mf_txppWframe_resno"), residentNumber);

      // 전화번호
      setInput(await waitForId("mf_txppWframe_telno1"), phone1);
      setInput(await waitForId("mf_txppWframe_telno2"), phone2);
      setInput(await waitForId("mf_txppWframe_telno3"), phone3);

      // 휴대전화
      const mpSelect = document.getElementById("mf_txppWframe_mp1");
      if (mpSelect) {
        mpSelect.value = phone1;
        mpSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setInput(await waitForId("mf_txppWframe_mp2"), phone2);
      setInput(await waitForId("mf_txppWframe_mp3"), phone3);

      // 수임일자 (오늘)
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const dateInput = await waitForId("mf_txppWframe_afaDt_input");
      setInput(dateInput, dateStr);

      // 개인사업자: 타소득포함
      if (clientType === "individual") {
        try {
          (await waitForXPath("//label[@for='mf_txppWframe_infrOfrRngCd_input_0']")).click();
        } catch (e) {}
      }

      console.log("SaveTax: 기장등록 입력 완료 - 확인 후 등록 버튼을 눌러주세요");

    } catch (e) {
      console.error("SaveTax 기장등록 실패:", e);
    }
  }

})();
