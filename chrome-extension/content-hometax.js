// 법인 로그인: 새 창에서 인증서 처리 + 관리번호 입력
(async function () {
  // 팝업 페이지에서만 실행 (popup.html)
  if (!window.location.href.includes("popup.html") && !window.location.href.includes("UTECMABA")) return;

  // chrome.storage에서 데이터 폴링
  let creds = null;
  for (let i = 0; i < 15; i++) {
    const storage = await chrome.storage.local.get("savetax_corp_cert");
    if (storage.savetax_corp_cert) {
      creds = storage.savetax_corp_cert;
      chrome.storage.local.remove("savetax_corp_cert");
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!creds) return;

  // suppress-alert.js(MAIN world)에 인증 정보 전달 (DOM hidden input 사용)
  console.log("SaveTax: [팝업] DOM에 인증 정보 심기");
  const el = document.createElement("div");
  el.id = "savetax-corp-creds";
  el.style.display = "none";
  el.dataset.certName = creds.certName || "";
  el.dataset.certPw = creds.certPw || "";
  el.dataset.agentNumber = creds.agentNumber || "";
  el.dataset.agentPw = creds.agentPw || "";
  document.documentElement.appendChild(el);
  console.log("SaveTax: [팝업] 인증 정보 DOM에 저장 완료");
  // suppress-alert.js가 나머지 처리

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function setInput(el, value) {
    el.focus(); el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  try {
    // 4. suppress-alert.js(MAIN world)에 인증 정보 전달
    console.log("SaveTax: [법인] MAIN world에 인증 정보 전달...");
    window.dispatchEvent(new CustomEvent("savetax_corp_creds", {
      detail: { certName: creds.certName, certPw: creds.certPw }
    }));

    // suppress-alert.js가 공동금융인증 + 인증서 전부 처리
    console.log("SaveTax: [법인] suppress-alert.js가 인증서 처리 대기중...");

    // 5. 인증서 선택 + 비밀번호 (dscert iframe)
    if (creds.certPw) {
      let certHandled = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(1000);

        const dscertFrame = document.querySelector("iframe[name='dscert']");
        if (!dscertFrame) {
          console.log("SaveTax: [법인] dscert iframe 아직 없음... (" + (attempt+1) + "/30)");
          continue;
        }

        let certDoc;
        try { certDoc = dscertFrame.contentDocument; } catch (e) { continue; }
        if (!certDoc) continue;

        // 비밀번호 필드가 있는지 확인 (iframe이 완전히 로드됐는지)
        const pwField = certDoc.querySelector("input[type='password']");
        if (!pwField) {
          console.log("SaveTax: [법인] iframe 로드중...");
          continue;
        }

        console.log("SaveTax: [법인] dscert iframe 발견! 인증서 처리 시작");

        // 하드디스크 탭
        try {
          const hdLinks = certDoc.querySelectorAll("a");
          for (const a of hdLinks) {
            if (a.textContent?.includes("하드디스크")) { a.click(); await sleep(1000); break; }
          }
        } catch (e) {}

        // 인증서 선택
        if (creds.certName) {
          await sleep(1000);
          try {
            const links = certDoc.querySelectorAll("a");
            for (const a of links) {
              if (a.textContent?.includes(creds.certName)) {
                a.click();
                console.log("SaveTax: [법인] 인증서 선택: " + creds.certName);
                await sleep(500);
                break;
              }
            }
          } catch (e) {}
        }

        // 비밀번호 입력
        pwField.focus();
        pwField.value = creds.certPw;
        pwField.dispatchEvent(new Event("input", { bubbles: true }));
        console.log("SaveTax: [법인] 인증서 비밀번호 입력");
        await sleep(300);

        // 확인 버튼
        const confirmBtn = certDoc.getElementById("btn_confirm_iframe") || certDoc.querySelector("button[id*='confirm']");
        if (confirmBtn) {
          confirmBtn.click();
          console.log("SaveTax: [법인] 인증서 확인 클릭");
        }
        certHandled = true;
        break;
      }
      if (!certHandled) console.log("SaveTax: [법인] 인증서 처리 타임아웃 (30초)");
      await sleep(3000);
    }

    // 6. 관리번호 + 비밀번호 (인증 후 원래 페이지로 돌아갈 수 있음)
    // opener(부모 창)에서 입력해야 할 수도 있으므로 localStorage에 다시 저장
    if (creds.agentNumber) {
      chrome.storage.local.set({
        savetax_corp_agent: {
          agentNumber: creds.agentNumber,
          agentPw: creds.agentPw,
        }
      });
      console.log("SaveTax: [법인] 관리번호 정보 저장, 원래 창에서 처리 대기");
    }

  } catch (e) {
    console.error("SaveTax: [법인] 인증서 처리 실패:", e);
  }
})();

// 법인 로그인: 관리번호 입력 (인증 후 원래 페이지에서)
(async function () {
  // 관리번호 필드가 나타날 때까지 폴링 (60초)
  let agentCreds = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const s = await chrome.storage.local.get("savetax_corp_agent");
    if (!s.savetax_corp_agent) continue;
    const field = document.getElementById("mf_txppWframe_input1");
    if (!field) continue;
    agentCreds = s.savetax_corp_agent;
    chrome.storage.local.remove("savetax_corp_agent");
    break;
  }
  if (!agentCreds) return;

  function setInput(el, value) {
    el.focus(); el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  try {
    console.log("SaveTax: [법인] 관리번호 입력 시작:", agentCreds.agentNumber);

    const agentInput = document.getElementById("mf_txppWframe_input1");
    if (agentInput) setInput(agentInput, agentCreds.agentNumber);

    await new Promise(r => setTimeout(r, 300));

    const pwInput = document.getElementById("mf_txppWframe_input2");
    if (pwInput) setInput(pwInput, agentCreds.agentPw);

    await new Promise(r => setTimeout(r, 300));

    // 로그인 버튼
    const loginBtn = document.getElementById("mf_txppWframe_trigger41");
    if (loginBtn) {
      loginBtn.click();
      console.log("SaveTax: [법인] 로그인 클릭");
    }
  } catch (e) {
    console.error("SaveTax: [법인] 관리번호 입력 실패:", e);
  }
})();

// 법인 로그인 완료 후 다음 액션 실행 (register/commission/recommission)
(async function () {
  const nextStorage = await chrome.storage.local.get("savetax_corp_next");
  if (!nextStorage.savetax_corp_next) return;

  // 관리번호 로그인이 완료될 때까지 대기 (세무대리인 메뉴가 보이면 완료)
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
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
  function setInput(el, value) {
    el.focus(); el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const { action, creds } = nextStorage.savetax_corp_next;
  chrome.storage.local.remove("savetax_corp_next");

  // 관리번호 로그인 완료 대기 (메뉴 버튼이 나타나면)
  try {
    await waitForId("mf_wfHeader_wq_uuid_619", 30000);
    console.log("SaveTax: [법인] 로그인 완료 확인, " + action + " 시작");
    await sleep(1500);

    if (action === "register") {
      // 메뉴 이동
      (await waitForId("mf_wfHeader_wq_uuid_619")).click();
      await sleep(200);
      (await waitForXPath("//span[@escape='false' and @label='수임 납세자 관리']")).click();
      await sleep(200);
      (await waitForXPath("//span[contains(text(),'기장대리 수임납세자 등록')]")).click();
      await sleep(1000);

      // 폼 입력
      const bizNumber = (creds.bizNumber || "").replace(/[-\s]/g, "");
      const residentNumber = (creds.residentNumber || "").replace(/[-\s]/g, "");
      const phone = (creds.phone || "").replace(/[-\s]/g, "");
      const biz1 = bizNumber.slice(0, 3), biz2 = bizNumber.slice(3, 5), biz3 = bizNumber.slice(5, 10);
      const phone1 = phone.slice(0, 3), phone2 = phone.slice(3, 7), phone3 = phone.slice(7, 11);

      if (creds.clientType === "individual") {
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
      if (creds.clientType === "individual") {
        try { (await waitForXPath("//label[@for='mf_txppWframe_infrOfrRngCd_input_0']")).click(); } catch (e) {}
      }
      console.log("SaveTax: [법인] 기장등록 입력 완료");
    }

    if (action === "commission" || action === "recommission") {
      // 메뉴 이동
      (await waitForId("mf_wfHeader_wq_uuid_619")).click();
      (await waitForXPath("//span[@escape='false' and @label='수임 납세자 관리']")).click();
      if (action === "commission") {
        (await waitForXPath("//span[contains(text(),'세무대리정보 이용 신청서(기장수임용)')]")).click();
      } else {
        (await waitForXPath("//span[contains(text(),'기장 기존해지와 신규수임')]")).click();
      }
      await sleep(2000);

      // 폼 입력
      const rn = (creds.residentNumber || "").replace(/[-\s]/g, "");
      setInput(await waitForId("mf_txppWframe_pf_UTECAAAZ07_inputCvaAplnBscClntResRgtNo1"), rn.slice(0, 6));
      setInput(await waitForId("mf_txppWframe_pf_UTECAAAZ07_inputCvaAplnBscClntResRgtNo2"), rn.slice(6));
      setInput(await waitForId("mf_txppWframe_pf_UTECAAAZ07_inputClntFnm"), creds.ceoName || "");
      await sleep(300);
      (await waitForId("mf_txppWframe_pf_UTECAAAZ07_btnClntFnmCnfr")).click();
      await sleep(1500);
      try {
        const alertEl = await waitForXPath("//input[@value='확인' and contains(@id,'btn_confirm')]", 2000);
        if (alertEl) alertEl.click();
      } catch (e) {}

      // 첨부파일 다운로드
      const filesToDownload = [
        { label: "세무대리인 신분증", url: creds.agentIdCardUrl, filename: "세무대리인_신분증.jpg" },
        { label: "대표자 신분증", url: creds.clientIdCardUrl, filename: "대표자_신분증.jpg" },
        { label: "홈택스수임신청서", url: creds.pdfUrl, filename: "홈택스수임신청서.pdf" },
      ].filter(f => f.url);
      if (filesToDownload.length > 0) {
        try {
          await chrome.runtime.sendMessage({ type: "download-files", files: filesToDownload });
        } catch (e) {}
      }
      const label = action === "commission" ? "기장수임" : "해지후수임";
      console.log("SaveTax: [법인] " + label + " 입력 완료");
    }

  } catch (e) {
    console.error("SaveTax: [법인] 다음 액션 실패:", e);
  }
})();

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

  let encoded = hash.substring(hash.indexOf("savetax=") + 8);
  if (!encoded) return;
  while (encoded.length % 4 !== 0) encoded += "=";

  let creds;
  try {
    creds = JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch (e1) {
    console.log("SaveTax: content hash 파싱1 실패:", e1.message);
    try { creds = JSON.parse(atob(encoded)); } catch (e2) { console.log("SaveTax: content hash 파싱2 실패:", e2.message); return; }
  }
  console.log("SaveTax: content mode:", creds.mode);

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
  // MODE: corp_register / corp_commission / corp_recommission
  // 법인 로그인 후 기장등록/수임/해지후수임 이어서 실행
  // ============================================================
  if (mode === "corp_register" || mode === "corp_commission" || mode === "corp_recommission") {
    try {
      if (await checkLogout()) return;

      // 로그인 후 이어서 할 작업을 chrome.storage에 저장
      const nextAction = mode.replace("corp_", ""); // register, commission, recommission
      await chrome.storage.local.set({
        savetax_corp_agent: {
          agentNumber: creds.agentNumber,
          agentPw: creds.agentPw || creds.pw,
        },
        savetax_corp_next: {
          action: nextAction,
          creds: creds,
        }
      });
      console.log("SaveTax: " + mode + " - 다음 액션 저장:", nextAction);

      // corp_login과 동일한 로그인
      await doLogin(creds.id, creds.pw);
      console.log("SaveTax: " + mode + " - 로그인 완료, 인증 후 자동 진행");

    } catch (e) {
      console.error("SaveTax " + mode + " 실패:", e);
    }
  }

  // ============================================================
  // MODE: corp_login (법인 아이디 로그인 - 인증서 + 관리번호)
  // ============================================================
  if (mode === "corp_login") {
    try {
      if (await checkLogout()) return;

      // 1. suppress-alert.js(MAIN, document_start)가 hash에서 이미 cookie 설정 완료
      // chrome.storage에 관리번호 저장 (인증 후 사용)
      await chrome.storage.local.set({
        savetax_corp_agent: {
          agentNumber: creds.agentNumber,
          agentPw: creds.agentPw || creds.pw,
        }
      });
      console.log("SaveTax: corp_login - agent 정보 storage 저장:", creds.agentNumber);

      // 2. 아이디/비밀번호 로그인
      await doLogin(creds.id, creds.pw);
      console.log("SaveTax: corp_login - 로그인 완료");

    } catch (e) {
      console.error("SaveTax 법인 로그인 실패:", e);
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

      // 4. 첨부파일 다운로드 (background에서 chrome.downloads API로 다운로드)
      const filesToDownload = [
        { label: "세무대리인 신분증", url: creds.agentIdCardUrl, filename: "세무대리인_신분증.jpg" },
        { label: "대표자 신분증", url: creds.clientIdCardUrl, filename: "대표자_신분증.jpg" },
        { label: "홈택스수임신청서", url: creds.pdfUrl, filename: "홈택스수임신청서.pdf" },
      ].filter(f => f.url);

      if (filesToDownload.length > 0) {
        try {
          const result = await chrome.runtime.sendMessage({
            type: "download-files",
            files: filesToDownload,
          });
          if (result && result.ok) {
            console.log(`SaveTax: ${result.count}개 파일 다운로드 완료`);
          } else {
            console.log("SaveTax: 파일 다운로드 실패 -", result?.error || "알 수 없는 오류");
          }
        } catch (e) {
          console.error("SaveTax: 파일 다운로드 실패:", e);
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

      // 1. 로그인 (기존 고객사 로그인과 동일)
      await doLogin(creds.id, creds.pw);

      // 주민등록번호 입력 (필요한 경우)
      const rn = (creds.rn || "").replace(/[-\s]/g, "");
      if (rn) await doJumin(rn);

      // 인증서 (설정된 경우)
      if (creds.certPw) {
        await doCert(creds.certName, creds.certPw);
      }

      await sleep(2000);
      console.log("SaveTax: 사업자등록증명 수집 시작");

      // 2. 증명·등록·신청 메뉴
      (await waitForId("mf_wfHeader_wq_uuid_379")).click();
      await sleep(200);
      (await waitForXPath("//span[@escape='false' and @label='민원증명']")).click();
      await sleep(200);
      (await waitForXPath("//span[contains(text(),'국세 민원 서류 찾기')]")).click();
      await sleep(3000);

      // 3. 사업자등록증명 → 신청하기
      console.log("SaveTax: 신청하기 클릭");
      (await waitForId("mf_txppWframe_gen_cvaInf_6_btn_apln", 15000)).click();
      await sleep(3000);

      // 4. 사업자등록번호 선택
      const bizNumber = (creds.bizNumber || "").replace(/[^0-9]/g, "");
      if (bizNumber) {
        const bizSelect = await waitForId("mf_txppWframe_pfm_UTECAAA0Z001_sbx_pfbPsenNtplBsno", 10000);
        if (bizSelect) {
          const selEl = bizSelect;
          for (let i = 0; i < selEl.options.length; i++) {
            if (selEl.options[i].text.replace(/[^0-9]/g, "").includes(bizNumber)) {
              selEl.selectedIndex = i;
              selEl.dispatchEvent(new Event("change", { bubbles: true }));
              console.log("SaveTax: 사업자번호 선택 → " + selEl.options[i].text);
              break;
            }
          }
        }
      }
      await sleep(500);

      // 5. 사용용도 → 기타
      function selectOption(selectId, optionText) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].text.includes(optionText)) {
            sel.selectedIndex = i;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            return;
          }
        }
      }

      selectOption("mf_txppWframe_sbx_cvaDcumUseUsgCd", "기타");
      await sleep(300);

      // 6. 제출처 → 기타
      selectOption("mf_txppWframe_sbx_cvaDcumSbmsOrgnClCd", "기타");
      await sleep(300);

      // 7. 수령방법 → 인터넷발급(프린터출력)
      selectOption("mf_txppWframe_pfm_UTECAAA0Z002_sbx_cvaAplnRecptMthd", "프린터출력");
      await sleep(500);

      // 8. 작성완료
      console.log("SaveTax: 작성완료 클릭");
      (await waitForId("mf_txppWframe_btn_wrtCmpl")).click();
      await sleep(3000);

      // 9. 신청하기
      console.log("SaveTax: 신청하기 클릭");
      (await waitForId("mf_txppWframe_UTECAAA0A016_wframe_btn_sbms")).click();
      await sleep(3000);

      // 10. 확인 버튼 (여러 번 시도)
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const confirmBtn = document.getElementById("mf_txppWframe_info812008528_wframe_btn_confirm");
          if (confirmBtn && confirmBtn.offsetParent !== null) {
            confirmBtn.click();
            console.log("SaveTax: 확인 클릭");
            break;
          }
        } catch (e) {}
        await sleep(1000);
      }
      await sleep(3000);

      // 11. 민원처리결과 조회
      console.log("SaveTax: 민원처리결과 조회 클릭");
      (await waitForId("mf_txppWframe_btn_cvaTrtRsltInqr")).click();
      await sleep(5000);

      // 12. 출력 버튼 (처리완료까지 대기)
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const printBtn = document.getElementById("mf_txppWframe_gen_cvaInf_0_btn_cvaDcumGranMthdNm");
          if (printBtn && printBtn.offsetParent !== null) {
            printBtn.click();
            console.log("SaveTax: 출력 클릭");
            break;
          }
        } catch (e) {}
        await sleep(1000);
      }
      await sleep(2000);

      // 13. 예 (새창)
      console.log("SaveTax: 예(새창) 클릭");
      (await waitForId("mf_txppWframe_UTECAAP0A024_wframe_btn_yes", 5000)).click();
      await sleep(5000);

      // 14. 새 창에서 PDF 다운로드
      try {
        const result = await chrome.runtime.sendMessage({
          type: "print-pdf",
          clientName: creds.clientName || "거래처",
          docName: "사업자등록증명",
        });
        if (result && result.ok) {
          console.log("SaveTax: 사업자등록증명 PDF 저장 완료");
        } else {
          console.log("SaveTax: PDF 저장 실패 - " + (result?.error || ""));
        }
      } catch (e) {
        console.log("SaveTax: PDF 저장 실패, 수동 저장 필요");
      }

      // 15. 리포트 창 닫기 (새 창이 열렸으면)
      await sleep(1000);
      try {
        const windows = await chrome.runtime.sendMessage({ type: "close-report-tab" });
      } catch (e) {}

      // 16. 홈으로 돌아가기
      await sleep(500);
      try {
        const homeBtn = document.getElementById("mf_wfHeader_hdGroup001");
        if (homeBtn) homeBtn.click();
      } catch (e) {}

      console.log("SaveTax: 사업자등록증명 수집 완료 - 다음 자료 수집 준비");

    } catch (e) {
      console.error("SaveTax 사업자등록증명 수집 실패:", e);
    }
  }

})();
