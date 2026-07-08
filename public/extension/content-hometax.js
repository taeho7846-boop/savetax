// 신고서보기 '공개여부 선택' 팝업(UTERNAAZ39) 자동 처리 — 별도 팝업창에서 [적용] 클릭
// → 클릭하면 실제 신고서 리포트(clipreport.do 새창)가 뜨고 background print-pdf가 저장한다.
// 기본값 '개인정보 비공개'를 그대로 두고 적용(신고 내용은 그대로 보임, 주민번호만 마스킹).
(function autoApplyDisclosurePopup() {
  if (window !== window.top) return; // all_frames 주입 대응: top 창 전용
  if (!location.href.includes("UTERNAAZ39")) return;
  console.log("SaveTax: [팝업] 공개여부 선택 팝업 감지 — 적용 대기");
  const iv = setInterval(() => {
    const applyBtn = document.getElementById("mf_trigger1") || document.querySelector("input[value='적용']");
    if (applyBtn && applyBtn.offsetParent !== null) {
      applyBtn.click();
      console.log("SaveTax: [팝업] 공개여부 [적용] 클릭");
      clearInterval(iv);
    }
  }, 500);
  setTimeout(() => clearInterval(iv), 20000);
  return;
})();

// 신고서보기 '종합소득세 신고서 보기' 팝업(UTERNAAZ34) 자동 처리
// v4.8: 프린터 클릭(새 인쇄창) 경로 폐기. 여기서는 [일괄출력]만 클릭하고,
// PDF 추출은 background가 뷰어 프레임(sesw clipreport.do)에서 pdfDownLoad()를 직접 호출해 수행.
// 순서 보장: 초기 뷰어 프레임이 로드된 "뒤에" 일괄출력을 클릭해야, 클릭 이후 새로 로드되는
// 뷰어 프레임 = 전체 리포트(1/33)로 background가 시간 순서만으로 식별할 수 있다.
(function autoPrintReturnViewer() {
  if (window !== window.top) return; // all_frames 주입 대응: top 창 전용
  if (!location.href.includes("UTERNAAZ34")) return;
  console.log("SaveTax: [팝업] 신고서 보기 팝업 감지 — 일괄출력 대기 @ " + location.href);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function realClick(el) {
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, button: 0,
      clientX: Math.floor(r.left + r.width / 2), clientY: Math.floor(r.top + r.height / 2) };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const Ev = type.indexOf("pointer") === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ev(type, opts));
    }
  }
  function findBatchBtn() {
    const byId = document.getElementById("mf_triMatePrint") || document.querySelector("[id*='triMatePrint']");
    if (byId && byId.offsetParent !== null) return byId;
    return Array.from(document.querySelectorAll("input[type='button'], input[type='submit'], button, a"))
      .find(el => el.offsetParent !== null && ((el.value || el.textContent || "").trim() === "일괄출력")) || null;
  }
  const confirmSeen = () => document.cookie.includes("savetax_batch_ok=");
  const clearConfirmSignal = () => { document.cookie = "savetax_batch_ok=; path=/; max-age=0"; };
  async function readyCountNow() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "viewer-ready-count" });
      return (r && r.count) || 0;
    } catch (e) { return 0; }
  }

  // 클릭 사다리: 클릭 → (confirm 자동승인 쿠키 || 뷰어 프레임 신규 로드)로 발동 검증 → 실패 시 더 강한 클릭으로 재시도
  async function clickLadder(baseReadyCount) {
    let attempts = 0, verified = false, method = "";
    while (attempts < 4 && !verified) {
      attempts++;
      const btn = findBatchBtn();
      if (!btn) break;
      clearConfirmSignal();
      if (attempts % 2 === 1) {
        method = "content";
        try { btn.focus(); } catch (e) {}
        realClick(btn);
      } else {
        method = "main";
        try {
          const r = await chrome.runtime.sendMessage({ type: "batch-click-main" });
          method = "main:" + ((r && r.result) || "?");
        } catch (e) { method = "main:err"; }
      }
      // 검증: suppress-alert가 confirm 자동승인 때 심는 쿠키, 또는 뷰어 프레임 신규 로드(확인창 없는 유형 대비)
      for (let k = 0; k < 12 && !verified; k++) {
        await sleep(500);
        if (confirmSeen()) { verified = true; method += "+confirm"; break; }
        if ((await readyCountNow()) > baseReadyCount) { verified = true; method += "+frame"; break; }
      }
      console.log("SaveTax: [팝업] 일괄출력 클릭 시도 " + attempts + " (" + method + ") → "
        + (verified ? "핸들러 발동 확인" : "반응 없음"));
    }
    try { await chrome.runtime.sendMessage({ type: "batch-clicked", attempts, verified, method }); } catch (e) {}
    if (!verified) console.warn("SaveTax: [팝업] 일괄출력 핸들러 발동 미확인(" + attempts + "회) — 초기 리포트 폴백 캡처로 진행될 수 있음");
    watchAfterBatch(); // await 하지 않음 — 백그라운드 감시
  }

  // 일괄출력 후 팝업 내부 감시(240초): 떠 있는 대화상자 레이어와 iframe src를 background에 중계해
  // 캡처디버그로 노출한다(팝업 콘솔은 사용자가 못 보므로). 공개여부 레이어만 자동 [적용].
  async function watchAfterBatch() {
    const t0 = Date.now();
    let lastSent = "";
    while (Date.now() - t0 < 240000) {
      try {
        const layers = [];
        const layerEls = document.querySelectorAll("div.w2window, div[class*='w2window'], div[role='dialog'], div[class*='popup'], div[class*='layer']");
        for (const el of layerEls) {
          if (el.offsetParent === null) continue;
          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (!text) continue;
          const btns = Array.from(el.querySelectorAll("input[type='button'], input[type='submit'], button, a"))
            .filter(b => b.offsetParent !== null)
            .map(b => (b.value || b.textContent || "").trim())
            .filter(t => t && t.length <= 10).slice(0, 6);
          layers.push({ t: text.slice(0, 80), b: btns });
          // 공개여부 선택 레이어 → 자동 적용 (UTERNAAZ39 별창 처리와 동일 패턴)
          if (text.includes("공개")) {
            const applyBtn = el.querySelector("input[value='적용'], input[value='확인'], button[value='적용']");
            if (applyBtn && !applyBtn.dataset.savetaxClicked) {
              applyBtn.dataset.savetaxClicked = "true";
              applyBtn.click();
              console.log("SaveTax: [팝업] 공개여부 레이어 자동 적용");
            }
          }
          if (layers.length >= 3) break;
        }
        const frames = Array.from(document.querySelectorAll("iframe"))
          .map(f => String(f.src || "").slice(-70)).filter(s => s).slice(0, 4);
        const snap = { sec: Math.round((Date.now() - t0) / 1000), layers, frames };
        const key = JSON.stringify({ l: snap.layers, f: snap.frames });
        if (key !== lastSent) {
          lastSent = key;
          try { await chrome.runtime.sendMessage({ type: "batch-diag", snap }); } catch (e) {}
        }
      } catch (e) {}
      await sleep(5000);
    }
  }

  let started = false, ticks = 0, busy = false;
  const iv = setInterval(async () => {
    if (started || busy) return;
    busy = true;
    try {
      ticks++;
      const batchBtn = findBatchBtn();
      if (!batchBtn) {
        if (ticks % 15 === 0) console.log("SaveTax: [팝업] 일괄출력 버튼 대기중... (" + ticks + "s)");
        return;
      }
      // 초기 뷰어 프레임 로드 확인 (최대 30초 대기, 이후 강행)
      const readyCount = await readyCountNow();
      if (readyCount === 0 && ticks < 30) {
        if (ticks % 5 === 0) console.log("SaveTax: [팝업] 초기 뷰어 로드 대기중... (" + ticks + "s)");
        return;
      }
      started = true;
      clearInterval(iv);
      console.log("SaveTax: [팝업] 초기뷰어 " + readyCount + "개 확인 — 일괄출력 클릭 사다리 시작");
      await clickLadder(readyCount);
    } finally { busy = false; }
  }, 1000);
  setTimeout(() => clearInterval(iv), 300000);
})();

// ClipReport 뷰어 iframe 도우미 (all_frames 주입으로 실행)
// 뷰어 프레임 로드를 background에 보고한다(sender.tab.id/frameId 자동 포함).
// background는 "일괄출력 클릭 이후 로드된 뷰어 프레임"을 전체 리포트로 보고
// 그 프레임에서 pdfDownLoad()를 직접 호출한다.
(function clipViewerFrameHelper() {
  if (window === window.top) return; // iframe 전용
  function findPrintIcon() {
    const sel = "button[title='인쇄'], [id^='re_print'], button[class*='report_menu_print'], img[src*='print' i], a[class*='print'], button[class*='print']";
    for (const el of document.querySelectorAll(sel)) {
      if (el.offsetParent !== null && !el.disabled) return el;
    }
    return null;
  }
  let notified = false;
  const iv = setInterval(() => {
    if (notified) return;
    if (!findPrintIcon()) return; // 뷰어 UI(인쇄 버튼)가 뜬 프레임만 뷰어로 인정
    notified = true;
    clearInterval(iv);
    console.log("SaveTax: [뷰어프레임] ClipReport 뷰어 감지 @ " + location.href.slice(0, 100));
    try { chrome.runtime.sendMessage({ type: "viewer-frame-ready" }); } catch (e) {}
  }, 500);
  setTimeout(() => clearInterval(iv), 600000);
})();

// suppress-alert.js(MAIN)가 설정한 savetax_login_done 쿠키 감시 → chrome.storage로 전달
(function watchLoginDoneCookie() {
  if (window !== window.top) return; // all_frames 주입 대응: top 창 전용
  // 페이지 로드 시점에 잔존 cookie 무조건 정리 (이전 세션이 남긴 cookie가 watcher를 잘못 발동시키는 것 차단)
  // hash 유무와 관계없이 페이지마다 정리 — 진짜 시그널은 이 정리 후 IIFE A가 클릭 직전에 새로 set
  document.cookie = "savetax_login_done=; path=/; max-age=0";
  document.cookie = "savetax_agent=; path=/; max-age=0";
  console.log("SaveTax: 페이지 로드 — 잔존 시그널 cookie 정리");
  // 1초 지연 후 폴링 시작 (정리 반영 시간)
  setTimeout(() => {
    const interval = setInterval(() => {
      const match = document.cookie.match(/savetax_login_done=([^;]+)/);
      if (match) {
        clearInterval(interval);
        document.cookie = "savetax_login_done=; path=/; max-age=0";
        chrome.storage.local.set({ savetax_login_done: Date.now() });
        console.log("SaveTax: login_done 쿠키 감지 → chrome.storage 전달");
      }
    }, 500);
    setTimeout(() => clearInterval(interval), 120000);
  }, 1000);
})();

// 법인 로그인: 새 창에서 인증서 처리 + 관리번호 입력
(async function () {
  if (window !== window.top) return; // all_frames 주입 대응: top 창 전용
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
  if (window !== window.top) return; // all_frames 주입 대응: top 창 전용
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
      // storage에 완료 시그널 저장 (타임스탬프) → background.js가 onChanged로 감지
      await chrome.storage.local.set({ savetax_login_done: Date.now() });
      console.log("SaveTax: [법인] 관리번호 로그인 클릭 (background.js가 탭 처리)");
      loginBtn.click();
    }
  } catch (e) {
    console.error("SaveTax: [법인] 관리번호 입력 실패:", e);
  }
})();

// 법인 로그인 완료 후 다음 액션 실행 (register/commission/recommission)
// 트리거: corp_next + corp_reopen_done(background reopen 마커) + 세무대리 메뉴 등장
// → reopen된 새 탭에서만 진행. 같은 탭 race 차단.
(async function () {
  if (window !== window.top) return; // all_frames 주입 대응: top 창 전용
  // 1) corp_next + corp_reopen_done 폴링 (180초 — 인증서/관리번호/reopen까지 시간 여유)
  let nextData = null;
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const s = await chrome.storage.local.get(["savetax_corp_next", "savetax_corp_reopen_done"]);
    if (!s.savetax_corp_next || !s.savetax_corp_reopen_done) continue;
    nextData = s.savetax_corp_next;
    break;
  }
  if (!nextData) return;
  console.log("SaveTax: [법인] reopen_done 마커 + corp_next 발견, 메뉴 등장 대기");
  // 2) 세무대리 메뉴 등장 폴링 (페이지 안정화)
  let menuReady = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (document.getElementById("mf_wfHeader_wq_uuid_619")) {
      menuReady = true;
      break;
    }
  }
  if (!menuReady) {
    console.warn("SaveTax: [법인] 세무대리 메뉴 등장 타임아웃 (60초) — corp_next 유지하고 종료");
    return;
  }
  console.log("SaveTax: [법인] 세무대리 메뉴 감지, 페이지 안정화 완료");
  await new Promise(r => setTimeout(r, 1500));
  // 다음 액션 시작 직전에만 corp_next + reopen_done 정리 (성공 시에만)
  await chrome.storage.local.remove(["savetax_corp_next", "savetax_corp_reopen_done"]);
  console.log("SaveTax: [법인] 다음 액션 시작");

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

  const { action, creds } = nextData;
  chrome.storage.local.remove("savetax_corp_next");
  console.log("SaveTax: [법인] 다음 액션 발견:", action);

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
  if (window !== window.top) return; // all_frames 주입 대응: top 창 전용
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

// URL hash 또는 sessionStorage에서 자격증명 읽기
(async function () {
  // all_frames 주입 대응: top 창 전용.
  // 또한 window.open 팝업(신고서보기 등)은 부모의 sessionStorage(savetax_creds)를 복사 상속하므로
  // 가드가 없으면 팝업 안에서 수집 자동화가 또 실행되어 팝업 DOM을 헤집는다(v4.6에서 실제 발생).
  if (window !== window.top) return;
  if (location.pathname.includes("popup.html")) return;
  const hash = window.location.hash;
  let creds;

  if (hash.includes("savetax=")) {
    // 1. hash에서 자격증명 읽기
    sessionStorage.setItem("savetax_pending", "true");

    let encoded = hash.substring(hash.indexOf("savetax=") + 8);
    if (!encoded) return;
    while (encoded.length % 4 !== 0) encoded += "=";

    try {
      creds = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    } catch (e1) {
      console.log("SaveTax: content hash 파싱1 실패:", e1.message);
      try { creds = JSON.parse(atob(encoded)); } catch (e2) { console.log("SaveTax: content hash 파싱2 실패:", e2.message); return; }
    }

    // 다음 페이지 리로드 시 참조할 수 있도록 세션 스토리지에 백업
    sessionStorage.setItem("savetax_creds", JSON.stringify(creds));

    // hash 제거 (보안)
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } else {
    // 2. hash가 없고 세션 스토리지에 백업된 자격증명이 있는 경우
    const saved = sessionStorage.getItem("savetax_creds");
    if (saved) {
      try {
        creds = JSON.parse(saved);
      } catch (e) {
        console.error("SaveTax: 세션 스토리지 크레덴셜 파싱 실패:", e);
        return;
      }
    } else {
      return; // 둘 다 없으면 스크립트 중단
    }
  }

  console.log("SaveTax: content mode:", creds.mode);
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
      const reEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(creds)))).replace(/=/g, "");
      // 재로그인 자격증명을 hash + sessionStorage 양쪽에 남기고 확실히 리로드
      // (hash만 바꾸면 content script가 재주입되지 않아 자동화가 멈춤)
      sessionStorage.setItem("savetax_creds", JSON.stringify(creds));
      window.location.href = window.location.pathname + window.location.search + "#savetax=" + reEncoded;
      window.location.reload();
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

      // 로그인 완료 → 탭 닫고 새 탭으로 홈택스 열기
      await new Promise(r => setTimeout(r, 500));
      chrome.runtime.sendMessage({ type: "hometax-reopen" });
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

      // 사용자 통찰: corp_login의 1~4단계(ID/PW + 인증서 + 관리번호 + reopen)를 그대로 재사용하고,
      // reopen된 새 탭에서 corp_next를 보고 메뉴 진입(5단계)만 추가로 진행.
      // → 한 탭에서 인증 + 메뉴 진입을 모두 하던 race가 근본적으로 사라짐.

      // 모든 시그널 + cookie 초기화 (이전 세션 잔존 영향 차단)
      // ★ savetax_corp_reopen_done도 반드시 정리 — 안 그러면 이전 시도의 마커가 살아있어
      //   IIFE B가 인증서 단계에서 즉시 메뉴 클릭함
      await chrome.storage.local.remove(["savetax_login_done", "savetax_corp_agent", "savetax_corp_cert", "savetax_corp_reopen", "savetax_corp_reopen_done", "savetax_corp_next"]);
      document.cookie = "savetax_login_done=; path=/; max-age=0";
      document.cookie = "savetax_agent=; path=/; max-age=0";
      console.log("SaveTax: " + mode + " - 시그널 초기화 완료 (reopen_done 마커 포함)");

      // corp_login과 동일하게 agent + reopen flag 저장 + 추가로 corp_next 저장 (새 탭에서 사용)
      const nextAction = mode.replace("corp_", ""); // register | commission | recommission
      await chrome.storage.local.set({
        savetax_corp_agent: {
          agentNumber: creds.agentNumber,
          agentPw: creds.agentPw || creds.pw,
        },
        savetax_corp_reopen: true,
        savetax_corp_next: {
          action: nextAction,
          creds: creds,
        },
      });
      console.log("SaveTax: " + mode + " - corp_login 흐름 + corp_next 저장:", nextAction);

      // corp_login과 동일한 ID/PW 로그인 (인증서 / 관리번호 / reopen은 별도 IIFE + background가 처리)
      await doLogin(creds.id, creds.pw);
      console.log("SaveTax: " + mode + " - ID/PW 로그인 완료, 인증서+관리번호+reopen 후 새 탭에서 메뉴 진입");

    } catch (e) {
      console.error("SaveTax " + mode + " 실패:", e);
    }
  }

  // ============================================================
  // MODE: corp_login (법인 아이디 로그인 - 인증서 + 관리번호)
  // ============================================================
  if (mode === "corp_login") {
    try {
      // 이전 세션 시그널 초기화 (reopen_done 마커 포함)
      await chrome.storage.local.remove(["savetax_login_done", "savetax_corp_agent", "savetax_corp_cert", "savetax_corp_reopen", "savetax_corp_reopen_done", "savetax_corp_next"]);
      console.log("SaveTax: corp_login - 이전 시그널 초기화 완료");

      if (await checkLogout()) return;

      // 1. suppress-alert.js(MAIN, document_start)가 hash에서 이미 cookie 설정 완료
      // chrome.storage에 관리번호 저장 (인증 후 사용)
      await chrome.storage.local.set({
        savetax_corp_agent: {
          agentNumber: creds.agentNumber,
          agentPw: creds.agentPw || creds.pw,
        },
        savetax_corp_reopen: true,
      });
      console.log("SaveTax: corp_login - agent 정보 storage 저장:", creds.agentNumber);

      // 2. 아이디/비밀번호 로그인
      await doLogin(creds.id, creds.pw);
      console.log("SaveTax: corp_login - 로그인 완료");

      // 관리번호 로그인 완료 후 reopen은 관리번호 입력 코드에서 처리
      console.log("SaveTax: corp_login - ID/PW 로그인 완료, 인증서+관리번호는 페이지 리로드 후 처리");

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
      //    앱에 bizNumber가 있으면 매칭, 없거나 매칭 실패하면 '-선택-' 제외 첫 실제 사업자번호 자동 선택.
      //    (개인이라 앱에 사업자번호 미등록이어도 홈택스 계정 목록에서 자동 선택)
      const bizNumber = (creds.bizNumber || "").replace(/[^0-9]/g, "");
      {
        const bizSelect = await waitForId("mf_txppWframe_pfm_UTECAAA0Z001_sbx_pfbPsenNtplBsno", 10000);
        if (bizSelect) {
          // 옵션(사업자번호 목록)이 비동기로 채워질 때까지 대기
          for (let w = 0; w < 20 && bizSelect.options.length <= 1; w++) await sleep(500);
          let picked = false;
          if (bizNumber) {
            for (let i = 0; i < bizSelect.options.length; i++) {
              if (bizSelect.options[i].text.replace(/[^0-9]/g, "").includes(bizNumber)) {
                bizSelect.selectedIndex = i; picked = true;
                console.log("SaveTax: 사업자번호 선택(매칭) → " + bizSelect.options[i].text);
                break;
              }
            }
          }
          if (!picked) {
            for (let i = 0; i < bizSelect.options.length; i++) {
              const v = bizSelect.options[i].value;
              const t = bizSelect.options[i].text || "";
              if (v && v !== "" && !/선택/.test(t)) {
                bizSelect.selectedIndex = i; picked = true;
                console.log("SaveTax: 사업자번호 자동 선택(첫 항목) → " + t);
                break;
              }
            }
          }
          if (picked) bizSelect.dispatchEvent(new Event("change", { bubbles: true }));
          else console.log("SaveTax: 사업자번호 목록이 비어 있음 — 발급 불가(비사업자 가능성)");
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

      // 14. 새 창에서 PDF 다운로드 (+앱 서버 업로드)
      try {
        const result = await chrome.runtime.sendMessage({
          type: "print-pdf",
          clientName: creds.clientName || "거래처",
          docName: "사업자등록증명",
          upload: (creds.clientId && creds.appOrigin) ? {
            appOrigin: creds.appOrigin,
            token: creds.token || "",
            clientId: creds.clientId,
            docType: creds.docType || "사업자등록증명원",
            taxYear: String(creds.taxYear || ""),
            fileName: "사업자등록증명.pdf",
          } : null,
        });
        if (result && result.ok) {
          console.log("SaveTax: 사업자등록증명 PDF 저장 완료");
          // 앱에 완료 상태 보고
          if (creds.clientId && creds.appOrigin) {
            try {
              await chrome.runtime.sendMessage({
                type: "mark-collected",
                appOrigin: creds.appOrigin,
                token: creds.token || "",
                clientId: creds.clientId,
                docType: creds.docType || "사업자등록증명원",
                taxYear: String(creds.taxYear || ""),
              });
            } catch (e) {}
          }
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

  // ============================================================
  // MODE: collect_income_help (종합소득세 신고도움 서비스 자동 수집)
  // ============================================================
  if (mode === "collect_income_help") {
    try {
      // 세션 스토리지를 사용하여 페이지 리로드 간의 진행 상태를 식별 (checkLogout()에 의한 자동 로그아웃 루프 방지)
      if (!sessionStorage.getItem("savetax_running")) {
        if (await checkLogout()) return;

        // 1. 로그인
        await doLogin(creds.id, creds.pw);

        // 주민등록번호 입력 (필요한 경우)
        const rn = (creds.rn || "").replace(/[-\s]/g, "");
        if (rn) await doJumin(rn);

        // 인증서 (설정된 경우)
        if (creds.certPw) {
          await doCert(creds.certName, creds.certPw);
        }

        // 로그인 성공 플래그 설정 및 index4로 다이렉트 이동
        sessionStorage.setItem("savetax_running", "true");
        await sleep(2000);
        window.location.href = "https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=40&tm2lIdx=4021010000&tm3lIdx=4021010200";
        return;
      }

      console.log("SaveTax: 종합소득세 신고도움 서비스 페이지 진입 완료");
      await sleep(2000);

      const startYear = parseInt(creds.startYear) || 2025;
      const endYear = parseInt(creds.endYear) || 2025;

      // 귀속년도 셀렉트 박스 대기
      const sel = await waitForId("mf_txppWframe_selectTxyr", 15000);
      if (!sel) throw new Error("년도 선택 셀렉트 박스를 찾을 수 없습니다.");

      // 사용 가능한 년도 목록 확인
      const availableYears = [];
      for (let i = 0; i < sel.options.length; i++) {
        availableYears.push(sel.options[i].text.trim());
      }
      console.log("SaveTax: 사용 가능한 년도 목록 ->", availableYears);

      let collectedCount = 0;
      for (let year = startYear; year <= endYear; year++) {
        const yearStr = String(year);
        if (!availableYears.includes(yearStr)) {
          console.log(`SaveTax: ${yearStr}년은 조회 가능한 옵션에 없음, 패스`);
          continue;
        }

        try {
        console.log(`SaveTax: ${yearStr}년 선택 중...`);
        sel.value = yearStr;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(1000);

        // 조회 버튼 클릭
        const searchBtn = await waitForId("mf_txppWframe_trigger21", 5000);
        if (searchBtn) {
          searchBtn.click();
          console.log(`SaveTax: ${yearStr}년 조회 클릭`);
          await sleep(4000);
        }

        // 미리보기 버튼 클릭
        const previewBtn = await waitForId("mf_txppWframe_trigger1", 5000);
        if (previewBtn) {
          previewBtn.click();
          console.log(`SaveTax: ${yearStr}년 미리보기 클릭`);
          await sleep(5000);
        }

        // 새 창(리포트 탭)에서 PDF 다운로드 요청 (+앱 서버 업로드)
        try {
          const result = await chrome.runtime.sendMessage({
            type: "print-pdf",
            clientName: creds.clientName || "거래처",
            docName: `종합소득세_신고도움서비스_${yearStr}년`,
            upload: (creds.clientId && creds.appOrigin) ? {
              appOrigin: creds.appOrigin,
              token: creds.token || "",
              clientId: creds.clientId,
              docType: creds.docType || "종합소득세_신고도움",
              taxYear: String(creds.taxYear || ""),
              fileName: `종합소득세_신고도움서비스_${yearStr}년.pdf`,
            } : null,
          });
          if (result && result.ok) {
            collectedCount++;
            console.log(`SaveTax: ${yearStr}년 PDF 저장 성공`);
          } else {
            console.error(`SaveTax: ${yearStr}년 PDF 저장 실패 - ` + (result?.error || ""));
          }
        } catch (e) {
          console.error(`SaveTax: ${yearStr}년 PDF 다운로드 메시지 전송 실패:`, e);
        }

        // 리포트 탭 닫기
        await sleep(1000);
        try {
          await chrome.runtime.sendMessage({ type: "close-report-tab" });
        } catch (e) {}
        await sleep(1500);
        } catch (e) {
          // 한 연도 실패(버튼 미발견 등)해도 다음 연도 계속 진행
          console.error(`SaveTax: ${yearStr}년 수집 실패 -`, e.message);
        }
      }

      // 수집 성공 시 앱에 완료 상태 보고 (background가 세션 쿠키 포함 fetch)
      if (collectedCount > 0 && creds.clientId && creds.appOrigin) {
        try {
          const markResult = await chrome.runtime.sendMessage({
            type: "mark-collected",
            appOrigin: creds.appOrigin,
            token: creds.token || "",
            clientId: creds.clientId,
            docType: creds.docType || "종합소득세_신고도움",
            taxYear: String(creds.taxYear || startYear),
            params: { startYear: String(startYear), endYear: String(endYear) },
          });
          console.log("SaveTax: 앱 수집 상태 갱신 ->", JSON.stringify(markResult));
        } catch (e) {
          console.error("SaveTax: 앱 수집 상태 갱신 실패:", e);
        }
      }

      // 완료 후 세션 플래그 해제 및 홈으로 이동
      sessionStorage.removeItem("savetax_running");
      sessionStorage.removeItem("savetax_creds");
      console.log(`SaveTax: 종합소득세 신고도움 서비스 PDF ${collectedCount}건 수집 완료`);

      // 홈 버튼 클릭
      const homeBtn = document.getElementById("mf_wfHeader_hdGroup001");
      if (homeBtn) homeBtn.click();

    } catch (e) {
      sessionStorage.removeItem("savetax_running");
      sessionStorage.removeItem("savetax_creds");
      console.error("SaveTax 종합소득세 신고도움 서비스 수집 실패:", e);
    }
  }


  // ============================================================
  // 민원증명 계열 공통 유틸 (과세표준증명 / 납부내역증명)
  //  - doLogin/doJumin/doCert/waitForId/waitForXPath/sleep/setInput/checkLogout
  //    및 print-pdf / mark-collected 메시지는 이미 이 IIFE 스코프에 존재하므로 그대로 사용
  // ============================================================
  function mc_selectByEl(sel, optionText) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].text.includes(optionText)) {
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // 요소 주변(연결 label + 조상 3단계) 텍스트 — 필드 라벨 매칭용
  function mc_nearbyText(el) {
    let t = "";
    if (el.id) {
      const lab = document.querySelector("label[for='" + el.id + "']");
      if (lab) t += " " + lab.textContent;
    }
    let node = el.parentElement;
    for (let i = 0; i < 3 && node; i++) { t += " " + (node.textContent || ""); node = node.parentElement; }
    return t.replace(/\s+/g, " ");
  }

  // ID 후보 우선 → 실패 시 라벨 근접 텍스트로 select 값 지정
  function mc_selectRobust(idCandidates, labelTexts, optionText) {
    for (const id of idCandidates) {
      const sel = document.getElementById(id);
      if (sel && mc_selectByEl(sel, optionText)) { console.log("SaveTax: select(id " + id + ") -> " + optionText); return true; }
    }
    const selects = Array.from(document.querySelectorAll("select")).filter(s => s.offsetParent !== null);
    for (const lt of labelTexts) {
      for (const sel of selects) {
        if (mc_nearbyText(sel).includes(lt) && mc_selectByEl(sel, optionText)) { console.log("SaveTax: select(label " + lt + ") -> " + optionText); return true; }
      }
    }
    console.log("SaveTax: select 실패 -> " + optionText + " (라벨:" + labelTexts.join("/") + ") 수동 확인 필요");
    return false;
  }

  // ID 우선, 없으면 텍스트로 버튼/앵커 클릭 (동적 팝업 대비)
  async function mc_clickByIdOrText(id, texts, timeout) {
    const deadline = Date.now() + (timeout || 10000);
    while (Date.now() < deadline) {
      if (id) { const el = document.getElementById(id); if (el && el.offsetParent !== null) { el.click(); return true; } }
      for (const t of texts) {
        const el = document.evaluate(
          "//a[normalize-space(.)='" + t + "'] | //input[@value='" + t + "'] | //button[normalize-space(.)='" + t + "'] | //span[normalize-space(.)='" + t + "']",
          document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (el && el.offsetParent !== null) { el.click(); return true; }
      }
      await sleep(400);
    }
    return false;
  }

  // 국세 민원 서류 찾기 목록에서 서류명으로 신청하기 버튼 탐색 (biz cert의 고정 index 대체)
  async function mc_findApplyButton(names, timeout) {
    const norm = s => (s || "").replace(/\s/g, "");
    const targets = names.map(norm).filter(Boolean);
    const deadline = Date.now() + (timeout || 15000);
    while (Date.now() < deadline) {
      // 전략1: 생성된 반복 그룹 gen_cvaInf_N 의 btn_apln 순회 + 조상 텍스트 매칭
      for (let n = 0; n < 80; n++) {
        const btn = document.getElementById("mf_txppWframe_gen_cvaInf_" + n + "_btn_apln");
        if (!btn) continue;
        let node = btn.parentElement;
        for (let up = 0; up < 6 && node; up++) {
          const txt = norm(node.textContent);
          if (targets.some(t => txt.includes(t))) { console.log("SaveTax: 신청하기 버튼 발견(gen_cvaInf_" + n + ")"); return btn; }
          node = node.parentElement;
        }
      }
      // 전략2: 서류명 텍스트 노드 → 가장 가까운 신청하기 버튼
      for (const nm of names) {
        const el = document.evaluate("//*[contains(normalize-space(text()),'" + nm + "')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (el) {
          let node = el;
          for (let up = 0; up < 8 && node; up++) {
            const b = node.querySelector && node.querySelector("[id*='btn_apln'], a[id*='_apln'], input[value='신청하기']");
            if (b) { console.log("SaveTax: 신청하기 버튼 발견(텍스트 '" + nm + "')"); return b; }
            node = node.parentElement;
          }
        }
      }
      await sleep(500);
    }
    return null;
  }

  async function mc_gotoMinwonList() {
    (await waitForId("mf_wfHeader_wq_uuid_379")).click();
    await sleep(200);
    (await waitForXPath("//span[@escape='false' and @label='민원증명']")).click();
    await sleep(200);
    (await waitForXPath("//span[contains(text(),'국세 민원 서류 찾기')]")).click();
    await sleep(3000);
  }

  function mc_selectBizNumber() {
    const bizNumber = (creds.bizNumber || "").replace(/[^0-9]/g, "");
    if (!bizNumber) return;
    let bizSelect = document.getElementById("mf_txppWframe_pfm_UTECAAA0Z001_sbx_pfbPsenNtplBsno");
    if (!bizSelect) {
      bizSelect = Array.from(document.querySelectorAll("select"))
        .find(s => s.offsetParent !== null && Array.from(s.options).some(o => o.text.replace(/[^0-9]/g, "").includes(bizNumber)));
    }
    if (bizSelect) {
      for (let i = 0; i < bizSelect.options.length; i++) {
        if (bizSelect.options[i].text.replace(/[^0-9]/g, "").includes(bizNumber)) {
          bizSelect.selectedIndex = i;
          bizSelect.dispatchEvent(new Event("change", { bubbles: true }));
          console.log("SaveTax: 사업자번호 선택 -> " + bizSelect.options[i].text);
          break;
        }
      }
    }
  }

  // 민원증명 공통 select (사용용도/제출처/수령방법) — ID 우선 + 라벨 폴백
  function mc_commonSelects() {
    mc_selectRobust(["mf_txppWframe_sbx_cvaDcumUseUsgCd"], ["사용용도", "용도"], "기타");
    mc_selectRobust(["mf_txppWframe_sbx_cvaDcumSbmsOrgnClCd"], ["제출처"], "기타");
    mc_selectRobust(["mf_txppWframe_pfm_UTECAAA0Z002_sbx_cvaAplnRecptMthd", "mf_txppWframe_sbx_cvaAplnRecptMthd"], ["수령방법", "수령", "발급"], "프린터출력");
  }

  // 작성완료 → 신청 → 확인 → 민원처리결과조회 → 출력 → 예(새창) → print-pdf + mark-collected
  async function mc_finishAndPrint(docName, docType) {
    await mc_clickByIdOrText("mf_txppWframe_btn_wrtCmpl", ["작성완료"], 10000);
    await sleep(3000);
    await mc_clickByIdOrText(null, ["신청하기"], 8000);
    await sleep(3000);
    for (let attempt = 0; attempt < 6; attempt++) {
      if (await mc_clickByIdOrText(null, ["확인"], 1200)) { console.log("SaveTax: 확인 클릭"); break; }
      await sleep(800);
    }
    await sleep(3000);
    await mc_clickByIdOrText("mf_txppWframe_btn_cvaTrtRsltInqr", ["민원처리결과조회", "민원처리결과 조회", "처리결과조회"], 10000);
    await sleep(5000);
    // 출력 (처리완료까지 대기) — biz cert의 gen_cvaInf_0 출력 ID 1순위, 텍스트 폴백
    for (let attempt = 0; attempt < 12; attempt++) {
      const printBtn = document.getElementById("mf_txppWframe_gen_cvaInf_0_btn_cvaDcumGranMthdNm");
      if (printBtn && printBtn.offsetParent !== null) { printBtn.click(); console.log("SaveTax: 출력 클릭"); break; }
      if (await mc_clickByIdOrText(null, ["출력"], 800)) { console.log("SaveTax: 출력 클릭(텍스트)"); break; }
      await sleep(1000);
    }
    await sleep(2000);
    await mc_clickByIdOrText(null, ["예"], 5000);
    await sleep(5000);
    // 새 창(clipreport.do) PDF 저장 + 앱 업로드
    try {
      const result = await chrome.runtime.sendMessage({
        type: "print-pdf",
        clientName: creds.clientName || "거래처",
        docName: docName,
        upload: (creds.clientId && creds.appOrigin) ? {
          appOrigin: creds.appOrigin,
          token: creds.token || "",
          clientId: creds.clientId,
          docType: creds.docType || docType,
          taxYear: String(creds.taxYear || ""),
          fileName: docName + ".pdf",
        } : null,
      });
      if (result && result.ok) {
        console.log("SaveTax: " + docName + " PDF 저장 완료");
        if (creds.clientId && creds.appOrigin) {
          try {
            await chrome.runtime.sendMessage({
              type: "mark-collected",
              appOrigin: creds.appOrigin,
              token: creds.token || "",
              clientId: creds.clientId,
              docType: creds.docType || docType,
              taxYear: String(creds.taxYear || ""),
            });
          } catch (e) {}
        }
      } else {
        console.log("SaveTax: PDF 저장 실패 - " + (result?.error || ""));
      }
    } catch (e) {
      console.log("SaveTax: PDF 저장 실패, 수동 저장 필요");
    }
    await sleep(1000);
    try { await chrome.runtime.sendMessage({ type: "close-report-tab" }); } catch (e) {}
    await sleep(500);
    try { const homeBtn = document.getElementById("mf_wfHeader_hdGroup001"); if (homeBtn) homeBtn.click(); } catch (e) {}
  }

  // ============================================================
  // MODE: collect_vat_cert (부가가치세 과세표준증명 자동 수집)
  // ============================================================
  if (mode === "collect_vat_cert") {
    try {
      if (await checkLogout()) return;
      await doLogin(creds.id, creds.pw);
      const rn = (creds.rn || "").replace(/[-\s]/g, "");
      if (rn) await doJumin(rn);
      if (creds.certPw) await doCert(creds.certName, creds.certPw);
      await sleep(2000);
      console.log("SaveTax: 부가가치세 과세표준증명 수집 시작");

      await mc_gotoMinwonList();

      const applyBtn = await mc_findApplyButton(["부가가치세과세표준증명", "부가가치세 과세표준증명", "과세표준증명"], 15000);
      if (!applyBtn) throw new Error("과세표준증명 신청하기 버튼을 찾지 못했습니다.");
      applyBtn.click();
      await sleep(3000);

      mc_selectBizNumber();
      await sleep(500);

      // 과세기간(연도+기수) 입력 — 필드 ID 미확인, 라벨/근접텍스트 기반 best-effort
      const sy = parseInt(creds.startYear) || new Date().getFullYear();
      const ey = parseInt(creds.endYear) || sy;
      const sp = String(creds.startPeriod || "1");
      const ep = String(creds.endPeriod || "2");
      try {
        const yearInputs = Array.from(document.querySelectorAll("input[type='text'], input[type='number']"))
          .filter(el => el.offsetParent !== null && /과세|기간|년|연도/.test(mc_nearbyText(el)));
        const periodSelects = Array.from(document.querySelectorAll("select"))
          .filter(el => el.offsetParent !== null && Array.from(el.options).some(o => /1기|2기|제1기|제2기/.test(o.text)));
        if (yearInputs[0]) setInput(yearInputs[0], String(sy));
        if (yearInputs[1]) setInput(yearInputs[1], String(ey));
        if (periodSelects[0]) mc_selectByEl(periodSelects[0], sp === "2" ? "2기" : "1기");
        if (periodSelects[1]) mc_selectByEl(periodSelects[1], ep === "2" ? "2기" : "1기");
        console.log("SaveTax: 과세기간 입력 시도 " + sy + "-" + sp + "기 ~ " + ey + "-" + ep + "기 (연도input " + yearInputs.length + "개, 기수select " + periodSelects.length + "개)");
      } catch (e) { console.log("SaveTax: 과세기간 입력 실패(수동 확인 필요):", e.message); }
      await sleep(500);

      mc_commonSelects();
      await sleep(500);

      await mc_finishAndPrint("부가가치세과세표준증명", "부가가치세_과세표준증명");
      console.log("SaveTax: 부가가치세 과세표준증명 수집 완료");
    } catch (e) {
      console.error("SaveTax 부가가치세 과세표준증명 수집 실패:", e);
    }
  }

  // ============================================================
  // MODE: collect_payment_cert (납부내역증명(납세사실증명) 자동 수집)
  // ============================================================
  if (mode === "collect_payment_cert") {
    try {
      if (await checkLogout()) return;
      await doLogin(creds.id, creds.pw);
      const rn = (creds.rn || "").replace(/[-\s]/g, "");
      if (rn) await doJumin(rn);
      if (creds.certPw) await doCert(creds.certName, creds.certPw);
      await sleep(2000);
      console.log("SaveTax: 납부내역증명 수집 시작");

      await mc_gotoMinwonList();

      const applyBtn = await mc_findApplyButton(["납부내역증명", "납세사실증명", "납부내역"], 15000);
      if (!applyBtn) throw new Error("납부내역증명 신청하기 버튼을 찾지 못했습니다.");
      applyBtn.click();
      await sleep(3000);

      mc_selectBizNumber();
      await sleep(500);

      // 조회기간(시작일~종료일) 입력 — 필드 ID 미확인, best-effort (포맷은 YYYY-MM-DD 그대로 시도)
      const startDate = String(creds.startDate || "");
      const endDate = String(creds.endDate || "");
      try {
        const dateInputs = Array.from(document.querySelectorAll("input"))
          .filter(el => el.offsetParent !== null && (el.type === "text" || el.type === "") &&
            (Number(el.maxLength) === 10 || Number(el.maxLength) === 8 ||
             /\d{4}[-.]?\d{2}[-.]?\d{2}/.test(el.value) ||
             /기간|일자|조회|납부|시작|종료|년월일/.test(mc_nearbyText(el))));
        if (startDate && dateInputs[0]) setInput(dateInputs[0], startDate);
        if (endDate && dateInputs[1]) setInput(dateInputs[1], endDate);
        console.log("SaveTax: 조회기간 입력 시도 " + startDate + " ~ " + endDate + " (date input 후보 " + dateInputs.length + "개)");
      } catch (e) { console.log("SaveTax: 조회기간 입력 실패(수동 확인 필요):", e.message); }
      await sleep(500);

      mc_commonSelects();
      await sleep(500);

      await mc_finishAndPrint("납부내역증명", "납부내역증명");
      console.log("SaveTax: 납부내역증명 수집 완료");
    } catch (e) {
      console.error("SaveTax 납부내역증명 수집 실패:", e);
    }
  }

  // ============================================================
  // MODE: collect_tax_return (신고서 원본 계열 통합 수집)
  //   종합소득세/부가가치세/법인세/양도소득세/증여세 신고서
  //   "세금신고 > 전자신고 결과 조회"(menuAtag_4101010000 / UTERNAA0Z043)에서
  //   기간(startDate~endDate) 조회 후 각 신고서의 접수증/신고서 새창 PDF를
  //   print-pdf로 업로드. creds.returnType 으로 세목만 다르게 함.
  //   ★ 로그인 후 화면을 직접 못 봐서 세목 select / 날짜 input / 접수증 링크 id는
  //     모두 텍스트·값패턴 휴리스틱 + 폴백 + 타임아웃 방어로 작성됨(불확실).
  // ============================================================
  if (mode === "collect_tax_return") {
    try {
      console.log("SaveTax: content-hometax v4.19 — PDF 추출 directPDFPrint 우선(서버 전체분) + pdfDownLoad 폴백");
      if (await checkLogout()) return;

      // 1. 로그인 (+ 주민번호/인증서) — collect_biz_cert 와 동일 흐름
      await doLogin(creds.id, creds.pw);
      const rn = (creds.rn || "").replace(/[-\s]/g, "");
      if (rn) await doJumin(rn);
      if (creds.certPw) await doCert(creds.certName, creds.certPw);
      await sleep(2000);

      // 세목 매핑 (returnType → 홈택스 세목 표시 텍스트 + doc-types.ts의 정확한 key)
      const RT = {
        income:   { label: "종합소득세", tax: "종합소득세", docKey: "종합소득세_신고서" },
        vat:      { label: "부가가치세", tax: "부가가치세", docKey: "부가가치세_신고서" },
        corp:     { label: "법인세",     tax: "법인세",     docKey: "법인소득세_신고서" },
        transfer: { label: "양도소득세", tax: "양도소득세", docKey: "양도소득세_신고서" },
        gift:     { label: "증여세",     tax: "증여세",     docKey: "증여세_신고서" },
      };
      const rt = RT[creds.returnType] || RT.income;
      const docType = creds.docType || rt.docKey;
      const startDate = creds.startDate || "";
      const endDate = creds.endDate || "";
      console.log("SaveTax: 신고서 수집 시작 -", rt.label, startDate, "~", endDate);

      // startDate~endDate 를 홈택스 조회 한도(≤1년)에 맞춰 "달력연도" 단위로 분할.
      //  예) 2021-01-01~2025-12-31 → [21전체, 22전체, 23전체, 24전체, 25전체]
      //  첫/마지막 구간은 실제 시작·종료일로 클램프. 파싱 실패 시 원본 그대로 단일 구간(폴백).
      function buildYearWindows(sd, ed) {
        const sY = parseInt(String(sd || "").slice(0, 4), 10);
        const eY = parseInt(String(ed || "").slice(0, 4), 10);
        if (!sY || !eY || eY < sY) return [{ s: sd || "", e: ed || "", y: String(sY || "") }];
        const out = [];
        for (let y = sY; y <= eY; y++) {
          out.push({
            s: (y === sY) ? sd : (y + "-01-01"),
            e: (y === eY) ? ed : (y + "-12-31"),
            y: String(y),
          });
        }
        return out;
      }

      // 2. 전자신고 결과 조회 메뉴 진입
      //    (a) 알려진 menuAtag id 직접 클릭 → (b) 상단 '세금신고' 텍스트 메뉴 → 하위 텍스트 폴백
      async function goEfileResult() {
        try {
          const direct = document.getElementById("menuAtag_4101010000");
          if (direct) { direct.click(); await sleep(3000); return true; }
        } catch (e) {}
        try {
          const topMenu = await waitForXPath("//*[self::a or self::span or self::button][normalize-space(text())='세금신고' or normalize-space(text())='세금신고 (근로·자녀장려금 신청)']", 6000);
          if (topMenu) { topMenu.click(); await sleep(1200); }
        } catch (e) {}
        try {
          const sub = await waitForXPath("//*[self::a or self::span or self::button][contains(normalize-space(text()),'전자신고 결과 조회') or contains(normalize-space(text()),'전자신고결과조회')]", 6000);
          if (sub) { sub.click(); await sleep(3000); return true; }
        } catch (e) {}
        return false;
      }
      const entered = await goEfileResult();
      if (!entered) throw new Error("전자신고 결과 조회 메뉴 진입 실패 (menuAtag/텍스트 모두 실패)");
      await sleep(2000);

      // 3. 세목 선택 — 화면 내 select 중 해당 세목 옵션을 가진 첫 select 선택 (공백무시 부분일치)
      function selectTaxType(taxText) {
        const target = taxText.replace(/\s/g, "");
        const selects = document.querySelectorAll("select");
        for (const sel of selects) {
          if (sel.offsetParent === null) continue;
          for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].text.replace(/\s/g, "").includes(target)) {
              sel.selectedIndex = i;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              console.log("SaveTax: 세목 선택 →", sel.options[i].text);
              return true;
            }
          }
        }
        // select 없으면 라디오/탭 텍스트 클릭 폴백
        try {
          const tab = document.evaluate("//*[self::a or self::label or self::span or self::button][normalize-space(text())='" + taxText + "']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (tab) { tab.click(); console.log("SaveTax: 세목 탭/라디오 클릭 →", taxText); return true; }
        } catch (e) {}
        return false;
      }

      // 세목 옵션은 느린 네트워크에서 비동기로 늦게 채워진다(v4.14 실측: 옵션 없는 상태로
      // 진행하면 전 구간 0건 → '내역 없음' 오보고). 성공까지 폴링, 끝내 실패면 수집 중단.
      async function selectTaxTypeWithWait(taxText, timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          if (selectTaxType(taxText)) return true;
          await sleep(1500);
        }
        console.log("SaveTax: 세목 선택 실패(옵션 없음, " + Math.round(timeoutMs / 1000) + "초 대기) →", taxText);
        return false;
      }

      if (!(await selectTaxTypeWithWait(rt.tax, 60000))) {
        // 화면 로드 실패 — 조회를 강행하면 0건이 나와 '내역 없음'으로 오보고되므로 여기서 중단.
        // throw 하면 아래 mark-collected에 닿지 않아 앱 상태가 갱신되지 않는다(= 재시도 가능 상태 유지).
        throw new Error("세목 선택 실패(60초) — 화면 로드 지연/실패, 수집 중단(앱 상태 미갱신)");
      }
      await sleep(1500);

      // 조회기간 단위 '1년' 토글 명시 클릭.
      // 화면에 1년 초과 기간이 남아 있으면 홈택스가 조회 자체를 거부하므로,
      // 항상 1년 단위 모드로 맞춘 뒤(자동 셋팅된 날짜는 루프에서 덮어씀) 진행한다.
      async function clickPeriodUnit1Y() {
        const btn = Array.from(document.querySelectorAll("a, button, span, input[type='button']"))
          .find(el => el.offsetParent !== null && ((el.textContent || el.value || "").trim() === "1년"));
        if (btn) { btn.click(); await sleep(800); console.log("SaveTax: 기간단위 '1년' 클릭"); return true; }
        console.log("SaveTax: 기간단위 '1년' 버튼 못 찾음 — 화면 기본값으로 진행");
        return false;
      }

      // 4. 조회기간(startDate~endDate) 입력
      //    WebSquare 달력 input id 불명 → 화면에 보이는 날짜형 input 2개 추정.
      function fillDateRange(sd, ed) {
        if (!sd && !ed) return true;
        const all = Array.from(document.querySelectorAll("input"));
        const dateLike = all.filter(el => {
          if (el.offsetParent === null) return false;
          const t = (el.type || "").toLowerCase();
          if (["hidden", "checkbox", "radio", "button", "submit"].includes(t)) return false;
          const v = el.value || "";
          const idl = (el.id || "").toLowerCase();
          return /^\d{4}[-.\/]?\d{2}[-.\/]?\d{2}$/.test(v) || idl.includes("dt") || idl.includes("date") || Number(el.maxLength) === 10;
        });
        console.log("SaveTax: 조회기간 input 후보 " + dateLike.length + "개");
        // 값 정규화: 구분자 제거 후 8자리면 yyyy-MM-dd 로 (홈택스가 20200101 형태로 들고 있어도 비교되게)
        const norm = v => {
          const d = String(v || "").replace(/[^0-9]/g, "");
          return d.length === 8 ? d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8) : String(v || "");
        };
        const apply = () => {
          if (dateLike[0] && sd) setInput(dateLike[0], sd);
          if (dateLike[1] && ed) setInput(dateLike[1], ed);
        };
        const verify = () =>
          (!sd || (dateLike[0] && norm(dateLike[0].value) === sd)) &&
          (!ed || (dateLike[1] && norm(dateLike[1].value) === ed));
        apply();
        let ok = verify();
        if (!ok) { apply(); ok = verify(); } // 1회 재시도
        if (!ok) console.log("SaveTax: 조회기간 입력 검증 실패 — 화면 값: "
          + (dateLike[0] ? dateLike[0].value : "?") + " ~ " + (dateLike[1] ? dateLike[1].value : "?"));
        return ok;
      }

      // 4-b. 사업자(주민)등록번호 입력 (전자신고 결과 조회의 필수 항목)
      //      개인 세목(종소/양도/증여)은 주민번호, 부가세/법인은 사업자번호 우선
      function fillIdNumber(no) {
        if (!no) { console.log("SaveTax: 등록번호 없음 — 조회 불가(거래처 주민/사업자번호 미등록)"); return false; }
        const digits = String(no).replace(/[^0-9]/g, "");
        // ★ 이 칸은 type="password" 라 일반 text 셀렉터로는 안 잡힘. 정확 ID/title 우선.
        let inp = document.getElementById("mf_txppWframe_ibx_txprRgtNo")
          || document.querySelector("input[title='사업자(주민)등록번호']");
        // 폴백: '(주민)등록번호' 라벨 인접 input (password 포함)
        if (!inp) {
          const lab = document.evaluate(
            "//*[contains(normalize-space(text()),'(주민)등록번호')]",
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
          ).singleNodeValue;
          if (lab) {
            let node = lab;
            for (let up = 0; up < 6 && node; up++) {
              const cand = node.querySelector && node.querySelector("input[type='password'], input[type='text'], input:not([type])");
              if (cand && cand.offsetParent !== null) { inp = cand; break; }
              node = node.parentElement;
            }
          }
        }
        if (inp) { setInput(inp, digits); console.log("SaveTax: 등록번호 입력 " + digits.length + "자리 (" + (inp.id || inp.title || "?") + ")"); return true; }
        console.log("SaveTax: 등록번호 입력 필드 못 찾음");
        return false;
      }

      // 6. 결과 리스트 → 접수증/신고서 출력(새창) → print-pdf 업로드 (다건 반복)
      //    결과가 iframe 안에 렌더링될 수 있어 document + 접근 가능한 iframe 모두 탐색
      function accessibleDocs() {
        const docs = [document];
        for (const f of document.querySelectorAll("iframe")) {
          try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {}
        }
        return docs;
      }

      // 신고서 원본 수집: 각 결과 행(tr)에서 '접수번호(신고서보기)' 컬럼의 번호 링크
      // (예: "612-2020-…", 숫자와 '-'로 시작)를 클릭 → 신고서보기 팝업(UTERNAAZ34)에서
      // 일괄출력 → 전체 페이지 PDF. 링크가 없는 행(서면신고 등)은 기존 접수증 첫 '보기' 폴백.
      function collectPrintTargets() {
        const targets = [];
        for (const doc of accessibleDocs()) {
          for (const tr of doc.querySelectorAll("tr")) {
            const links = Array.from(tr.querySelectorAll("a"))
              .filter(el => {
                if (el.offsetParent === null) return false;
                const t = (el.textContent || "").trim();
                // 접수번호 형태(숫자-숫자…)만. '*' 포함(마스킹된 등록번호가 링크인 경우)은 제외
                return /^\d[\d-]{5,}/.test(t) && !t.includes("*");
              });
            if (links.length > 0) { targets.push(links[0]); continue; }
            const viewBtns = Array.from(tr.querySelectorAll("a, button, input[type='button']"))
              .filter(el => el.offsetParent !== null && ((el.textContent || el.value || "").trim() === "보기"));
            if (viewBtns.length > 0) targets.push(viewBtns[0]); // 폴백: 첫 '보기' = 접수증
          }
        }
        return targets;
      }

      let emptyDiagDumped = false; // 0건 진단 덤프는 최초 1회만 (구간마다 반복 출력 방지)
      async function collectCurrentResults(yearLabel) {
        let targets = collectPrintTargets();
        console.log("SaveTax: [" + yearLabel + "] 출력 대상 " + targets.length + "건 발견");
        if (targets.length === 0) {
          // 진단: 결과 그리드/버튼 구조를 덤프해 실제 내역 유무 vs 파싱 실패를 구분 (최초 1회만)
          if (!emptyDiagDumped) {
            emptyDiagDumped = true;
            try {
              const docs = accessibleDocs();
              console.log("SaveTax[진단]: 접근 가능 문서 수(메인+iframe) = " + docs.length);
              for (let di = 0; di < docs.length; di++) {
                const doc = docs[di];
                const rows = doc.querySelectorAll("tr, .w2grid_dataArea tr, [class*='grid'] tr");
                console.log(`SaveTax[진단]: 문서#${di} tr 개수 = ${rows.length}`);
                const clickables = Array.from(doc.querySelectorAll("a, button, input[type='button'], input[type='image']"))
                  .filter(el => el.offsetParent !== null)
                  .map(el => (el.textContent || el.value || el.title || el.alt || "").trim())
                  .filter(t => t && t.length < 20);
                console.log(`SaveTax[진단]: 문서#${di} 보이는 버튼/링크(<20자) 샘플 =`, JSON.stringify(clickables.slice(0, 40)));
                // '자료가 없습니다' / '조회된 내역이 없습니다' 류 안내문 탐지
                const emptyMsg = doc.evaluate("//*[contains(text(),'없습니다') or contains(text(),'조회 결과') or contains(text(),'자료가 없')]", doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                if (emptyMsg) console.log(`SaveTax[진단]: 문서#${di} 안내문 = "${(emptyMsg.textContent||'').trim().slice(0,60)}"`);
              }
              console.log("SaveTax[진단]: 위 샘플에서 신고서 출력/보기에 해당하는 버튼 텍스트를 알려주면 셀렉터를 맞춥니다. (내역 자체가 없으면 '없습니다' 안내문이 보일 것)");
            } catch (e) { console.log("SaveTax[진단]: 덤프 실패", e.message); }
          }
          return 0;
        }
        let count = 0;
        const total = targets.length;
        for (let idx = 0; idx < total; idx++) {
          try {
            // DOM이 갱신될 수 있어 매 반복마다 재수집
            targets = collectPrintTargets();
            const el = targets[idx];
            if (!el) break;

            // 파일명용 행 식별자(행 내 날짜) 추출, 없으면 순번
            let rowKey = String(idx + 1);
            try {
              const row = el.closest("tr");
              const m = row && row.textContent.match(/\d{4}[-.]\d{2}[-.]\d{2}/);
              if (m) rowKey = m[0].replace(/[-.]/g, "");
            } catch (e) {}

            el.click();
            console.log("SaveTax: [" + yearLabel + "] 출력 클릭 #" + (idx + 1) + "/" + total + " (" + rowKey + ")");
            await sleep(5000);

            // 확인/예 팝업이 있으면 눌러 새창 유도
            try {
              const yesBtn = await waitForXPath("//input[@value='예' or @value='확인'] | //button[normalize-space(text())='예' or normalize-space(text())='확인']", 2500);
              if (yesBtn) { yesBtn.click(); await sleep(4000); }
            } catch (e) {}

            const fileName = rt.label + "_신고서_" + yearLabel + "_" + rowKey + ".pdf";
            const result = await chrome.runtime.sendMessage({
              type: "print-pdf",
              waitSec: 290, // 일괄출력 병합(2~3분) 대기 + 220초 overdue 폴백까지 여유
              clientName: creds.clientName || "거래처",
              docName: rt.label + "_신고서_" + yearLabel + "_" + rowKey,
              upload: (creds.clientId && creds.appOrigin) ? {
                appOrigin: creds.appOrigin,
                token: creds.token || "",
                clientId: creds.clientId,
                docType: docType,
                taxYear: String(creds.taxYear || ""),
                fileName: fileName,
              } : null,
            });
            if (result && result.debug) console.log("SaveTax: [캡처디버그] " + JSON.stringify(result.debug).slice(0, 1600));
            if (result && result.ok) {
              count++;
              console.log("SaveTax: " + fileName + " 저장 성공");
            } else {
              console.error("SaveTax: " + fileName + " 저장 실패 - " + (result?.error || ""));
            }

            // 리포트 탭 닫기
            await sleep(1000);
            try { await chrome.runtime.sendMessage({ type: "close-report-tab" }); } catch (e) {}
            await sleep(1500);
          } catch (e) {
            console.error("SaveTax: [" + yearLabel + "] 출력 #" + (idx + 1) + " 실패 -", e.message);
          }
        }
        return count;
      }

      const idNo = (creds.returnType === "vat" || creds.returnType === "corp")
        ? (creds.bizNumber || creds.rn)
        : (creds.rn || creds.bizNumber);

      const windows = buildYearWindows(startDate, endDate);
      console.log("SaveTax: 조회 구간 " + windows.length + "개 → " +
        windows.map(w => w.s + "~" + w.e).join(", "));

      await clickPeriodUnit1Y();

      let collectedCount = 0;
      let anyQueryRan = false; // 조회 버튼을 실제로 누른 구간이 하나라도 있는가
      for (const win of windows) {
        try {
          console.log("SaveTax: [" + win.y + "] 조회 시작 " + win.s + " ~ " + win.e);

          // (a) 날짜 입력 (+검증) — 실패 시 화면에 남은 엉뚱한 기간으로 조회되는 것 방지
          const dateOk = fillDateRange(win.s, win.e);
          await sleep(800);
          if (!dateOk) { console.log("SaveTax: [" + win.y + "] 기간 입력 실패 — 이 구간 건너뜀"); continue; }

          // (b) 주민/사업자 등록번호 입력 (조회마다 재입력 — 조회 후 초기화 대비)
          fillIdNumber(idNo);
          await sleep(500);

          // ★ 직전 구간 결과가 그리드에 남은 채 새 결과로 오인(v4.15 회귀: 2025 조회에 2024 행이 잡힘) 방지
          //   — 조회 전 그리드 서명을 찍어두고, 클릭 후 서명이 "달라질 때까지" 기다린다.
          const preSig = collectPrintTargets().map(el => (el.textContent || "").trim()).join("|");

          // (c) 조회 클릭  ← 기존 조회버튼 클릭 로직(input[value='조회'] 보이는 것 우선, 최대 3회 재시도)을 그대로 사용
          let searchClicked = false;
          for (let attempt = 0; attempt < 3 && !searchClicked; attempt++) {
            const btns = Array.from(document.querySelectorAll("input[value='조회'], button, a, span"))
              .filter(el => el.offsetParent !== null && ((el.value || "").trim() === "조회" || (el.textContent || "").trim() === "조회"));
            if (btns.length) { btns[0].click(); searchClicked = true; console.log("SaveTax: [" + win.y + "] 조회 클릭"); }
            else await sleep(1000);
          }
          if (!searchClicked) { console.log("SaveTax: [" + win.y + "] 조회 버튼 못 찾음 — 이 구간 건너뜀"); continue; }
          anyQueryRan = true;
          // 결과 그리드 로딩 폴링 — 서명이 조회 전과 "달라질 때까지" 대기(최대 27초).
          // 대상 발견 즉시 진행하면 직전 구간의 잔존 그리드를 오인하고, 고정 대기는 느린
          // 네트워크에서 있는 내역을 0건으로 오판한다. 두 구간 결과가 모두 0건이면 서명이
          // 같을 수 있으므로 타임아웃 후에는 현 상태로 진행(0건 판정).
          await sleep(2000);
          for (let w = 0; w < 25; w++) {
            const sig = collectPrintTargets().map(el => (el.textContent || "").trim()).join("|");
            if (sig !== preSig) break;
            await sleep(1000);
          }
          await sleep(1500); // 그리드 렌더 안정화

          // (d) 이 구간 결과 수집 (없으면 0 반환하고 다음 연도로 — "없으면 패스")
          const gotThisWindow = await collectCurrentResults(win.y);
          collectedCount += gotThisWindow;
          if (gotThisWindow === 0) console.log("SaveTax: [" + win.y + "] 신고 내역 없음 — 패스");
          else console.log("SaveTax: [" + win.y + "] " + gotThisWindow + "건 수집");
        } catch (e) {
          console.error("SaveTax: [" + win.y + "] 조회/수집 실패 -", e.message);
        }
      }

      // 한 구간도 조회를 실행하지 못했다면 화면 문제 — '내역 없음(empty)'으로 오보고하지 않는다
      if (!anyQueryRan) throw new Error("조회를 한 번도 실행하지 못함 — 화면 로드 문제(앱 상태 미갱신)");

      // 7. 완료 보고 (1건 이상 성공 시)
      if (creds.clientId && creds.appOrigin) {
        try {
          const markResult = await chrome.runtime.sendMessage({
            type: "mark-collected",
            appOrigin: creds.appOrigin,
            token: creds.token || "",
            clientId: creds.clientId,
            docType: docType,
            taxYear: String(creds.taxYear || ""),
            // 1건 이상이면 collected(파일 업로드됨), 0건이면 empty(조회했으나 신고 내역 없음)
            status: collectedCount > 0 ? "collected" : "empty",
            params: { startDate: startDate, endDate: endDate, count: String(collectedCount), windows: String(windows.length) },
          });
          console.log("SaveTax: 앱 수집 상태 갱신 ->", JSON.stringify(markResult));
        } catch (e) {
          console.error("SaveTax: 앱 수집 상태 갱신 실패:", e);
        }
      }

      console.log("SaveTax: " + rt.label + " 신고서 " + collectedCount + "건 수집 완료");

      // 홈으로 이동
      const homeBtn = document.getElementById("mf_wfHeader_hdGroup001");
      if (homeBtn) homeBtn.click();

    } catch (e) {
      console.error("SaveTax 신고서 수집 실패:", e);
    }
  }

  // ============================================================
  // MODE: collect_payment_statement (지급명세서 제출/내역조회 자동 수집)
  //   지급명세서 제출/내역 조회 (menuAtag_4402070000, scrnid UTESFAA0E001)
  //   creds.stmtType : "simple"(간이지급명세서) | "business"(사업소득 지급명세서)
  //   creds.startMonth / creds.endMonth : "YYYY-MM" (귀속기간)
  //   ※ 로그인 후 화면 미확인 → 요소는 텍스트 기반 탐색 + 폴백으로 방어. notes 참고.
  // ============================================================
  if (mode === "collect_payment_statement") {
    try {
      if (await checkLogout()) return;

      // 1. 로그인 (collect_biz_cert 검증 템플릿과 동일)
      await doLogin(creds.id, creds.pw);
      const rn = (creds.rn || "").replace(/[-\s]/g, "");
      if (rn) await doJumin(rn);
      if (creds.certPw) await doCert(creds.certName, creds.certPw);
      await sleep(2000);

      const isBusiness = creds.stmtType === "business";
      const stmtLabel = isBusiness ? "사업소득_지급명세서" : "간이지급명세서";
      console.log("SaveTax: " + stmtLabel + " 수집 시작");

      // 텍스트 '포함' 클릭 헬퍼 (a/span/button/input/label 여러 태그 시도)
      function clickByText(text, timeout) {
        const xp = "//a[contains(normalize-space(.),'" + text + "')]"
          + " | //span[contains(normalize-space(.),'" + text + "')]"
          + " | //button[contains(normalize-space(.),'" + text + "')]"
          + " | //input[@value='" + text + "']"
          + " | //label[contains(normalize-space(.),'" + text + "')]";
        return waitForXPath(xp, timeout || 8000);
      }
      // 텍스트 '정확히 일치' 클릭 헬퍼 (조회/출력처럼 부분일치 오클릭을 피해야 하는 버튼용)
      function clickExact(text, timeout) {
        const xp = "//input[@value='" + text + "']"
          + " | //a[normalize-space(.)='" + text + "']"
          + " | //span[normalize-space(.)='" + text + "']"
          + " | //button[normalize-space(.)='" + text + "']";
        return waitForXPath(xp, timeout || 6000);
      }
      // 셀렉트에서 옵션 텍스트(숫자 기준)로 값 선택
      function selectByOptionText(sel, needle) {
        if (!sel || !needle) return false;
        const target = String(needle).replace(/[^0-9]/g, "");
        for (let i = 0; i < sel.options.length; i++) {
          const optNum = sel.options[i].text.replace(/[^0-9]/g, "");
          if (optNum === target || sel.options[i].text.includes(String(needle))) {
            sel.selectedIndex = i;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
        }
        return false;
      }

      // 2. 메뉴 진입: (근로·사업 등) 지급명세서 제출/내역 조회
      //    1순위 스크랩 menuAtag 직접 클릭 → 2순위 헤더 메뉴 텍스트 → 3순위 딥링크(미검증)
      let entered = false;
      try {
        const atag = document.getElementById("menuAtag_4402070000");
        if (atag) { atag.click(); await sleep(3000); entered = true; console.log("SaveTax: menuAtag_4402070000 진입"); }
      } catch (e) {}
      if (!entered) {
        try {
          const top = await clickByText("지급명세서", 5000);
          if (top) { top.click(); await sleep(800); }
          const sub = await clickByText("제출/내역", 5000);
          if (sub) { sub.click(); await sleep(3000); entered = true; console.log("SaveTax: 텍스트 메뉴 진입"); }
        } catch (e) {}
      }
      if (!entered) {
        // 미검증 딥링크로 전체 페이지 이동하면 재로그인/무한 리로드 루프 위험 → 깔끔히 중단
        throw new Error("지급명세서 제출/내역조회 메뉴 진입 실패 (menuAtag/텍스트 모두 실패)");
      }
      await sleep(2000);

      // 3. 지급명세서 종류 선택 (좌측 트리/탭, 텍스트 기반)
      try {
        if (isBusiness) {
          const t = await clickByText("사업소득 지급명세서", 6000);
          if (t) { t.click(); console.log("SaveTax: 사업소득 지급명세서 선택"); }
        } else {
          const t = await clickByText("간이지급명세서", 6000);
          if (t) { t.click(); console.log("SaveTax: 간이지급명세서 선택(첫 매칭)"); }
        }
        await sleep(1500);
      } catch (e) { console.log("SaveTax: 지급명세서 종류 탭 미발견 - 현재 화면으로 진행"); }

      // 4. '내역조회'(제출내역 조회) 탭으로 이동
      try {
        const inq = await clickByText("내역조회", 4000);
        if (inq) { inq.click(); await sleep(2000); console.log("SaveTax: 내역조회 탭"); }
      } catch (e) {
        try {
          const inq2 = await clickByText("제출내역", 4000);
          if (inq2) { inq2.click(); await sleep(2000); }
        } catch (e2) {}
      }

      // 5. 귀속연월(from~to) 입력. "YYYY-MM" → 연/월 분리
      const sParts = (creds.startMonth || "").split("-");
      const eParts = (creds.endMonth || "").split("-");
      const sy = sParts[0], sm = sParts[1];
      const ey = eParts[0], em = eParts[1];
      console.log("SaveTax: 귀속기간 " + (creds.startMonth || "?") + " ~ " + (creds.endMonth || "?"));
      try {
        const selects = Array.prototype.slice.call(document.querySelectorAll("select"));
        const yearSels = selects.filter(function (s) {
          return Array.prototype.slice.call(s.options).some(function (o) { return /^\s*20\d{2}\s*년?\s*$/.test(o.text); });
        });
        const monthSels = selects.filter(function (s) {
          return Array.prototype.slice.call(s.options).some(function (o) { return /^\s*(0?[1-9]|1[0-2])\s*월?\s*$/.test(o.text); });
        });
        if (yearSels[0] && sy) selectByOptionText(yearSels[0], sy);
        if (yearSels[1] && ey) selectByOptionText(yearSels[1], ey);
        if (monthSels[0] && sm) selectByOptionText(monthSels[0], String(parseInt(sm, 10)));
        if (monthSels[1] && em) selectByOptionText(monthSels[1], String(parseInt(em, 10)));
        // select가 아니라 month/date 입력형이면 폴백
        if (yearSels.length === 0) {
          const monthInputs = document.querySelectorAll("input[type='month']");
          if (monthInputs[0] && creds.startMonth) setInput(monthInputs[0], creds.startMonth);
          if (monthInputs[1] && creds.endMonth) setInput(monthInputs[1], creds.endMonth);
        }
        await sleep(800);
      } catch (e) { console.log("SaveTax: 귀속연월 입력 실패(수동 확인 필요):", e.message); }

      // 6. 조회 (정확 일치로 '내역조회' 탭과 구분)
      try {
        const search = await clickExact("조회", 6000);
        if (search) { search.click(); console.log("SaveTax: 조회 클릭"); await sleep(4000); }
      } catch (e) { console.log("SaveTax: 조회 버튼 미발견"); }

      // 7. 출력/인쇄 → 리포트 새창(clipreport.do)
      let printed = false;
      const printLabels = ["출력", "인쇄", "출력하기"];
      for (let li = 0; li < printLabels.length; li++) {
        try {
          const pb = await clickExact(printLabels[li], 3000);
          if (pb) { pb.click(); console.log("SaveTax: " + printLabels[li] + " 클릭"); printed = true; await sleep(5000); break; }
        } catch (e) {}
      }
      if (!printed) console.log("SaveTax: 출력 버튼 미발견 - 리포트 새창이 안 뜰 수 있음(notes 참고)");

      // 8. 리포트 새창 PDF 저장 + 앱 업로드 (print-pdf 인프라 재사용)
      try {
        const result = await chrome.runtime.sendMessage({
          type: "print-pdf",
          clientName: creds.clientName || "거래처",
          docName: stmtLabel + "_" + (creds.startMonth || "") + "_" + (creds.endMonth || ""),
          upload: (creds.clientId && creds.appOrigin) ? {
            appOrigin: creds.appOrigin,
            token: creds.token || "",
            clientId: creds.clientId,
            docType: creds.docType || stmtLabel,
            taxYear: String(creds.taxYear || ""),
            fileName: stmtLabel + ".pdf",
          } : null,
        });
        if (result && result.ok) {
          console.log("SaveTax: " + stmtLabel + " PDF 저장 완료");
          if (creds.clientId && creds.appOrigin) {
            try {
              await chrome.runtime.sendMessage({
                type: "mark-collected",
                appOrigin: creds.appOrigin,
                token: creds.token || "",
                clientId: creds.clientId,
                docType: creds.docType || stmtLabel,
                taxYear: String(creds.taxYear || ""),
                params: { startMonth: creds.startMonth || "", endMonth: creds.endMonth || "" },
              });
            } catch (e) {}
          }
        } else {
          console.log("SaveTax: PDF 저장 실패 - " + (result && result.error ? result.error : ""));
        }
      } catch (e) {
        console.log("SaveTax: PDF 저장 실패, 수동 저장 필요");
      }

      // 9. 리포트 창 닫기 + 홈으로
      await sleep(1000);
      try { await chrome.runtime.sendMessage({ type: "close-report-tab" }); } catch (e) {}
      await sleep(500);
      try { const homeBtn = document.getElementById("mf_wfHeader_hdGroup001"); if (homeBtn) homeBtn.click(); } catch (e) {}

      console.log("SaveTax: " + stmtLabel + " 수집 완료");
    } catch (e) {
      console.error("SaveTax 지급명세서 수집 실패:", e);
    }
  }


  // ============================================================
  // MODE: collect_yearend_simplified (연말정산 간소화 자료 자동 수집)
  //  ⚠️ 근로자 본인 자료제공 동의/본인인증이 얽혀 자동화 난이도가 높음.
  //     로그인 → 메뉴진입 → 연도선택 → (동의/인증 시도) → 조회 → 출력(PDF) 까지 최대한 자동화.
  //     인증/동의가 인증서로 통과 불가하면 그 지점에서 명확히 중단.
  // ============================================================
  if (mode === "collect_yearend_simplified") {
    try {
      // 로그인 → 리로드 사이 진행상태 식별 (checkLogout 자동 로그아웃 루프 방지)
      if (!sessionStorage.getItem("savetax_running")) {
        if (await checkLogout()) return;

        // 1. 로그인
        await doLogin(creds.id, creds.pw);

        const rn = (creds.rn || "").replace(/[-\s]/g, "");
        if (rn) await doJumin(rn);

        // 연말정산간소화는 본인인증에 인증서가 필요할 수 있음 → 있으면 로그인 단계에서 시도
        if (creds.certPw) {
          await doCert(creds.certName, creds.certPw);
        }

        // 로그인 플래그 세팅 후 홈으로 리로드 (로그인 세션 메뉴 확보)
        sessionStorage.setItem("savetax_running", "true");
        await sleep(2500);
        window.location.href = "https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3";
        return;
      }

      console.log("SaveTax: 연말정산 간소화 수집 시작 (로그인 완료 상태)");
      await sleep(2500);

      const yearStr = String(creds.year || creds.taxYear || "");

      // --- 유틸: 텍스트 후보로 요소 클릭 ---
      async function clickByTextCandidates(candidates, timeout = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          for (const t of candidates) {
            const xp = `//*[self::span or self::a or self::button or self::li or self::div][normalize-space(text())='${t}']` +
                       ` | //*[self::span or self::a or self::button][contains(normalize-space(text()),'${t}')]`;
            const el = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (el && el.offsetParent !== null) { el.click(); return el; }
          }
          await sleep(400);
        }
        return null;
      }

      // --- 유틸: 화면 전체 select 중 해당 연도 옵션 가진 것 선택 ---
      async function selectYearInAnySelect(y, timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const selects = document.querySelectorAll("select");
          for (const sel of selects) {
            if (sel.offsetParent === null) continue;
            for (let i = 0; i < sel.options.length; i++) {
              const optTxt = sel.options[i].text.replace(/[^0-9]/g, "");
              if (optTxt === String(y) || sel.options[i].value === String(y)) {
                sel.selectedIndex = i;
                sel.dispatchEvent(new Event("change", { bubbles: true }));
                console.log("SaveTax: 귀속연도 선택 →", sel.options[i].text);
                return sel;
              }
            }
          }
          await sleep(400);
        }
        return null;
      }

      // 2. 메뉴 진입: 장려금·연말정산·전자기부금 > 연말정산간소화 > 근로자 자료 조회
      //    (요소 ID 불명 → 텍스트 다중 후보 + 폴백)
      console.log("SaveTax: 연말정산간소화 메뉴 진입 시도");
      const topMenu = await clickByTextCandidates([
        "장려금·연말정산·전자기부금", "장려금ㆍ연말정산ㆍ전자기부금",
        "장려금·연말정산·기부금", "연말정산·지급명세서", "연말정산"
      ], 8000);
      if (topMenu) await sleep(1500);

      const subMenu = await clickByTextCandidates([
        "연말정산간소화", "연말정산간소화 자료 조회", "연말정산간소화자료 조회"
      ], 8000);
      if (subMenu) await sleep(1500);

      const leafMenu = await clickByTextCandidates([
        "근로자 소득·세액공제 자료 조회", "근로자 소득세액공제 자료 조회",
        "근로자 소득공제 자료 조회", "소득·세액공제 자료 조회", "자료 조회"
      ], 8000);
      if (leafMenu) await sleep(3000);

      if (!topMenu && !subMenu && !leafMenu) {
        console.error("SaveTax: 연말정산간소화 메뉴를 텍스트로 찾지 못함. 홈택스 메뉴 구조/명칭 확인 필요. 중단.");
        sessionStorage.removeItem("savetax_running");
        sessionStorage.removeItem("savetax_creds");
        return;
      }

      // 3. 자료제공 동의 / 본인인증 화면 감지 (자동화 한계 지점)
      await sleep(1500);
      const needsAuth = document.evaluate(
        "//*[contains(text(),'본인인증') or contains(text(),'자료제공 동의') or contains(text(),'자료제공동의') or contains(text(),'간편인증') or contains(text(),'인증서 선택')]",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
      if (needsAuth) {
        console.log("SaveTax: 본인인증/자료제공 동의 화면 감지 - 인증서로 통과 시도");
        // 동의 체크/버튼 시도
        await clickByTextCandidates(["동의", "전체동의", "모두 동의", "확인"], 3000);
        await sleep(1000);
        // 인증서 인증 재시도 (iframe 기반)
        if (creds.certPw) {
          await doCert(creds.certName, creds.certPw);
          await sleep(2000);
        } else {
          console.error("SaveTax: 등록된 인증서가 없어 연말정산간소화 본인인증을 통과할 수 없음. 여기까지 자동화하고 중단.");
          // 완료 보고 없이 종료 (수동 인증 필요)
          sessionStorage.removeItem("savetax_running");
          sessionStorage.removeItem("savetax_creds");
          return;
        }
        // 인증 후에도 여전히 인증 화면이면 자동화 불가로 판단하고 중단
        await sleep(1500);
        const stillAuth = document.evaluate(
          "//*[contains(text(),'본인인증') or contains(text(),'인증서 선택')]",
          document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if (stillAuth && stillAuth.offsetParent !== null) {
          console.error("SaveTax: 인증서 인증으로 본인인증을 통과하지 못함(금융인증/간편인증 전용 계정 가능). 수동 처리 필요, 중단.");
          sessionStorage.removeItem("savetax_running");
          sessionStorage.removeItem("savetax_creds");
          return;
        }
      }

      // 4. 귀속연도 선택
      await selectYearInAnySelect(yearStr, 10000);
      await sleep(800);

      // 5. 조회
      const searchBtn = await clickByTextCandidates(["조회하기", "조회"], 6000);
      if (searchBtn) {
        console.log("SaveTax: 연말정산간소화 조회 클릭");
        await sleep(5000);
      } else {
        console.log("SaveTax: 조회 버튼을 찾지 못함 - 이미 조회된 상태일 수 있음, 계속 진행");
      }

      // 6. 출력/인쇄 → clipreport.do 리포트 새창 → print-pdf
      //    (연말정산간소화는 '한번에 내려받기(PDF)'가 디스크 직접 다운로드일 수 있음 → 리포트 새창을 여는 인쇄/출력을 우선 시도)
      const printBtn = await clickByTextCandidates([
        "인쇄하기", "출력하기", "인쇄", "출력", "미리보기", "화면인쇄", "PDF"
      ], 8000);
      if (printBtn) {
        console.log("SaveTax: 출력/인쇄 버튼 클릭");
        await sleep(5000);
      } else {
        console.log("SaveTax: 출력/인쇄 버튼을 찾지 못함 - 리포트 새창이 안 열릴 수 있음");
      }

      // 새 창(리포트 탭)에서 PDF 저장 + 앱 업로드
      let collected = false;
      try {
        const result = await chrome.runtime.sendMessage({
          type: "print-pdf",
          clientName: creds.clientName || "거래처",
          docName: `연말정산_간소화_${yearStr}년`,
          upload: (creds.clientId && creds.appOrigin) ? {
            appOrigin: creds.appOrigin,
            token: creds.token || "",
            clientId: creds.clientId,
            docType: creds.docType || "연말정산_간소화",
            taxYear: String(creds.taxYear || yearStr),
            fileName: `연말정산_간소화_${yearStr}년.pdf`,
          } : null,
        });
        if (result && result.ok) {
          collected = true;
          console.log("SaveTax: 연말정산간소화 PDF 저장 성공");
        } else {
          console.error("SaveTax: 연말정산간소화 PDF 저장 실패 - " + (result?.error || "리포트 새창(clipreport.do)을 찾지 못함"));
        }
      } catch (e) {
        console.error("SaveTax: 연말정산간소화 print-pdf 메시지 실패:", e);
      }

      // 리포트 탭 닫기
      await sleep(1000);
      try { await chrome.runtime.sendMessage({ type: "close-report-tab" }); } catch (e) {}

      // 7. 완료 보고
      if (collected && creds.clientId && creds.appOrigin) {
        try {
          const markResult = await chrome.runtime.sendMessage({
            type: "mark-collected",
            appOrigin: creds.appOrigin,
            token: creds.token || "",
            clientId: creds.clientId,
            docType: creds.docType || "연말정산_간소화",
            taxYear: String(creds.taxYear || yearStr),
            params: { year: yearStr },
          });
          console.log("SaveTax: 앱 수집 상태 갱신 ->", JSON.stringify(markResult));
        } catch (e) {
          console.error("SaveTax: 앱 수집 상태 갱신 실패:", e);
        }
      }

      // 정리 및 홈 이동
      sessionStorage.removeItem("savetax_running");
      sessionStorage.removeItem("savetax_creds");
      console.log(`SaveTax: 연말정산간소화 수집 종료 (성공=${collected})`);
      const homeBtn = document.getElementById("mf_wfHeader_hdGroup001");
      if (homeBtn) homeBtn.click();

    } catch (e) {
      sessionStorage.removeItem("savetax_running");
      sessionStorage.removeItem("savetax_creds");
      console.error("SaveTax 연말정산간소화 수집 실패:", e);
    }
  }

})();
