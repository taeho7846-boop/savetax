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
  let respBase = 0;   // 수임처 선택 '확인'을 누른 시점의 응답 수 — 그 전에 화면이 스스로 한 조회(현재 회사 기본 조회 등)는 세지 않는다
  let lastAlert = ""; // 조회 중 위하고가 띄운 안내 문구 (오류 원인 표시용)
  let capturedFile = null; // { name, base64 } | { error }
  let savedToServer = false; // 제작 파일이 서버에 저장됐는지
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
  // 로컬 도우미가 남기는 상태(C:\savetax-efile\helper.json): { startedAt, until, seenAt(폴더 선택 창을 마지막으로 본 시각) }
  // 새 도우미만 남긴다. 없거나 오래됐으면 null
  async function helperState() {
    const t = await readLocal("C:\\savetax-efile\\helper.json", "text");
    if (!t) return null;
    try { const h = JSON.parse(t); return h && h.startedAt && Date.now() < Number(h.until || 0) + 5000 ? h : null; } catch (e) { return null; }
  }
  // 이 창을 화면에 보이게 한다. 숨은(최소화·가려진) 창은 화면을 그리지 않아, 방금 뜬 창의 버튼 좌표로 보낸 실클릭이 빗나간다.
  // 먼저 포커스 없이 꺼내 보고, 그래도 숨김 상태면(다른 창에 완전히 가려짐) 맨 앞으로 가져온다.
  async function ensureVisibleWindow(forceFront) {
    for (const focus of forceFront ? [true] : [false, true]) {
      if (!document.hidden && !forceFront) break;
      await bg({ type: "efile-show-window", focus });
      const t0 = Date.now();
      while (document.hidden && Date.now() - t0 < 2500) await sleep(150);
      if (!document.hidden) break;
    }
    // 화면이 실제로 한 번 그려질 때까지 (숨김이면 rAF가 돌지 않으므로 시간 제한)
    await Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), sleep(1500)]);
    await sleep(300);
    log("창 보이기:", document.hidden ? "여전히 숨김" : "보임");
    return !document.hidden;
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
            // 체크된 행(데이터 행 번호)이 정말 원하는 회사인지 확인 — 표가 정렬돼 번호가 어긋나면 엉뚱한 회사가 조회됨
            const pickOk = Array.isArray(picked) && picked.length === idxs.length
              && picked.every(i => typeof i !== "number" || (prow[i] && want.has(String(prow[i].company_no))));
            if (pickOk) { done = true; progressTotal = idxs.length; }
            else log("범위선택 결과가 대상과 다름 → 전체 선택으로 진행", picked);
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
    respBase = responses; lastAlert = "";
    fire(ok);
    await sleep(800);
  }

  async function waitForResults() {
    const start = Date.now();
    await waitFor(() => responses > respBase || alertBox(), 40000, 300);
    const ab = alertBox();
    if (ab && responses === respBase) {
      const t = await dismissAlert();
      lastAlert = t;
      // "조회할 데이터가 존재하지 않습니다" = 마감된 수임처가 하나도 없음 → 정상(0건)
      if (!/존재하지 않습니다/.test(t)) throw new Error("위하고 안내: " + t);
      return;
    }
    if (responses === respBase) throw new Error("조회 응답이 없습니다 (위하고 세션/화면 확인)");
    const loading = () => [...document.querySelectorAll("div,span,p")].some(e => visible(e) && /불러오고 있습니다/.test(txt(e)));
    while (Date.now() - start < 180000) {
      const got = responses - respBase;
      status(progressTotal ? `조회 중 ${Math.min(got, progressTotal)}/${progressTotal} · 마감 ${rows.length}곳` : `조회 중… 응답 ${got}건 / 마감 ${rows.length}곳`);
      await sleep(1500);
      if (Date.now() - lastResponseAt > 4000 && !loading()) break;
    }
    const t = await dismissAlert();
    if (t) lastAlert = t;
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
    if (responses === respBase) { const qb = queryButton(); if (qb) fire(qb); }
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
    // 메인 표 = 세액(am_a99) 또는 지급년월(ym_pay)+회사번호(cno) 필드가 있는 표 (회사 코드도움 팝업 표는 company_no만 있음)
    const cand = infos.filter(x => x.alive && x.rowCount > 0 && (x.fields.includes("am_a99") || (x.fields.includes("ym_pay") && x.fields.includes("cno"))));
    cand.sort((a, b) => b.rowCount - a.rowCount);
    return cand[0] || null;
  }
  // 조회 결과가 표에 채워지기까지 시간이 걸릴 수 있어(숨긴 창은 타이머가 느림) 대상 거래처 행이 보일 때까지 기다린다
  async function waitMainGrid(targetCnos, timeoutMs) {
    const until = Date.now() + timeoutMs;
    let grid = null, gridRows = [];
    while (Date.now() < until) {
      try {
        grid = await mainGrid();
        if (grid) {
          gridRows = await bridge("rows", { index: grid.index });
          if (gridRows.some(r => targetCnos.has(String(r.cno)))) break;
        }
      } catch (e) { log("표 읽기 재시도:", e.message); }
      await sleep(500);
    }
    return { grid, gridRows };
  }
  // 오류 원인 표시용: 지금 화면에 있는 표들의 행 수·필드 요약
  async function gridSummary() {
    try {
      const infos = (await bridge("grids")).filter(x => x.alive);
      // 표 수집 상태(전역 라이브러리 유무·패치 수·등록된 표·화면에서 직접 찾은 표·canvas 수)도 같이 남긴다
      let hook = "";
      try {
        const d = await bridge("diag");
        hook = ` (수집: 전역 ${d.rgjs || d.rg2 ? "있음" : "없음"}, 패치 ${d.patched}, 등록 ${d.grids}, 직접찾음 ${d.discovered}, 캔버스 ${d.canvases})`;
      } catch (e) { hook = " (수집 상태 확인 불가 — 확장을 새로고침했는지 확인)"; }
      return (infos.length ? infos.map(x => `${x.rowCount}행[${x.fields.slice(0, 4).join(",")}]`).join(" / ") : "없음") + hook;
    } catch (e) { return "읽기 실패(" + e.message + ")"; }
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

    const hasTarget = (rs) => rs.some(r => targetCnos.has(String(r.cno)));
    let { grid, gridRows } = await waitMainGrid(targetCnos, 10000);
    if (!hasTarget(gridRows)) {
      // 표가 비었거나 대상이 안 보임 → 조회를 한 번 더 눌러 다시 확인
      status("조회 결과 다시 확인 중…");
      const qb = queryButton();
      if (qb) {
        respBase = responses; lastAlert = "";
        fire(qb);
        try { await waitForResults(); } catch (e) { log("재조회:", e.message); }
        ({ grid, gridRows } = await waitMainGrid(targetCnos, 10000));
      }
    }
    if (!grid) {
      const why = /존재하지 않습니다/.test(lastAlert)
        ? `위하고가 "${lastAlert}"라고 답했습니다 (${month}월 지급분 ${label} 마감 자료 없음)`
        : `조회 결과 표를 읽지 못했습니다 · 응답 ${responses - respBase}건${lastAlert ? " · 위하고 안내: " + lastAlert : ""} · 화면 표: ${await gridSummary()}`;
      throw new Error(why);
    }
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
    // 비밀번호 입력칸·제작 버튼은 좌표로 실클릭하므로, 그 전에 창을 보이게 해 화면이 그려진 상태로 만든다
    await ensureVisibleWindow(false);
    status("비밀번호 입력");
    await typePassword(dlg, job.password);

    const findMkBtn = () => [...dlg.querySelectorAll("button")].find(b => visible(b) && /전자신고 파일 제작/.test(txt(b)));
    const mkBtn = findMkBtn();
    if (!mkBtn) throw new Error("'전자신고 파일 제작' 버튼을 찾지 못했습니다");
    status("파일 제작 중…");
    const clickedAt = Date.now();
    capturedFile = null;
    const clickMake = async () => { const b = findMkBtn(); if (!b) return false; const mr = rect(b); await realClick(mr.left + mr.width / 2, mr.top + mr.height / 2); return true; };
    await clickMake(); // 사람이 누르는 것과 같은 실클릭

    // 위하고 필수 에이전트가 '폴더 선택' 창을 띄우고 선택한 폴더에 파일을 쓴다(브라우저 다운로드 아님, 2026-10 실측).
    // 사이트가 미리 실행해 둔 로컬 도우미(savetax-app://efile-dialog)가 그 창을 확인하고 파일을 C:\savetax-efile\ 로 복사해 두므로
    // 그 기록(latest.json)을 기다린다. 비밀번호 경고 등 알림이 먼저 뜨면 오류 처리.
    await sleep(1500);
    { const t = await dismissAlert(); if (/8~15자리|비밀번호/.test(t)) throw new Error("위하고가 비밀번호를 인식하지 못했습니다: " + t); }
    status("폴더 선택 창 확인 대기 중… (로컬 도우미)");
    let launched = await waitLauncherFile(kind, clickedAt, 12000);
    // 버튼이 안 눌린 경우 다시 누른다. 조건: 제작 창이 그대로 떠 있고 + 도우미가 클릭 이후 저장 창(폴더 선택)을 본 적이 없음.
    //  (도우미가 창을 봤다면 저장이 진행 중이므로 다시 누르면 두 번 제작된다 → 누르지 않는다. 도우미 상태를 알 수 없어도 누르지 않는다)
    for (let attempt = 1; !launched && attempt <= 2; attempt++) {
      if (!document.contains(dlg) || !visible(dlg) || !findMkBtn()) break;
      const h = await helperState();
      if (!h || Number(h.seenAt || 0) >= clickedAt - 2000) break;
      status(`제작 버튼이 눌리지 않아 다시 누르는 중… (${attempt}차)`);
      await ensureVisibleWindow(true);
      if (attempt === 1) await clickMake();
      else { const inp = dlg.querySelector("input"); if (inp) inp.focus(); await sleep(200); await bg({ type: "efile-press-enter" }); } // 버튼 이름이 '…제작(Enter)'
      await sleep(1500);
      { const t = await dismissAlert(); if (/8~15자리|비밀번호/.test(t)) throw new Error("위하고가 비밀번호를 인식하지 못했습니다: " + t); }
      launched = await waitLauncherFile(kind, clickedAt, 20000);
    }
    if (!launched) launched = await waitLauncherFile(kind, clickedAt, 40000);
    if (!launched && capturedFile && !capturedFile.error) launched = { name: capturedFile.name, base64: capturedFile.base64, localPath: "" };
    if (!launched) {
      const t = await dismissAlert();
      // 원인 파악용: 제작 창이 아직 떠 있는지(= 버튼이 안 눌렸거나 위하고가 반응하지 않음), 화면 크기·숨김 상태
      const stillOpen = visible(dlg) && document.contains(dlg);
      const btnThere = stillOpen && [...dlg.querySelectorAll("button")].some(b => visible(b) && /전자신고 파일 제작/.test(txt(b)));
      const diag = ` · 제작 창 ${stillOpen ? (btnThere ? "그대로 떠 있음" : "떠 있음(버튼 없음)") : "닫힘"} · 화면 ${window.innerWidth}x${window.innerHeight}${document.hidden ? " 숨김" : ""}`;
      throw new Error("제작된 파일을 받지 못했습니다 — 위하고 저장 창(폴더 선택)이 뜨지 않았거나 로컬 도우미(savetax-app)가 없습니다" + (t ? " · " + t : "") + diag);
    }
    await dismissAlert();

    status(`서버 저장 중… ${launched.name}`);
    const res = await api("POST", "/api/withholding/filing/produce-result", {
      jobId, kind, fileName: launched.name, fileBase64: launched.base64, localPath: launched.localPath, produced, skipped,
    });
    if (!res || !res.ok) throw new Error("서버 저장 실패: " + (res && res.error));
    savedToServer = true; // 여기부터는 무슨 일이 있어도 '오류'로 뒤집지 않는다 (파일은 이미 서버에 저장됨)
    status(`완료 · ${produced.length}곳 제작 (${launched.name})`, "#15803D", "done");
    await sleep(1500);
    await finish();
  }

  (mode === "produce" ? runProduce() : runCheck()).catch(async (err) => {
    const msg = (err && err.message) || String(err);
    console.error(err);
    if (savedToServer) { log("저장 이후 오류(무시):", msg); await sleep(1500); await finish(); return; }
    if (mode === "produce" && jobId) await api("POST", "/api/withholding/filing/produce-result", { jobId, kind, error: msg });
    status("오류: " + msg, "#DC2626", "error");
    await sleep(4000);
    await finish();
  });
})();
