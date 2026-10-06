// 위하고(smarta) 페이지 MAIN world 후킹 — 전자신고 화면 자동화 지원 (원천세 자동신고)
//  1) 조회 응답 가로채기: 조회 버튼을 누르면 위하고가 수임처마다 GET /smarta/swer0101/make/ (원천세) ·
//     /smarta/swer0109/make/ (지방소득세) 를 한 번씩 호출하고 마감된 수임처만 group03에 행이 들어온다.
//     API는 요청마다 1회용 서명이라 직접 호출은 불가 → 페이지 요청의 응답을 window.postMessage 로 넘긴다.
//  2) RealGridJS 표 제어 브리지: 화면의 표(수임처 목록·회사 코드도움 팝업)는 canvas라 DOM으로 못 읽고
//     합성 클릭도 무시한다. RealGridJS.GridView/LocalDataProvider 프로토타입을 패치해 인스턴스를 모아 두고,
//     content script가 postMessage로 보내는 명령(grids/rows/check/checkAll/checkedRows)을 대신 실행한다.
//     (content script는 격리 world라 페이지 객체에 직접 접근 불가)
(function () {
  if (window.__savetaxEfileHook) return;
  window.__savetaxEfileHook = true;

  // ---- 1) fetch 응답 가로채기 ----
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      const m = url.match(/\/smarta\/(swer01(?:01|09))\/make\//);
      if (m && /st(CloseCheck|Produce)=/.test(location.hash || "")) {
        const U = new URL(url, location.href);
        res.clone().text().then((text) => {
          window.postMessage({
            source: "savetax-efile",
            menu: m[1].toUpperCase(),
            cno: U.searchParams.get("cno"),
            ccode: U.searchParams.get("ccode"),
            body: text,
          }, "*");
        }).catch(() => {});
      }
    } catch (e) { /* 무시 */ }
    return res;
  };

  // ---- 1-b) 전자신고 파일 다운로드 가로채기 (stProduce 모드) ----
  // 위하고는 FileSaver 방식(blob URL + <a download> 클릭)으로 파일을 내려준다. 자동 제작 중에는
  // 저장 대화상자 대신 blob 내용을 읽어 content script로 넘기고 실제 다운로드는 막는다.
  function interceptAnchor(a) {
    try {
      if (!/stProduce=/.test(location.hash || "")) return false;
      const href = a.href || "";
      const name = a.download || "";
      if (!href.startsWith("blob:") || !/\.0?1$/i.test(name)) return false;
      fetch(href).then(r => r.blob()).then(b => new Promise((res) => {
        const fr = new FileReader();
        fr.onloadend = () => res(String(fr.result || "").split(",")[1] || "");
        fr.readAsDataURL(b);
      })).then((base64) => {
        window.postMessage({ source: "savetax-efile-file", name, base64 }, "*");
      }).catch((e) => window.postMessage({ source: "savetax-efile-file", name, error: String(e && e.message) }, "*"));
      return true;
    } catch (e) { return false; }
  }
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (interceptAnchor(this)) return; return origClick.apply(this, arguments); };
  const origDispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === "click" && interceptAnchor(this)) return true;
    return origDispatch.apply(this, arguments);
  };

  // ---- 2) RealGridJS 인스턴스 수집 ----
  const grids = [];     // 등록 순서 유지 (팝업 표는 나중에 만들어짐)
  const seen = new WeakSet();
  function register(g) {
    if (!g || typeof g !== "object" || seen.has(g)) return;
    if (typeof g.getCheckedRows !== "function" || typeof g.checkRow !== "function") return;
    seen.add(g); grids.push(g);
  }
  function protoWith(C, m) {
    let p = C && C.prototype;
    while (p && !Object.prototype.hasOwnProperty.call(p, m)) p = Object.getPrototypeOf(p);
    return p;
  }
  function patch(RG) {
    if (!RG || !RG.GridView) return false;
    for (const m of ["setDataSource", "refresh", "checkRow", "setCurrent", "getCheckedRows", "setColumns", "checkAll", "setCheckBar", "setOptions", "setFields"]) {
      const p = protoWith(RG.GridView, m);
      if (!p || typeof p[m] !== "function" || p["__st_" + m]) continue;
      const orig = p[m];
      p[m] = function (...a) { register(this); return orig.apply(this, a); };
      p["__st_" + m] = true;
    }
    return true;
  }
  let tries = 0;
  const timer = setInterval(() => {
    let ok = false;
    try { ok = patch(window.RealGridJS) | patch(window.RealGrid); } catch (e) {}
    if (ok || ++tries > 300) clearInterval(timer); // 최대 60초 대기
  }, 200);

  function gridInfo(g, i) {
    let rowCount = -1, fields = [], rows = null;
    try {
      const ds = g.getDataSource();
      rowCount = ds.getRowCount();
      rows = ds.getJsonRows();
      fields = rows[0] ? Object.keys(rows[0]) : [];
    } catch (e) {}
    let container = null;
    try { const c = g.getContainer ? g.getContainer() : null; container = c ? (c.id || c.className) : null; } catch (e) {}
    let alive = true;
    try { if (g.isDestroyed && g.isDestroyed()) alive = false; } catch (e) {}
    return { index: i, rowCount, fields, container, alive, checked: safeChecked(g) };
  }
  function safeChecked(g) { try { return g.getCheckedRows(); } catch (e) { return null; } }

  // ---- 브리지 ----
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "savetax-efile-cmd" || ev.source !== window) return;
    const reply = (result, error) => window.postMessage({ source: "savetax-efile-res", id: d.id, result, error }, "*");
    try {
      const a = d.args || {};
      const g = a.index != null ? grids[a.index] : null;
      switch (d.cmd) {
        case "grids":
          reply(grids.map((x, i) => gridInfo(x, i))); break;
        case "rows":
          reply(g.getDataSource().getJsonRows()); break;
        case "check": {
          const list = Array.isArray(a.rows) ? a.rows : [a.rows];
          for (const r of list) g.checkRow(r, !!a.checked);
          reply(g.getCheckedRows()); break;
        }
        case "checkAll":
          g.checkAll(!!a.checked); reply(g.getCheckedRows()); break;
        case "checkedRows":
          reply(g.getCheckedRows()); break;
        default:
          reply(null, "unknown cmd " + d.cmd);
      }
    } catch (e) {
      reply(null, (e && e.message) || String(e));
    }
  });
})();
