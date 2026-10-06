// 위하고 전자신고 화면 자동 조작 (원천세 자동신고)
//  - SWER0101 원천징수 전자신고(홈택스용) / SWER0109 지방소득세특별징수전자신고(위택스용)
//  - URL 해시에 stCloseCheck=YYYYMM 이 있으면: 지급기간 월 설정 → 수임처 전체 선택 → 조회
//    → 응답(wehago-main-hook.js가 postMessage) 수집 → 서버 /api/withholding/filing/close-check 전송 → 탭 닫기
//  화면 구조(2026-10 실측): 지급기간 월 콤보 2개(WSC_LUXButton 22x26), 수임처 선택 아이콘(WSC_LUXButton 27x20)
//  → "회사 코드도움" 팝업(표가 canvas라 체크 상태는 픽셀로 판단, 클릭은 background의 디버거 실클릭 필요)
(function () {
  const hash = location.hash || "";
  const chk = hash.match(/stCloseCheck=(\d{6})/);
  if (!chk) return;
  const payYm = chk[1];
  const menu = (hash.match(/\/(SWER01\d\d)\?/) || [])[1];
  const kind = menu === "SWER0101" ? "income" : menu === "SWER0109" ? "local" : null;
  if (!kind) return;
  const label = kind === "income" ? "원천세" : "지방소득세";
  const month = payYm.slice(4, 6);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log("[SaveTax 전자신고]", ...a);
  const visible = (el) => !!el && !!el.offsetParent;
  const txt = (el) => (el.innerText || el.value || "").trim();
  const rect = (el) => el.getBoundingClientRect();
  function fire(el, types = ["mousedown", "mouseup", "click"]) {
    const r = rect(el);
    for (const t of types) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }));
    }
  }
  function realClick(x, y) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "efile-real-click", x: Math.round(x), y: Math.round(y) }, (res) => resolve(res));
    });
  }
  // MAIN world(wehago-main-hook.js)의 RealGrid 브리지 호출
  let bridgeSeq = 0;
  function bridge(cmd, args = {}, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const id = "st" + (++bridgeSeq) + "_" + Date.now();
      const onMsg = (ev) => {
        const d = ev.data;
        if (!d || d.source !== "savetax-efile-res" || d.id !== id) return;
        window.removeEventListener("message", onMsg); clearTimeout(t);
        d.error ? reject(new Error(d.error)) : resolve(d.result);
      };
      const t = setTimeout(() => { window.removeEventListener("message", onMsg); reject(new Error("브리지 응답 없음: " + cmd)); }, timeoutMs);
      window.addEventListener("message", onMsg);
      window.postMessage({ source: "savetax-efile-cmd", id, cmd, args }, "*");
    });
  }
  async function waitFor(fn, timeoutMs = 20000, step = 300) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try { const v = fn(); if (v) return v; } catch {}
      await sleep(step);
    }
    return null;
  }
  // 화면 위 상태 배너
  let banner;
  function status(msg, color = "#1B64DA") {
    if (!banner) {
      banner = document.createElement("div");
      banner.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#191F28;color:#fff;font:600 13px/1.4 sans-serif;padding:8px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:70vw";
      document.documentElement.appendChild(banner);
    }
    banner.style.background = color;
    banner.textContent = `SaveTax ${label} 마감조회 · ${msg}`;
    log(msg);
  }

  // ---- 응답 수집 (MAIN world 후킹 → postMessage) ----
  const rows = [];
  let responses = 0, lastResponseAt = 0;
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "savetax-efile" || d.menu !== menu) return;
    responses++; lastResponseAt = Date.now();
    try {
      const j = JSON.parse(d.body);
      for (const g of (j.group03 || [])) {
        rows.push({
          cno: g.cno || d.cno, ccode: g.ccode || d.ccode, name: g.nm_krcom,
          reportType: g.won_singo_gu, attribYm: g.ym_rvrs, payYm: g.ym_pay,
          amount: g.am_a99, keyClose: g.key_close, singo: g.singo_gubun || g.fg_declare,
        });
      }
    } catch (e) { /* 빈 응답 등 */ }
  });

  // ---- 화면 요소 찾기 ----
  const filterLabel = () => [...document.querySelectorAll("strong,span,div,label")].find(e => visible(e) && e.childElementCount === 0 && txt(e) === "지급기간");
  function filterRowTop() { const l = filterLabel(); return l ? rect(l).top : null; }
  function monthToggleButtons() {
    const top = filterRowTop(); if (top == null) return [];
    return [...document.querySelectorAll("button.WSC_LUXButton")].filter(b => {
      const r = rect(b); return visible(b) && Math.abs(r.top - top) < 30 && r.width >= 18 && r.width <= 28 && r.height >= 22 && r.height <= 30;
    }).sort((a, b) => rect(a).left - rect(b).left);
  }
  function pickerButton() {
    const top = filterRowTop(); if (top == null) return null;
    return [...document.querySelectorAll("button.WSC_LUXButton")].filter(b => {
      const r = rect(b); return visible(b) && Math.abs(r.top - top) < 30 && r.width >= 24 && r.width <= 32 && r.height >= 16 && r.height <= 24;
    }).sort((a, b) => rect(a).left - rect(b).left)[0] || null;
  }
  const monthValueOf = (toggle) => {
    const box = toggle.parentElement; // [값 div][토글 버튼]
    const v = [...box.querySelectorAll("div")].find(d => d.childElementCount === 0 && /^(0[1-9]|1[0-2])$/.test(txt(d)));
    return v ? txt(v) : "";
  };
  const queryButton = () => [...document.querySelectorAll("button")].find(b => visible(b) && txt(b) === "조회" && rect(b).top < 400);
  const alertBox = () => [...document.querySelectorAll(".WSC_LUXAlert .dialog_alert, .dialog_alert")].find(visible);

  async function closeInfoPopup() {
    // "제출자등록 탭을 확인해주십시오" 안내 팝업 → 확인
    const btn = await waitFor(() => [...document.querySelectorAll("button")].find(b => visible(b) && txt(b) === "확인" && (b.closest("[class*=dialog]") || b.closest("[class*=Dialog]"))), 4000, 200);
    if (btn) { fire(btn); await sleep(500); }
  }

  async function setMonth(idx, mm) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const toggles = monthToggleButtons();
      if (toggles.length < 2) throw new Error("지급기간 월 선택 버튼을 찾지 못했습니다");
      if (monthValueOf(toggles[idx]) === mm) return;
      fire(toggles[idx]);
      const tTop = rect(toggles[idx]).bottom;
      const opt = await waitFor(() => [...document.querySelectorAll("div,li")].find(e => visible(e) && e.childElementCount === 0 && txt(e) === mm && rect(e).top > tTop && rect(e).top < tTop + 400), 2500, 100);
      if (!opt) { await sleep(500); continue; }
      fire(opt);
      await sleep(600);
      if (monthValueOf(monthToggleButtons()[idx]) === mm) return;
    }
    throw new Error(`지급기간 ${idx === 0 ? "시작" : "종료"}월을 ${mm}로 설정하지 못했습니다`);
  }

  // 회사 코드도움 팝업에서 전체 선택 후 확인
  //  1순위: RealGrid 브리지로 팝업 표 checkAll (팝업 표 = 가장 나중에 만들어진 살아있는 표)
  //  2순위: 표가 canvas라 체크 여부를 픽셀 색으로 보고 헤더 체크박스를 디버거 실클릭
  async function selectAllCompanies() {
    const pb = pickerButton();
    if (!pb) throw new Error("수임처 선택 버튼을 찾지 못했습니다");
    let gridsBefore = 0;
    try { gridsBefore = (await bridge("grids")).length; } catch {}
    fire(pb);
    const dlg = await waitFor(() => [...document.querySelectorAll("div")].find(d => visible(d) && txt(d).startsWith("회사 코드도움") && rect(d).width > 400 && rect(d).width < 1200), 6000, 200);
    if (!dlg) throw new Error("회사 코드도움 팝업이 열리지 않았습니다");
    await sleep(800);

    let done = false;
    try {
      // 팝업 표 찾기: 새로 생겼거나(인덱스 ≥ 이전 개수) 아니면 마지막 살아있는 표
      const infos = await waitFor(async () => { const g = await bridge("grids"); return g.some(x => x.rowCount > 0 && x.index >= gridsBefore) ? g : null; }, 4000, 300) || await bridge("grids");
      const cand = infos.filter(x => x.alive && x.rowCount > 0);
      const popup = cand.find(x => x.index >= gridsBefore) || cand[cand.length - 1];
      if (popup) {
        const checked = await bridge("checkAll", { index: popup.index, checked: true });
        log("팝업 표 전체선택", popup.index, checked && checked.length, "/", popup.rowCount);
        if (checked && checked.length >= popup.rowCount) done = true;
      }
    } catch (e) { log("브리지 전체선택 실패, 픽셀 방식으로 폴백:", e.message); }

    if (!done) {
      const cv = dlg.querySelector("canvas");
      if (!cv) throw new Error("회사 목록(canvas)을 찾지 못했습니다");
      const ctx = cv.getContext("2d");
      const r = rect(cv);
      const isBlue = (x, y) => {
        const d = ctx.getImageData(Math.round(x * cv.width / r.width), Math.round(y * cv.height / r.height), 1, 1).data;
        return d[2] > 180 && d[0] < 140; // 체크된 체크박스 파란색(73/149/255 계열)
      };
      const allChecked = () => [33, 54, 75].every(y => isBlue(10, y));
      for (let attempt = 0; attempt < 4 && !allChecked(); attempt++) {
        const res = await realClick(r.left + 10, r.top + 12); // 헤더 체크박스 (합성 이벤트는 canvas가 무시)
        if (!res || !res.ok) throw new Error("실클릭 실패: " + (res && res.error));
        await sleep(600);
      }
      if (!allChecked()) throw new Error("수임처 전체 선택이 되지 않았습니다");
    }
    const ok = [...dlg.querySelectorAll("button")].find(b => visible(b) && txt(b).startsWith("확인"));
    if (!ok) throw new Error("회사 코드도움 확인 버튼을 찾지 못했습니다");
    fire(ok);
    await sleep(800);
  }

  async function waitForResults() {
    const start = Date.now();
    // 조회 시작(첫 응답) 대기 — 최대 40초
    await waitFor(() => responses > 0 || alertBox(), 40000, 300);
    const ab = alertBox();
    if (ab && responses === 0) {
      const t = txt(ab);
      // "조회할 데이터가 존재하지 않습니다" = 마감된 수임처가 하나도 없음 → 정상(0건)
      if (!/존재하지 않습니다/.test(t)) throw new Error("위하고 안내: " + t.replace(/\s+/g, " "));
      const okb = [...ab.parentElement.querySelectorAll("button")].find(b => visible(b));
      if (okb) fire(okb);
      return;
    }
    if (responses === 0) throw new Error("조회 응답이 없습니다 (위하고 세션/화면 확인)");
    // 마지막 응답 후 4초 조용하면 완료, 로딩 오버레이가 남아 있으면 더 기다림
    const loading = () => [...document.querySelectorAll("div,span,p")].some(e => visible(e) && /불러오고 있습니다/.test(txt(e)));
    while (Date.now() - start < 180000) {
      status(`조회 중… 응답 ${responses}건 / 마감 ${rows.length}곳`);
      await sleep(1000);
      if (Date.now() - lastResponseAt > 4000 && !loading()) break;
    }
    // "조회할 데이터가 존재하지 않습니다" 알림이 떠 있으면 닫기
    const ab2 = alertBox();
    if (ab2) { const okb = [...ab2.parentElement.querySelectorAll("button")].find(b => visible(b)); if (okb) fire(okb); }
  }

  function sendToServer() {
    // 조회월(payYm) 지급분만 보냄 (반기 업체는 지급월이 같고 귀속월만 다름 → 포함)
    const payload = { kind, payYm, rows: rows.filter(r => !r.payYm || r.payYm === payYm) };
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "efile-close-check", ...payload }, (res) => resolve(res));
    });
  }

  async function run() {
    status("화면 준비 중…");
    const ready = await waitFor(() => queryButton() && monthToggleButtons().length >= 2, 30000, 400);
    if (!ready) { status("화면이 열리지 않았습니다 (위하고 로그인 확인)", "#DC2626"); return; }
    await sleep(800);
    await closeInfoPopup();
    status(`지급기간 ${month}월 설정`);
    await setMonth(0, month);
    await setMonth(1, month);
    status("수임처 전체 선택");
    await selectAllCompanies(); // 확인(enter) 누르면 자동 조회 시작
    // 자동 조회가 안 걸렸으면 조회 버튼
    await sleep(1500);
    if (responses === 0) { const qb = queryButton(); if (qb) fire(qb); }
    await waitForResults();
    status(`서버 전송 중… 마감 ${rows.length}곳`);
    const res = await sendToServer();
    if (!res || !res.ok) { status("서버 전송 실패: " + (res && res.error), "#DC2626"); return; }
    status(`완료 · 마감 ${res.matched}곳 반영${res.unmatched && res.unmatched.length ? ` (미등록 ${res.unmatched.length}곳)` : ""}`, "#15803D");
    await sleep(1500);
    window.close();
  }

  run().catch(err => { status("오류: " + (err && err.message), "#DC2626"); console.error(err); });
})();
