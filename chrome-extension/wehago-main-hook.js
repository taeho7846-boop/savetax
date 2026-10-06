// 위하고(smarta) 페이지 MAIN world 후킹 — 전자신고 화면의 조회 응답을 content script로 전달
// 조회 버튼을 누르면 위하고가 수임처마다 GET /smarta/swer0101/make/ (원천세) · /smarta/swer0109/make/ (지방소득세) 를
// 한 번씩 호출하고, 마감된 수임처만 group03에 행이 들어온다. API는 요청마다 1회용 서명이라 직접 호출은 불가 →
// 페이지가 보내는 요청의 응답을 그대로 가로채 window.postMessage 로 넘긴다. (content script는 격리 world라 직접 못 봄)
// 자동 조회(stCloseCheck / stProduce 파라미터)가 있을 때만 메시지를 보낸다.
(function () {
  if (window.__savetaxEfileHook) return;
  window.__savetaxEfileHook = true;

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
})();
