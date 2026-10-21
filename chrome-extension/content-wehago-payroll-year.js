// 위하고 '월별급상여수당지급현황'(SWSA0105) 연간 급여 자동 수집 — 과거 인건비 일괄 채우기
// 앱(원천세 > 과거 인건비 일괄 수집)이 이 화면을 거래처·연도별로 하나씩 연다 (주소 해시에 stPayrollYear=1):
//   #/smarta/humanresource/SWSA0105?sao&cno=..&cd_com=..&yminsa=2025&...&stPayrollYear=1&clientId=123&origin=https://app.savetaxnh.com&overwrite=0
// 화면의 [조회] 버튼만 누르면 위하고가 /smarta/swsa0105/total/ 을 호출해 직원×월(지급액·공제액)을 돌려준다.
// API는 요청마다 1회용 서명이라 직접 호출은 불가 → wehago-main-hook.js(MAIN world)가 그 응답을 postMessage 로 넘겨주고,
// 여기서 받아 앱 /api/payroll/backfill 로 보낸 뒤 efile-done 으로 창을 닫는다(다음 거래처 주소가 이어서 열림).
(function () {
  const hash = window.location.hash || "";
  if (!/stPayrollYear=1/.test(hash)) return;

  const params = new URLSearchParams(hash.replace(/^#[^?]*\??/, ""));
  const clientId = parseInt(params.get("clientId") || "0", 10);
  const year = params.get("yminsa") || String(new Date().getFullYear());
  const origin = params.get("origin") || "";
  const overwrite = params.get("overwrite") === "1";
  const clientName = params.get("companyName") || ""; // URLSearchParams 가 이미 해독

  const log = (...a) => console.log("[SaveTax 인건비수집]", ...a);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const bg = (msg) => new Promise(resolve => {
    try { chrome.runtime.sendMessage(msg, res => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (res || { ok: false, error: "응답 없음" }))); }
    catch (e) { resolve({ ok: false, error: e.message }); }
  });
  const api = (body) => bg({ type: "semo-api", base: origin, path: "/api/payroll/backfill", method: "POST", body });

  let received = null; // { rows, ym_insa }
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== "savetax-payroll-year") return;
    let rows = [];
    try { rows = JSON.parse(d.body); } catch { rows = null; }
    received = { rows: Array.isArray(rows) ? rows : null, ymInsa: d.ym_insa, raw: rows == null ? String(d.body || "").slice(0, 200) : "" };
  });

  function findButton() {
    return [...document.querySelectorAll("button")].find(b => b.offsetParent && b.textContent.trim() === "조회") || null;
  }
  function pressEscape() {
    for (let i = 0; i < 3; i++) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    }
  }

  async function run() {
    log(`시작 — ${clientName} ${year}년 (clientId ${clientId})`);
    if (!clientId) { await report({ error: "clientId 없음" }); return finish(); }

    // 화면이 뜰 때까지 (최소화 창은 느릴 수 있어 최대 40초)
    let btn = null;
    for (let i = 0; i < 40 && !btn; i++) { await sleep(1000); btn = findButton(); }
    if (!btn) { await report({ error: "위하고 화면에서 조회 버튼을 찾지 못했습니다 (로그인 만료?)" }); return finish(); }
    await sleep(1500);
    pressEscape();
    btn.click();
    log("조회 클릭");

    // 응답 대기 (20초에 한 번 더 눌러보고, 최대 50초)
    for (let i = 0; i < 50 && !received; i++) {
      await sleep(1000);
      if (i === 20) { const b2 = findButton(); if (b2) { pressEscape(); b2.click(); log("조회 재클릭"); } }
    }
    if (!received) { await report({ error: "조회 응답이 50초 안에 오지 않았습니다" }); return finish(); }
    if (!received.rows) { await report({ error: "응답을 읽지 못했습니다: " + received.raw }); return finish(); }
    if (received.ymInsa && String(received.ymInsa) !== String(year)) {
      await report({ error: `화면 연도(${received.ymInsa})가 요청 연도(${year})와 다릅니다` });
      return finish();
    }

    // 필요한 필드만 추려 보낸다 (주민번호 등은 보내지 않음)
    const rows = received.rows.map(r => {
      const o = { name: String(r.nm_krname || r.nm_code || "").trim(), code: String(r.cd_emp || "") };
      for (let m = 1; m <= 12; m++) {
        const k = String(m).padStart(2, "0");
        o[`m${k}_gross`] = Number(r[`mon_${k}_ji`] || 0);
        o[`m${k}_ded`] = Number(r[`mon_${k}_gong`] || 0);
      }
      return o;
    });
    log(`직원 ${rows.length}명 → 앱으로 전송`);
    const res = await report({ rows });
    if (!res || !res.ok) log("전송 실패:", res && res.error);
    else log(`저장 ${res.saved}개월, 건너뜀 ${res.skipped}개월`);
    return finish();
  }

  function report(extra) {
    return api({ phase: "batch", clientId, year, incomeType: "salary", overwrite, ...extra });
  }

  async function finish() {
    await sleep(300);
    const r = await bg({ type: "efile-done" });
    if (!r || !r.ok) { try { window.close(); } catch {} }
  }

  if (document.readyState === "complete") run();
  else window.addEventListener("load", () => run());
})();
