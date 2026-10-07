// 위하고(smarta) 페이지 MAIN world 후킹 — 전자신고 화면 자동화 지원 (원천세 자동신고)
//  1) 조회 응답 가로채기: 조회 버튼을 누르면 위하고가 수임처마다 GET /smarta/swer0101/make/ (원천세) ·
//     /smarta/swer0109/make/ (지방소득세) 를 한 번씩 호출하고 마감된 수임처만 group03에 행이 들어온다.
//     API는 요청마다 1회용 서명이라 직접 호출은 불가 → 페이지 요청의 응답을 window.postMessage 로 넘긴다.
//  2) RealGridJS 표 제어 브리지: 화면의 표(수임처 목록·회사 코드도움 팝업)는 canvas라 DOM으로 못 읽고
//     합성 클릭도 무시한다. RealGridJS.GridView 프로토타입 패치 + 화면(React)에서 직접 찾기로 인스턴스를 모아 두고,
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
  // 표 객체(GridView)는 전역 목록이 없어 직접 모아야 한다. 두 가지 방법을 같이 쓴다.
  //  (가) GridView 프로토타입의 모든 메서드를 감싸 호출되는 순간 등록 — 패치 "이후"에 한 번이라도 호출돼야 잡힌다.
  //       예전엔 메서드 10개만, 200ms 폴링으로 한 번만 패치해서 표가 패치보다 먼저 만들어지면(탭이 뒤에 있어
  //       타이머가 느릴 때 등) 끝까지 못 잡는 경우가 있었다 (2026-10 "조회 결과 표를 읽지 못했습니다 · 화면 표: 없음").
  //  (나) 화면의 canvas에서 React 컴포넌트를 거슬러 올라가 이미 만들어진 표 객체를 직접 찾는다 (패치 시점과 무관).
  // 자동화 주소(stCloseCheck/stProduce)로 연 탭에서만 동작 — 평소 위하고 사용에는 손대지 않는다.
  const active = () => /st(CloseCheck|Produce)=/.test(location.hash || "");
  const grids = [];     // 등록 순서 유지 (팝업 표는 나중에 만들어짐)
  const seen = new WeakSet();
  const isGrid = (g) => !!g && typeof g === "object" && typeof g.getCheckedRows === "function" && typeof g.checkRow === "function";
  function register(g) {
    if (!g || typeof g !== "object" || seen.has(g)) return;
    if (!isGrid(g)) return;
    seen.add(g); grids.push(g);
  }

  // (가) 프로토타입 패치
  const patchedProtos = new WeakSet();
  let patchCount = 0;
  function patchClass(C) {
    if (typeof C !== "function" || !C.prototype) return false;
    for (let p = C.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      if (patchedProtos.has(p)) continue;
      patchedProtos.add(p); patchCount++;
      for (const m of Object.getOwnPropertyNames(p)) {
        if (m === "constructor") continue;
        let d; try { d = Object.getOwnPropertyDescriptor(p, m); } catch (e) { continue; }
        if (!d || typeof d.value !== "function" || !d.writable) continue;
        const orig = d.value;
        const w = function (...a) {
          if (new.target) return Reflect.construct(orig, a, new.target === w ? orig : new.target);
          register(this);
          return orig.apply(this, a);
        };
        if (orig.prototype) w.prototype = orig.prototype; // 프로토타입에 달린 생성자였다면 instanceof 유지
        try { Object.defineProperty(p, m, { value: w, writable: true, enumerable: d.enumerable, configurable: d.configurable }); } catch (e) {}
      }
    }
    return true;
  }
  function tryPatch() {
    if (!active()) return false;
    let ok = false;
    for (const RG of [window.RealGridJS, window.RealGrid]) {
      try { if (RG && RG.GridView && patchClass(RG.GridView)) ok = true; } catch (e) {}
    }
    return ok;
  }
  tryPatch();
  // 스크립트가 로드되는 즉시(표가 만들어지기 전) 패치 시도 + 느린 폴링은 계속 유지(라이브러리가 나중에 다시 로드돼 교체되는 경우 대비)
  document.addEventListener("load", (ev) => { if (ev.target && ev.target.tagName === "SCRIPT") tryPatch(); }, true);
  let tries = 0;
  const fast = setInterval(() => { if (tryPatch() || ++tries > 300) clearInterval(fast); }, 200);
  setInterval(tryPatch, 2000);

  // (나) 화면에서 직접 찾기
  let discovered = 0, lastDiscoverAt = 0;
  function reactFiberOf(node) {
    try {
      for (const k of Object.getOwnPropertyNames(node)) {
        if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) return node[k];
      }
    } catch (e) {}
    return null;
  }
  function scan(obj, depth, visited, budget) {
    if (!obj || typeof obj !== "object" || budget.n <= 0 || visited.has(obj)) return;
    visited.add(obj);
    if (isGrid(obj) && typeof obj.getDataSource === "function") {
      if (!seen.has(obj)) { register(obj); discovered++; }
      return;
    }
    if (depth <= 0) return;
    try { if (obj === window || (typeof Node !== "undefined" && obj instanceof Node)) return; } catch (e) { return; }
    let keys;
    try { keys = Object.getOwnPropertyNames(obj); } catch (e) { return; }
    if (keys.length > 300) keys = keys.slice(0, 300);
    for (const k of keys) {
      if (k.startsWith("_react") || k.startsWith("__react")) continue; // 파이버 트리 전체로 번지지 않게
      budget.n--;
      let d; try { d = Object.getOwnPropertyDescriptor(obj, k); } catch (e) { continue; }
      if (!d || !("value" in d)) continue; // getter는 건드리지 않음
      const v = d.value;
      if (v && typeof v === "object") scan(v, depth - 1, visited, budget);
    }
  }
  function discover() {
    if (!active()) return;
    const now = Date.now();
    if (now - lastDiscoverAt < 300) return;
    lastDiscoverAt = now;
    const visited = new WeakSet(), fibers = new WeakSet(), budget = { n: 30000 };
    let canvases;
    try { canvases = document.querySelectorAll("canvas"); } catch (e) { return; }
    for (const cv of canvases) {
      let el = cv;
      for (let i = 0; i < 12 && el && el !== document.body; i++, el = el.parentElement) {
        // DOM 요소에 직접 달아 둔 참조 (React 키 제외)
        try {
          for (const k of Object.getOwnPropertyNames(el)) {
            if (k.startsWith("__react") || k.startsWith("_react")) continue;
            const d = Object.getOwnPropertyDescriptor(el, k);
            if (d && d.value && typeof d.value === "object") scan(d.value, 2, visited, budget);
          }
        } catch (e) {}
        // React 컴포넌트 체인
        let fb = reactFiberOf(el);
        for (let j = 0; j < 60 && fb && typeof fb === "object" && !fibers.has(fb); j++, fb = fb.return) {
          fibers.add(fb);
          try {
            const sn = fb.stateNode;
            if (sn && typeof sn === "object" && !(sn instanceof Node)) scan(sn, 3, visited, budget);  // 클래스 컴포넌트 인스턴스
            scan(fb.memoizedProps, 2, visited, budget);
            let h = fb.memoizedState;                                                                 // 훅(useRef/useState)
            for (let n = 0; n < 40 && h && typeof h === "object"; n++, h = h.next) scan(h.memoizedState, 3, visited, budget);
          } catch (e) {}
        }
      }
    }
  }
  function diag() {
    let canvases = -1;
    try { canvases = document.querySelectorAll("canvas").length; } catch (e) {}
    return { active: active(), rgjs: !!(window.RealGridJS && window.RealGridJS.GridView), rg2: !!(window.RealGrid && window.RealGrid.GridView), patched: patchCount, grids: grids.length, discovered, canvases };
  }

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
          try { tryPatch(); discover(); } catch (e) {}
          reply(grids.map((x, i) => gridInfo(x, i))); break;
        case "diag":
          try { tryPatch(); discover(); } catch (e) {}
          reply(diag()); break;
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
