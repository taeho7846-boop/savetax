// 위하고 연간 급여 자동 수집 — 과거 인건비 일괄 채우기 (앱: 원천세 > 과거 인건비 일괄 수집)
// 앱이 거래처·연도·소득유형별로 화면을 하나씩 연다 (주소 해시에 stPayrollYear=1&incomeType=salary|business):
//   근로: #/smarta/humanresource/SWSA0105?sao&cno=..&cd_com=..&yminsa=2025&...&stPayrollYear=1&incomeType=salary&clientId=123&origin=...&overwrite=0
//        → [조회] 클릭 → 위하고가 /smarta/swsa0105/total/ 호출 → 직원×월 지급액(mon_XX_ji)·공제액(mon_XX_gong)
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
  const incomeType = params.get("incomeType") === "business" ? "business" : "salary";
  const clientName = params.get("companyName") || ""; // URLSearchParams 가 이미 해독

  const log = (...a) => console.log("[SaveTax 인건비수집]", ...a);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const bg = (msg) => new Promise(resolve => {
    try { chrome.runtime.sendMessage(msg, res => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (res || { ok: false, error: "응답 없음" }))); }
    catch (e) { resolve({ ok: false, error: e.message }); }
  });
  const api = (body) => bg({ type: "semo-api", base: origin, path: "/api/payroll/backfill", method: "POST", body });

  let received = null; // { data, ymInsa, raw }
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== "savetax-payroll-year") return;
    if (d.kind && d.kind !== incomeType) return;
    let data = null;
    try { data = JSON.parse(d.body); } catch { data = null; }
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
  async function queryBusiness() {
    const fake = document.querySelectorAll(".fake_inputbox");
    if (!fake.length) return false;
    pressEscape();
    fake[0].click(); await sleep(300);
    sendKeyToActive("Tab"); await sleep(200);
    for (const ch of "01") { sendKeyToActive(ch); await sleep(150); }
    await sleep(300);
    for (const ch of "12") { sendKeyToActive(ch); await sleep(150); }
    await sleep(200);
    for (let i = 0; i < 3; i++) { sendKeyToActive("Enter"); await sleep(200); }
    return true;
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
    await sleep(1500);
    await query();
    log("조회 실행");

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
