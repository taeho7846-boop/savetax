// 위하고 전자신고 화면 자동 조작 (원천세 자동신고)
//  - SWER0101 원천징수 전자신고(홈택스용) / SWER0109 지방소득세특별징수전자신고(위택스용)
//  - 해시 stCloseCheck=YYYYMM : 지급기간 월 설정 → 수임처 전체 선택 → 조회 → 마감 목록을 서버에 반영 → 탭 닫기
//  - 해시 stProduce=<jobId>  : 위 조회 후 작업(job)의 대상 거래처 행만 체크 → 제작(F4) → 비밀번호 → 파일 제작
//                              → 내려받는 파일을 가로채 서버에 저장 → 탭 닫기
//  화면 구조(2026-10 실측): 지급기간 월 콤보 2개(WSC_LUXButton 22x26), 수임처 선택 아이콘(WSC_LUXButton 27x20),
//  표는 RealGridJS canvas → wehago-main-hook.js(MAIN world)의 브리지로 rows/check/checkAll 처리
(function () {
  const hash = location.hash || "";
  const chk = hash.match(/stCloseCheck=(\d{6})/);
  const prod = hash.match(/stProduce=([A-Za-z0-9]+)/);
  if (!chk && !prod) return;
  const menu = (hash.match(/\/(SWER01\d\d)\?/) || [])[1];
  const kind = menu === "SWER0101" ? "income" : menu === "SWER0109" ? "local" : null;
  if (!kind) return;
  const label = kind === "income" ? "원천세" : "지방소득세";
  const mode = prod ? "produce" : "check";
  const jobId = prod ? prod[1] : null;
  let payYm = chk ? chk[1] : "";
  let month = payYm.slice(4, 6);

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
  const rows = [];
  let responses = 0, lastResponseAt = 0;
  let capturedFile = null; // { name, base64 } | { error }
  const bg = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : res)); }
    catch (e) { resolve({ ok: false, error: e.message }); }
  });
  const realClick = (x, y) => bg({ type: "efile-real-click", x: Math.round(x), y: Math.round(y) });
  const api = (method, path, body) => bg({ type: "efile-api", method, path, body });

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
  // 로컬 파일 읽기 (확장은 로컬 파일 접근 불가 → background가 디버거로 숨은 file input에 경로를 넣어 주면 FileReader로 읽음)
  //   as: "text" | "base64". 파일이 없으면 null
  async function readLocal(path, as = "text") {
    let probe = document.getElementById("savetax-efile-probe");
    if (!probe) {
      probe = document.createElement("input");
      probe.type = "file"; probe.id = "savetax-efile-probe"; probe.style.display = "none";
      document.documentElement.appendChild(probe);
    }
    probe.value = "";
    const r = await bg({ type: "efile-read-local", path, probeId: "savetax-efile-probe" });
    if (!r || !r.ok) { log("readLocal 실패:", path, r && r.error); return null; }
    const f = probe.files && probe.files[0];
    if (!f) return null;
    try {
      if (as === "base64") {
        const buf = await f.arrayBuffer();
        let bin = ""; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        return btoa(bin);
      }
      return (await f.text()).replace(/^\uFEFF/, "");
    } catch (e) { log("readLocal 읽기 오류(파일 없음?):", path, e.message); return null; }
  }
  // 로컬 도우미(savetax-app://efile-dialog)가 폴더 선택 창을 확인하고 C:\savetax-efile\latest.json 에 기록한 파일을 기다린다
  async function waitLauncherFile(kindWanted, sinceMs, timeoutMs) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const t = await readLocal("C:\\savetax-efile\\latest.json", "text");
      if (t) {
        try {
          let j = JSON.parse(t); if (!Array.isArray(j)) j = [j];
          const e = j.find(x => x && x.kind === kindWanted && Number(x.at) >= sinceMs - 5000);
          if (e && e.path) {
            const b64 = await readLocal(e.path, "base64");
            if (b64) return { name: e.name, base64: b64, localPath: e.path };
          }
        } catch (err) { log("latest.json 파싱 실패:", err.message); }
      }
      await sleep(1500);
    }
    return null;
  }
  // 탭 작업 종료: 숨긴 창이면 background가 다음 주소를 이어서 열거나 창을 닫는다 (응답 없으면 직접 닫기)
  async function finish() {
    const r = await bg({ type: "efile-done" });
    if (!r || !r.ok) { try { window.close(); } catch (e) {} }
  }
  async function waitFor(fn, timeoutMs = 20000, step = 300) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try { const v = await fn(); if (v) return v; } catch {}
      await sleep(step);
    }
    return null;
  }
  // 화면 위 상태 배너 (+ 제작 모드에서는 서버 작업 상태도 갱신)
  let banner;
  let progressTotal = 0; // 조회 대상 수임처 수 (진행률 표시용)
  function status(msg, color = "#1B64DA", state) {
    if (!banner) {
      banner = document.createElement("div");
      banner.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#191F28;color:#fff;font:600 13px/1.4 sans-serif;padding:8px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:70vw";
      document.documentElement.appendChild(banner);
    }
    banner.style.background = color;
    banner.textContent = `SaveTax ${label} ${mode === "produce" ? "파일 제작" : "마감조회"} · ${msg}`;
    log(msg);
    const st = state || "running";
    if (mode === "produce" && jobId) api("PATCH", "/api/withholding/filing/job", { jobId, kind, state: st, message: msg });
    else if (payYm) api("PATCH", "/api/withholding/filing/close-check", { kind, payYm, progress: { state: st, done: responses, total: progressTotal, closed: rows.length, message: msg } });
  }

  // ---- 응답 수집 (MAIN world 후킹 → postMessage) ----
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d) return;
    if (d.source === "savetax-efile" && d.menu === menu) {
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
    } else if (d.source === "savetax-efile-file") {
      capturedFile = d;
    }
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
    // '수임처' 라벨과 같은 줄, 라벨 오른쪽의 작은 아이콘 버튼 (창이 좁아 조건줄이 접히면 지급기간과 다른 줄이 됨)
    const lab = [...document.querySelectorAll("strong,span,div,label")].find(e => visible(e) && e.childElementCount === 0 && txt(e) === "수임처");
    const top = lab ? rect(lab).top : filterRowTop(); if (top == null) return null;
    const left = lab ? rect(lab).left : 0;
    return [...document.querySelectorAll("button.WSC_LUXButton")].filter(b => {
      const r = rect(b); return visible(b) && Math.abs(r.top - top) < 30 && r.left > left && r.width >= 24 && r.width <= 32 && r.height >= 16 && r.height <= 24;
    }).sort((a, b) => rect(a).left - rect(b).left)[0] || null;
  }
  const monthValueOf = (toggle) => {
    const box = toggle.parentElement; // [값 div][토글 버튼]
    const v = [...box.querySelectorAll("div")].find(d => d.childElementCount === 0 && /^(0[1-9]|1[0-2])$/.test(txt(d)));
    return v ? txt(v) : "";
  };
  const queryButton = () => [...document.querySelectorAll("button")].find(b => visible(b) && txt(b) === "조회" && rect(b).top < 400);
  const alertBox = () => [...document.querySelectorAll(".WSC_LUXAlert .dialog_alert, .dialog_alert")].find(visible);
  const bottomBar = () => [...document.querySelectorAll("div,span")].find(e => visible(e) && /제작대상 선택한 회사/.test(txt(e)) && txt(e).length < 80);

  async function closeInfoPopup() {
    // "제출자등록 탭을 확인해주십시오" 안내 팝업 → 확인
    const btn = await waitFor(() => [...document.querySelectorAll("button")].find(b => visible(b) && txt(b) === "확인" && (b.closest("[class*=dialog]") || b.closest("[class*=Dialog]"))), 4000, 200);
    if (btn) { fire(btn); await sleep(500); }
  }
  async function dismissAlert() {
    const ab = alertBox();
    if (!ab) return "";
    const t = txt(ab).replace(/\s+/g, " ");
    const okb = [...ab.parentElement.querySelectorAll("button")].find(b => visible(b));
    if (okb) fire(okb);
    await sleep(300);
    return t;
  }

  async function setMonth(idx, mm) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const toggles = monthToggleButtons();
      if (toggles.length < 2) throw new Error("지급기간 월 선택 버튼을 찾지 못했습니다");
      if (monthValueOf(toggles[idx]) === mm) return;
      const tr = rect(toggles[idx]);
      // 1·2회차는 합성 클릭, 3회차는 디버거 실클릭(비활성 탭 등에서 합성 이벤트가 안 먹을 때)
      if (attempt < 2) fire(toggles[idx]); else await realClick(tr.left + tr.width / 2, tr.top + tr.height / 2);
      const tTop = tr.bottom;
      const findOpt = () => [...document.querySelectorAll("div,li")].find(e => visible(e) && e.childElementCount === 0 && txt(e) === mm && rect(e).top > tTop && rect(e).top < tTop + 400);
      const opt = await waitFor(findOpt, 2500, 100);
      if (!opt) { await sleep(700); continue; }
      if (attempt < 2) fire(opt); else { const orr = rect(opt); await realClick(orr.left + orr.width / 2, orr.top + orr.height / 2); }
      await sleep(700);
      if (monthValueOf(monthToggleButtons()[idx]) === mm) return;
    }
    throw new Error(`지급기간 ${idx === 0 ? "시작" : "종료"}월을 ${mm}로 설정하지 못했습니다`);
  }

  // 회사 코드도움 팝업에서 전체 선택 후 확인
  //  1순위: RealGrid 브리지로 팝업 표 checkAll (팝업 표 = 가장 나중에 만들어진 살아있는 표)
  //  2순위: 표가 canvas라 체크 여부를 픽셀 색으로 보고 헤더 체크박스를 디버거 실클릭
  async function selectAllCompanies(scopeCnos) {
    const pb = pickerButton();
    if (!pb) throw new Error("수임처 선택 버튼을 찾지 못했습니다");
    await dismissAlert();
    fire(pb);
    const dlg = await waitFor(() => [...document.querySelectorAll("div")].find(d => visible(d) && txt(d).startsWith("회사 코드도움") && rect(d).width > 400 && rect(d).width < 1200), 6000, 200);
    if (!dlg) throw new Error("회사 코드도움 팝업이 열리지 않았습니다");
    await sleep(800);

    let done = false;
    try {
      // 팝업 표(회사 목록)는 필드로 구분: nm_krcom 있고 am_a99(세액) 없음. 등록 순서는 믿을 수 없음(메인 표보다 먼저 만들어지기도 함).
      // 행이 비동기로 채워지므로(처음엔 0~1행) 행 수가 1초간 변하지 않을 때까지 대기
      const pickPopup = (infos) => {
        const cand = infos.filter(x => x.alive && x.rowCount > 1 && x.fields.includes("nm_krcom") && !x.fields.includes("am_a99"));
        cand.sort((a, b) => b.rowCount - a.rowCount);
        return cand[0] || null;
      };
      let popup = null, stableSince = 0, lastCount = -1;
      const until = Date.now() + 15000;
      while (Date.now() < until) {
        const p = pickPopup(await bridge("grids"));
        if (p && p.rowCount === lastCount) {
          if (!stableSince) stableSince = Date.now();
          if (Date.now() - stableSince >= 1000 && p.rowCount > 1) { popup = p; break; }
        } else { stableSince = 0; lastCount = p ? p.rowCount : -1; }
        await sleep(250);
      }
      if (popup) {
        let picked = null;
        if (scopeCnos && scopeCnos.length) {
          // 관할 거래처(company_no = 위하고 cno)만 체크 → 조회 요청이 그 수만큼만 나감
          const prow = await bridge("rows", { index: popup.index });
          const want = new Set(scopeCnos.map(String));
          const idxs = [];
          prow.forEach((r, i) => { if (want.has(String(r.company_no))) idxs.push(i); });
          if (idxs.length > 0) {
            await bridge("checkAll", { index: popup.index, checked: false });
            picked = await bridge("check", { index: popup.index, rows: idxs, checked: true });
            log("팝업 표 범위선택", idxs.length, "/", popup.rowCount, "→ 체크", picked && picked.length);
            if (picked && picked.length === idxs.length) { done = true; progressTotal = idxs.length; }
          } else log("범위에 해당하는 회사가 팝업 표에 없음 → 전체 선택");
        }
        if (!done) {
          const checked = await bridge("checkAll", { index: popup.index, checked: true });
          log("팝업 표 전체선택", popup.index, checked && checked.length, "/", popup.rowCount);
          if (checked && checked.length >= popup.rowCount) { done = true; progressTotal = popup.rowCount; }
        }
      } else log("팝업 표 행 수가 안정되지 않음 (마지막", lastCount, "행)");
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
    await waitFor(() => responses > 0 || alertBox(), 40000, 300);
    const ab = alertBox();
    if (ab && responses === 0) {
      const t = await dismissAlert();
      // "조회할 데이터가 존재하지 않습니다" = 마감된 수임처가 하나도 없음 → 정상(0건)
      if (!/존재하지 않습니다/.test(t)) throw new Error("위하고 안내: " + t);
      return;
    }
    if (responses === 0) throw new Error("조회 응답이 없습니다 (위하고 세션/화면 확인)");
    const loading = () => [...document.querySelectorAll("div,span,p")].some(e => visible(e) && /불러오고 있습니다/.test(txt(e)));
    while (Date.now() - start < 180000) {
      status(progressTotal ? `조회 중 ${responses}/${progressTotal} · 마감 ${rows.length}곳` : `조회 중… 응답 ${responses}건 / 마감 ${rows.length}곳`);
      await sleep(1500);
      if (Date.now() - lastResponseAt > 4000 && !loading()) break;
    }
    await dismissAlert();
  }

  async function queryClosedCompanies(scopeCnos) {
    status("위하고 화면 여는 중…");
    const ready = await waitFor(() => queryButton() && monthToggleButtons().length >= 2, 30000, 400);
    if (!ready) throw new Error("화면이 열리지 않았습니다 (위하고 로그인 확인)");
    await sleep(800);
    await closeInfoPopup();
    status(`지급기간 ${month}월 설정`);
    await setMonth(0, month);
    await setMonth(1, month);
    status(scopeCnos && scopeCnos.length ? `관할 거래처 ${scopeCnos.length}곳 선택 중…` : "수임처 전체 선택 중…");
    await selectAllCompanies(scopeCnos); // 확인(enter) 누르면 자동 조회 시작
    await sleep(1500);
    if (responses === 0) { const qb = queryButton(); if (qb) fire(qb); }
    await waitForResults();
  }

  // ===== 마감상태 조회 모드 =====
  async function runCheck() {
    let scopeCnos = null;
    try {
      const sc = await api("GET", `/api/withholding/filing/close-check?ym=${payYm.slice(0, 4)}-${payYm.slice(4, 6)}&scope=1`);
      if (sc && sc.ok && Array.isArray(sc.cnos) && sc.cnos.length) scopeCnos = sc.cnos;
    } catch (e) { log("관할 목록 조회 실패 → 전체 조회", e.message); }
    await queryClosedCompanies(scopeCnos);
    status(`서버 전송 중… 마감 ${rows.length}곳`);
    const payload = { kind, payYm, rows: rows.filter(r => !r.payYm || r.payYm === payYm), scopeCnos: scopeCnos || undefined };
    const res = await bg({ type: "efile-close-check", ...payload });
    if (!res || !res.ok) throw new Error("서버 전송 실패: " + (res && res.error));
    status(`완료 · 마감 ${res.matched}곳 반영${res.unmatched && res.unmatched.length ? ` (미등록 ${res.unmatched.length}곳)` : ""}`, "#15803D", "done");
    await sleep(1500);
    await finish();
  }

  // ===== 파일 제작 모드 =====
  async function mainGrid() {
    const infos = await bridge("grids");
    const cand = infos.filter(x => x.alive && x.rowCount > 0 && x.fields.includes("am_a99"));
    cand.sort((a, b) => b.rowCount - a.rowCount);
    return cand[0] || null;
  }
  // 비밀번호 입력: 위하고 LSinput은 DOM value만 바꾸면 화면엔 보여도 내부 상태가 비어 "최소 8~15자리" 경고가 남
  // (2026-10 실측) → 입력칸을 실클릭해 포커스를 준 뒤 디버거로 실제 키 입력(글자별 keyDown/keyUp)
  async function typePassword(dlg, pw) {
    const inp = await waitFor(() => dlg.querySelector("input"), 3000, 100);
    if (!inp) throw new Error("비밀번호 입력칸을 찾지 못했습니다");
    // 보이는 입력 상자 = 0x0 숨은 input의 부모(없으면 input 위치 기준)
    let box = inp.parentElement;
    for (let i = 0; i < 3 && box && rect(box).width < 20; i++) box = box.parentElement;
    const br = box && rect(box).width >= 20 ? rect(box) : { left: rect(inp).left, top: rect(inp).top, width: 120, height: 24 };
    await realClick(br.left + Math.min(40, br.width / 2), br.top + br.height / 2);
    await sleep(300);
    if (document.activeElement !== inp) { inp.focus(); await sleep(150); }
    // 남아있는 값 비우기
    if (inp.value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(inp, ""); inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const r = await bg({ type: "efile-type-keys", text: pw });
    if (!r || !r.ok) throw new Error("비밀번호 키 입력 실패: " + (r && r.error));
    await sleep(500);
    if (inp.value !== pw) {
      log("키 입력 후 값 불일치(" + inp.value.length + "자) → setter 보정");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(inp, pw);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(300);
    }
    // 포커스를 빼서 change/blur 처리까지 끝나게
    inp.dispatchEvent(new Event("blur", { bubbles: true }));
    inp.blur();
    await sleep(300);
  }

  async function runProduce() {
    const job = await api("GET", `/api/withholding/filing/job?id=${encodeURIComponent(jobId)}&detail=1`);
    if (!job || !job.ok) throw new Error("작업 정보를 받지 못했습니다: " + (job && job.error));
    payYm = job.payYm; month = payYm.slice(4, 6);
    if (!job.password) throw new Error("설정에 전자신고 파일 비밀번호가 없습니다");
    const targetCnos = new Set(job.targets.map(t => String(t.cno)));

    await queryClosedCompanies([...targetCnos]);

    const grid = await mainGrid();
    if (!grid) throw new Error("마감 수임처 표를 찾지 못했습니다 (마감된 거래처 없음)");
    const gridRows = await bridge("rows", { index: grid.index });
    const idxs = [], produced = [], skipped = [];
    gridRows.forEach((r, i) => {
      if (!targetCnos.has(String(r.cno))) return;
      if (String(r.yn_except || "").toUpperCase() === "Y") { skipped.push({ cno: r.cno, name: r.nm_krcom, reason: "제작제외 표시" }); return; }
      if (r.ym_pay && r.ym_pay !== payYm) { skipped.push({ cno: r.cno, name: r.nm_krcom, reason: `지급월 ${r.ym_pay}` }); return; }
      idxs.push(i); produced.push(String(r.cno));
    });
    for (const t of job.targets) {
      if (!gridRows.some(r => String(r.cno) === String(t.cno))) skipped.push({ cno: t.cno, name: t.name, reason: `${label} 미마감` });
    }
    if (idxs.length === 0) {
      await api("POST", "/api/withholding/filing/produce-result", { jobId, kind, error: `제작 대상 없음 (${skipped.map(s => s.name + ":" + s.reason).join(", ")})` });
      status("제작할 거래처가 없습니다", "#DC2626", "error");
      await sleep(2500); await finish(); return;
    }

    status(`대상 ${idxs.length}곳 선택`);
    await bridge("check", { index: grid.index, rows: idxs, checked: true });
    await sleep(600);
    const bar = bottomBar();
    const m = bar && txt(bar).match(/선택한 회사\s*:\s*(\d+)/);
    if (!m || Number(m[1]) !== idxs.length) log("하단 선택 건수 불일치:", bar && txt(bar));

    const mk = [...document.querySelectorAll("button")].find(b => visible(b) && /^제작\(F4\)$/.test(txt(b)));
    if (!mk) throw new Error("제작(F4) 버튼을 찾지 못했습니다");
    fire(mk);
    const dlg = await waitFor(() => [...document.querySelectorAll("div")].find(d => visible(d) && txt(d).startsWith("전자신고 파일 제작") && rect(d).width > 300 && rect(d).width < 900), 8000, 200);
    if (!dlg) { const t = await dismissAlert(); throw new Error("제작 창이 열리지 않았습니다" + (t ? " · " + t : "")); }
    await sleep(500);
    status("비밀번호 입력");
    await typePassword(dlg, job.password);

    const mkBtn = [...dlg.querySelectorAll("button")].find(b => visible(b) && /전자신고 파일 제작/.test(txt(b)));
    if (!mkBtn) throw new Error("'전자신고 파일 제작' 버튼을 찾지 못했습니다");
    status("파일 제작 중…");
    const clickedAt = Date.now();
    capturedFile = null;
    { const mr = rect(mkBtn); await realClick(mr.left + mr.width / 2, mr.top + mr.height / 2); } // 사람이 누르는 것과 같은 실클릭

    // 위하고 필수 에이전트가 '폴더 선택' 창을 띄우고 선택한 폴더에 파일을 쓴다(브라우저 다운로드 아님, 2026-10 실측).
    // 사이트가 미리 실행해 둔 로컬 도우미(savetax-app://efile-dialog)가 그 창을 확인하고 파일을 C:\savetax-efile\ 로 복사해 두므로
    // 그 기록(latest.json)을 기다린다. 비밀번호 경고 등 알림이 먼저 뜨면 오류 처리.
    await sleep(1500);
    { const t = await dismissAlert(); if (/8~15자리|비밀번호/.test(t)) throw new Error("위하고가 비밀번호를 인식하지 못했습니다: " + t); }
    status("폴더 선택 창 확인 대기 중… (로컬 도우미)");
    let launched = await waitLauncherFile(kind, clickedAt, 90000);
    if (!launched && capturedFile && !capturedFile.error) launched = { name: capturedFile.name, base64: capturedFile.base64, localPath: "" };
    if (!launched) {
      const t = await dismissAlert();
      throw new Error("제작된 파일을 받지 못했습니다 — 로컬 도우미(savetax-app) 설치 여부와 '폴더 선택' 창을 확인하세요" + (t ? " · " + t : ""));
    }
    await dismissAlert();

    status(`서버 저장 중… ${launched.name}`);
    const res = await api("POST", "/api/withholding/filing/produce-result", {
      jobId, kind, fileName: launched.name, fileBase64: launched.base64, localPath: launched.localPath, produced, skipped,
    });
    if (!res || !res.ok) throw new Error("서버 저장 실패: " + (res && res.error));
    status(`완료 · ${produced.length}곳 제작 (${capturedFile.name})`, "#15803D", "done");
    await sleep(1500);
    await finish();
  }

  (mode === "produce" ? runProduce() : runCheck()).catch(async (err) => {
    const msg = (err && err.message) || String(err);
    console.error(err);
    if (mode === "produce" && jobId) await api("POST", "/api/withholding/filing/produce-result", { jobId, kind, error: msg });
    status("오류: " + msg, "#DC2626", "error");
    await sleep(4000);
    await finish();
  });
})();
