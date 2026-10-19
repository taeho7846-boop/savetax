// 세모리포트(reportmgmt.appplay.co.kr) '고객 매입매출장' 월별 요약 자동 수집
// 앱(거래처 > 세모리포트 매입매출 수집)이 이 주소를 해시 파라미터와 함께 연다:
//   analy_book_001.act#autoSemoLedger=1&years=2025,2026&origin=https://app.savetaxnh.com
// 화면 조작 없이 세모리포트의 JSON 엔드포인트를 직접 호출한다 (2026-10-19 실측):
//   - 거래처 목록: analy_book_001_r001.jct?request={limit,offset,sort,jsondata:{...}}  → records[] (TXOF_BZAQ_KEY, BIZ_NO ...)
//   - 월별 요약 : analy_book_001_r005.jct?request={limit,offset,jsondata:{BZAQ_KEY,SCH_YEAR}} → records[] (SCH_DT=YYYYMM | '상반기' ...)
// 결과는 background(semo-api)를 거쳐 앱 /api/semo-ledger/import 로 10곳씩 보낸다. 끝나면 efile-done 으로 창을 닫는다.

(function () {
  const hash = window.location.hash || "";
  if (!/autoSemoLedger=1/.test(hash)) return;

  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const years = (params.get("years") || String(new Date().getFullYear())).split(",").map(s => s.trim()).filter(Boolean);
  const origin = params.get("origin") || "";
  const CONCURRENCY = 4;   // 세모리포트 호출 동시 수 (호출당 0.1초, 서버 부담 작게)
  const BATCH = 10;        // 앱으로 보낼 때 거래처 묶음 크기

  const log = (...a) => console.log("[SaveTax 세모수집]", ...a);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const bg = (msg) => new Promise(resolve => {
    try { chrome.runtime.sendMessage(msg, res => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (res || { ok: false, error: "응답 없음" }))); }
    catch (e) { resolve({ ok: false, error: e.message }); }
  });
  const api = (body) => bg({ type: "semo-api", base: origin, path: "/api/semo-ledger/import", method: "POST", body });

  async function semoJson(path, request) {
    const url = `./${path}?request=${encodeURIComponent(JSON.stringify(request))}`;
    const res = await fetch(url, { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } });
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error(`세모리포트 응답이 JSON이 아닙니다 (로그인 만료?) — ${path}`); }
  }

  async function fetchClients() {
    const req = {
      limit: 1000, offset: 0,
      sort: [{ field: "BZAQ_NM", direction: "asc" }],
      jsondata: { PAGE_NO: "1", SCH_WORD: "", CTRT_GB: [], TAXT_GB: [], TAX_STTS: [], RPRT_GRP: [], BIZ_DV: "", SEL_USER_ID: "", GRP_CD: "" },
    };
    const data = await semoJson("analy_book_001_r001.jct", req);
    return Array.isArray(data.records) ? data.records : [];
  }

  // 월 행만 추려 { yearMonth: "YYYY-MM", ...원본 필드 } 로
  async function fetchMonths(client, year) {
    const req = { limit: 100, offset: 0, jsondata: { BZAQ_KEY: client.TXOF_BZAQ_KEY, SCH_YEAR: String(year) } };
    const data = await semoJson("analy_book_001_r005.jct", req);
    const out = [];
    for (const r of (data.records || [])) {
      const m = String(r.SCH_DT || "").match(/^(\d{4})(\d{2})$/);
      if (!m) continue; // '2026년 전체' / '상반기' / '하반기' 는 제외
      const row = { yearMonth: `${m[1]}-${m[2]}` };
      for (const [k, v] of Object.entries(r)) {
        if (k === "recid" || k === "w2ui" || k === "SCH_DT") continue;
        row[k] = v;
      }
      out.push(row);
    }
    return out;
  }

  async function run() {
    await sleep(800);
    log(`시작 — 연도 ${years.join(",")}, 앱 ${origin || "(기본)"}`);

    let clients;
    try {
      clients = await fetchClients();
    } catch (e) {
      log("거래처 목록 실패:", e.message);
      await api({ phase: "start", total: 0, years });
      await api({ phase: "finish", error: "세모리포트 거래처 목록을 못 읽었습니다: " + e.message });
      return finish();
    }
    log(`거래처 ${clients.length}곳`);
    const started = await api({ phase: "start", total: clients.length, years });
    if (!started || !started.ok) {
      log("앱 시작 보고 실패:", started && started.error);
      return finish();
    }

    let idx = 0, failed = 0;
    let pending = [];
    const flush = async () => {
      if (!pending.length) return;
      const chunk = pending; pending = [];
      const res = await api({ phase: "batch", clients: chunk });
      if (!res || !res.ok) log("배치 전송 실패:", res && res.error);
      else log(`전송 ${chunk.length}곳 → 매칭 ${res.matched}, 월 ${res.rows}행, 미매칭 ${res.unmatched}`);
    };

    const worker = async () => {
      while (idx < clients.length) {
        const c = clients[idx++];
        let rows = [];
        try {
          for (const y of years) rows = rows.concat(await fetchMonths(c, y));
        } catch (e) {
          failed++;
          log(`실패 ${c.BZAQ_NM}: ${e.message}`);
        }
        pending.push({ name: c.BZAQ_NM, bizNo: c.BIZ_NO, semoKey: c.TXOF_BZAQ_KEY, rows });
        if (pending.length >= BATCH) await flush();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await flush();

    await api({ phase: "finish", error: failed ? `${failed}곳은 세모리포트 조회에 실패했습니다` : null });
    log("완료");
    return finish();
  }

  async function finish() {
    await sleep(500);
    const r = await bg({ type: "efile-done" }); // 숨긴 창이면 창째로 닫힘
    if (!r || !r.ok) { try { window.close(); } catch {} }
  }

  if (document.readyState === "complete") run();
  else window.addEventListener("load", () => run());
})();
