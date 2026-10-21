// 위하고 연간 급여 자동 수집 — 과거 인건비 일괄 채우기 (앱: 원천세 > 과거 인건비 일괄 수집)
// 앱이 거래처·연도·소득유형별로 화면을 하나씩 연다 (주소 해시에 stPayrollYear=1&incomeType=salary|business):
//   근로: #/smarta/humanresource/SWSA0105?sao&cno=..&cd_com=..&yminsa=2025&...&stPayrollYear=1&incomeType=salary&clientId=123&origin=...&overwrite=0
//        → [조회] 클릭 → 위하고가 /smarta/swsa0105/total/ 호출 → 직원×월 지급액(mon_XX_ji)·공제액(mon_XX_gong)
//   일용: #/smarta/humanresource/SWSA0120?sao&... &incomeType=daily  (일용직근로소득조회 '기간별' 탭)
//        → [조회] → /swsa0120/period/list_01/ (사람별 연간 합계) → 첫 행을 누른 뒤 ↓ 키로 한 사람씩 넘기며 /swsa0120/period/detail_01/ (그 사람의 월별)
//        응답 합계가 목록 합계와 같은지로 사람을 확인한다. 인원 제한 없음(도움컴퍼니 414명 실측 사람당 0.2초).
//   사업: #/smarta/humanresource/SWBU0103?sao&... &incomeType=business
//        → 귀속년월 01~12 입력 후 Enter → 위하고가 /smarta/swbu0103/tab1/ 호출 → 지급 건별(tab1_up: nm_krname, ym_rvrs, am_pay, am_income, am_inhabit, custom_am_total)
// API는 요청마다 1회용 서명이라 직접 호출은 불가 → wehago-main-hook.js(MAIN world)가 그 응답을 postMessage 로 넘겨주고,
// 여기서 받아 앱 /api/payroll/backfill 로 보낸 뒤 efile-done 으로 창을 닫는다(다음 주소가 이어서 열림).
(function () {
  const hash = window.location.hash || "";
  if (!/stPayrollYear=1/.test(hash)) return;

  const params = new URLSearchParams(hash.replace(/^#[^?]*\??/, ""));
  const clientId = parseInt(params.get("clientId") || "0", 10);
  const year = params.get("yminsa") || String(new Date().getFullYear());
  const origin = params.get("origin") || "";
  const overwrite = params.get("overwrite") === "1";
  const incomeType = params.get("incomeType") === "business" ? "business" : params.get("incomeType") === "daily" ? "daily" : "salary";
  const clientName = params.get("companyName") || ""; // URLSearchParams 가 이미 해독

  const log = (...a) => console.log("[SaveTax 인건비수집]", ...a);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const bg = (msg) => new Promise(resolve => {
    try { chrome.runtime.sendMessage(msg, res => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (res || { ok: false, error: "응답 없음" }))); }
    catch (e) { resolve({ ok: false, error: e.message }); }
  });
  const api = (body) => bg({ type: "semo-api", base: origin, path: "/api/payroll/backfill", method: "POST", body });

  let received = null; // { data, ymInsa, raw }
  let dailyList = null;    // 일용직: 사람별 연간 합계
  let dailyDetail = null;  // 일용직: 마지막으로 받은 한 사람의 월별
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== "savetax-payroll-year") return;
    let data = null;
    try { data = JSON.parse(d.body); } catch { data = null; }
    if (incomeType === "daily") {
      if (d.kind === "daily_list") dailyList = Array.isArray(data) ? data : [];
      else if (d.kind === "daily_detail") dailyDetail = data;
      return;
    }
    if (d.kind && d.kind !== incomeType) return;
    received = { data, ymInsa: d.ym_insa, raw: data == null ? String(d.body || "").slice(0, 200) : "" };
  });

  const findButton = (label) => [...document.querySelectorAll("button")].find(b => b.offsetParent && b.textContent.trim() === label) || null;
  function pressEscape() {
    for (let i = 0; i < 3; i++) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    }
  }
  function sendKeyToActive(key) {
    const el = document.activeElement || document;
    const keyCode = key === "Enter" ? 13 : key === "Tab" ? 9 : key.charCodeAt(0);
    el.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode, which: keyCode, bubbles: true }));
    if (key !== "Tab") el.dispatchEvent(new KeyboardEvent("keypress", { key, keyCode, which: keyCode, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key, keyCode, which: keyCode, bubbles: true }));
  }

  // 화면별 조회 동작
  async function querySalary() {
    const btn = findButton("조회");
    if (!btn) return false;
    pressEscape();
    btn.click();
    return true;
  }
  // 사업소득조회: 귀속년월 칸 클릭 → Tab → 시작월 01 → 종료월 12 → Enter×3 (content-wehago-business.js 와 같은 조작)
  // ※ 주소의 기수(gisu)가 틀리면 기간 칸이 입력을 안 받는다 — 앱이 개업일로 기수를 계산해 넘긴다.
  const visibleFakes = () => [...document.querySelectorAll(".fake_inputbox")].filter(f => f.getBoundingClientRect().width > 0);
  const periodText = () => visibleFakes().slice(1, 3).map(f => f.textContent.trim().slice(0, 7));
  let lastPeriod = [];
  async function queryBusiness() {
    for (let attempt = 0; attempt < 2; attempt++) {
      const fake = visibleFakes();
      if (!fake.length) return false;
      pressEscape();
      fake[0].click(); await sleep(400);
      sendKeyToActive("Tab"); await sleep(300);
      if (attempt === 0) {
        // 1차: 합성 키 입력 (월 두 자리는 await 없이 연달아 — 숨긴 창은 타이머가 1초 단위라 중간에 초기화됨)
        for (const ch of "01") sendKeyToActive(ch);
        await sleep(500);
        for (const ch of "12") sendKeyToActive(ch);
      } else {
        // 2차: 디버거로 실제 키 입력 (합성 이벤트를 무시하는 경우)
        await bg({ type: "efile-type-keys", text: "01" }); await sleep(500);
        await bg({ type: "efile-type-keys", text: "12" });
      }
      await sleep(400);
      const t = periodText();
      lastPeriod = t;
      if (t[0] === `${year}.01` && t[1] === `${year}.12`) {
        for (let i = 0; i < 3; i++) { sendKeyToActive("Enter"); await sleep(300); }
        return true;
      }
      log(`기간 입력 확인 실패(${attempt + 1}차: ${t.join("~")}) — 다시 시도`);
      await sleep(1000);
    }
    return false;
  }
  // ── 일용직: 기간별 탭 → 조회 → 사람 행을 하나씩 눌러 월별 받기 ──
  function clickCanvas(canvas, x, y) {
    const rect = canvas.getBoundingClientRect();
    for (const type of ["mousedown", "mouseup", "click"]) {
      canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: rect.left + x, clientY: rect.top + y, button: 0 }));
    }
  }
  const leftGrid = () => {
    const box = document.getElementById("Tab3_grid1");
    return box ? box.querySelector("canvas") : null;
  };
  const sameTotal = (detail, person) => {
    try { return Number(detail.grp2.am_duty) === Number(person.am_duty) && Number(detail.grp2.am_incomtax) === Number(person.am_incomtax); }
    catch { return false; }
  };
  async function collectDaily() {
    const tab = findButton("기간별");
    if (!tab) return { error: "일용직근로소득조회 화면에서 '기간별' 탭을 찾지 못했습니다" };
    tab.click(); await sleep(2000);
    const period = [...document.querySelectorAll(".fake_inputbox")].filter(f => f.getBoundingClientRect().width > 0).slice(0, 2).map(f => f.textContent.trim().slice(0, 7));
    if (period[0] !== `${year}.01` || period[1] !== `${year}.12`) return { error: `기간이 ${year}.01~${year}.12가 아닙니다 (${period.join("~")})` };
    dailyList = null; dailyDetail = null;
    const q = findButton("조회"); if (!q) return { error: "조회 버튼 없음" };
    pressEscape(); q.click();
    for (let i = 0; i < 30 && dailyList == null; i++) await sleep(1000);
    if (dailyList == null) return { error: "일용직 목록 응답이 30초 안에 오지 않았습니다" };
    if (dailyList.length === 0) return { rows: [] };
    for (let i = 0; i < 15 && dailyDetail == null; i++) await sleep(500); // 첫 사람은 조회와 함께 자동으로 옴

    // 첫 사람: 조회와 함께 자동으로 온 내역을 쓰고, 안 맞으면 둘째 줄을 눌렀다가 첫 줄을 다시 누른다
    const canvas = leftGrid();
    if (!canvas) return { error: "일용직 사람 목록 표를 찾지 못했습니다" };
    const waitDetail = async (ms) => { for (let w = 0; w < ms / 100 && dailyDetail == null; w++) await sleep(100); return dailyDetail; };
    let first = dailyDetail && sameTotal(dailyDetail, dailyList[0]) ? dailyDetail : null;
    if (!first) {
      if (dailyList.length > 1) { clickCanvas(canvas, 100, 29 + 28); await sleep(1200); }
      dailyDetail = null;
      clickCanvas(canvas, 100, 29);
      const d = await waitDetail(5000);
      first = d && sameTotal(d, dailyList[0]) ? d : null;
    } else {
      clickCanvas(canvas, 100, 29); // 표에 포커스 (이미 선택된 행이라 요청은 안 나감)
      await sleep(300);
    }
    // 둘째 사람부터: 표의 숨은 입력칸에 ↓ 키 → 다음 행이 선택되며 그 사람 내역 요청 (표가 알아서 스크롤 — 인원 제한 없음, 사람당 0.2초 안팎)
    const gridInput = document.activeElement;
    const details = new Array(dailyList.length).fill(null);
    details[0] = first;
    for (let i = 1; i < dailyList.length; i++) {
      dailyDetail = null;
      for (const t of ["keydown", "keyup"]) gridInput.dispatchEvent(new KeyboardEvent(t, { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true }));
      const d = await waitDetail(5000);
      if (!d) continue;
      if (sameTotal(d, dailyList[i])) { details[i] = d; continue; }
      // 어긋났으면(키가 두 번 먹는 등) 앞뒤 두 칸 안에서 맞는 사람으로 맞춘다
      for (const j of [i + 1, i + 2]) {
        if (j < dailyList.length && sameTotal(d, dailyList[j])) { details[j] = d; i = j; break; }
      }
    }
    const rows = [];
    const missed = [];
    dailyList.forEach((person, i) => {
      const detail = details[i];
      if (!detail) { missed.push(String(person.nm_emp || "")); return; }
      for (const m of (detail.grp1 || [])) {
        const ym = String(m.ym_rvrs || "");
        if (!/^\d{6}$/.test(ym)) continue; // 분기 소계 행 제외
        rows.push({
          name: String(person.nm_emp || "").trim(),
          yearMonth: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`,
          gross: Number(m.am_duty || 0),
          incomeTax: Number(m.am_incomtax || 0),
          localTax: Number(m.am_resitax || 0),
          insurance: Number(m.am_natinsur || 0) + Number(m.am_hethinsur || 0) + Number(m.am_mediinsur || 0) + Number(m.am_unempinsur || 0),
          days: Number(m.count_day || 0),
        });
      }
    });
    return { rows, missed, people: dailyList.length };
  }

  const screenReady = () => incomeType === "business" ? document.querySelectorAll(".fake_inputbox").length > 0 : !!findButton("조회");
  const query = () => incomeType === "business" ? queryBusiness() : querySalary();

  async function run() {
    log(`시작 — ${clientName} ${year}년 ${incomeType} (clientId ${clientId})`);
    if (!clientId) { await report({ error: "clientId 없음" }); return finish(); }

    // 화면이 뜰 때까지 (최소화 창은 느릴 수 있어 최대 40초)
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) { await sleep(1000); ready = screenReady(); }
    if (!ready) { await report({ error: "위하고 화면이 뜨지 않았습니다 (로그인 만료?)" }); return finish(); }
    await sleep(2500);
    // 사업소득조회의 기간 칸(마스크 입력)은 최소화된 창에서는 글자를 받지 않는다(2026-10-22 실측: 보이는 탭에선 정상).
    // → 입력하는 동안만 창을 화면에 보이게 한다(포커스는 뺏지 않음). 끝나면 efile-done 이 창을 닫는다.
    // 포커스 없는 창에선 입력칸이 키를 받지 않아 잠깐 앞으로 가져온다(원천세 자동신고와 같은 방식). 일용직 표 클릭도 같은 이유.
    if (incomeType === "business" || incomeType === "daily") { await bg({ type: "efile-show-window", focus: true }); await sleep(1500); }

    if (incomeType === "daily") {
      const r = await collectDaily();
      if (r.error) { await report({ error: r.error }); return finish(); }
      if (r.missed && r.missed.length) log(`월별을 못 받은 사람 ${r.missed.length}명: ${r.missed.join(", ")}`);
      log(`일용직 ${r.people || 0}명 · 월별 ${r.rows.length}건 → 앱으로 전송`);
      const res = await report({ rows: r.rows, partial: r.missed && r.missed.length ? `월별을 못 받은 사람 ${r.missed.length}명: ${r.missed.slice(0, 5).join(", ")}${r.missed.length > 5 ? " 외" : ""}` : null });
      if (!res || !res.ok) log("전송 실패:", res && res.error);
      else log(`저장 ${res.saved}개월, 건너뜀 ${res.skipped}개월`);
      return finish();
    }
    const ok = await query();
    log(ok ? "조회 실행" : "조회 조건 입력 실패");
    if (!ok && incomeType === "business") { await report({ error: `귀속년월 기간을 입력하지 못했습니다 (화면값 ${lastPeriod.join("~") || "없음"})` }); return finish(); }

    // 응답 대기 (20초에 한 번 더 시도, 최대 50초)
    for (let i = 0; i < 50 && !received; i++) {
      await sleep(1000);
      if (i === 20) { await query(); log("조회 재시도"); }
    }
    if (!received) { await report({ error: "조회 응답이 50초 안에 오지 않았습니다" }); return finish(); }
    if (!received.data) { await report({ error: "응답을 읽지 못했습니다: " + received.raw }); return finish(); }
    if (received.ymInsa && String(received.ymInsa) !== String(year)) {
      await report({ error: `화면 연도(${received.ymInsa})가 요청 연도(${year})와 다릅니다` });
      return finish();
    }

    // 필요한 필드만 추려 보낸다 (주민번호·연락처는 보내지 않음)
    let rows;
    if (incomeType === "business") {
      const list = Array.isArray(received.data) ? received.data : (received.data.tab1_up || []);
      rows = list.map(r => ({
        name: String(r.nm_krname || "").trim(),
        yearMonth: String(r.ym_rvrs || r.ym_pay || "").replace(/^(\d{4})(\d{2})$/, "$1-$2"),
        payDate: String(r.dt_pay || ""),
        gross: Number(r.am_pay || 0),
        incomeTax: Number(r.am_income || 0),
        localTax: Number(r.am_inhabit || 0),
        net: Number(r.custom_am_total || 0),
      }));
    } else {
      const list = Array.isArray(received.data) ? received.data : [];
      rows = list.map(r => {
        const o = { name: String(r.nm_krname || r.nm_code || "").trim(), code: String(r.cd_emp || "") };
        for (let m = 1; m <= 12; m++) {
          const k = String(m).padStart(2, "0");
          o[`m${k}_gross`] = Number(r[`mon_${k}_ji`] || 0);
          o[`m${k}_ded`] = Number(r[`mon_${k}_gong`] || 0);
        }
        return o;
      });
    }
    log(`${incomeType === "business" ? "지급 건" : "직원"} ${rows.length}건 → 앱으로 전송`);
    const res = await report({ rows });
    if (!res || !res.ok) log("전송 실패:", res && res.error);
    else log(`저장 ${res.saved}개월, 건너뜀 ${res.skipped}개월`);
    return finish();
  }

  function report(extra) {
    return api({ phase: "batch", clientId, year, incomeType, overwrite, ...extra });
  }

  async function finish() {
    await sleep(300);
    const r = await bg({ type: "efile-done" });
    if (!r || !r.ok) { try { window.close(); } catch {} }
  }

  if (document.readyState === "complete") run();
  else window.addEventListener("load", () => run());
})();
