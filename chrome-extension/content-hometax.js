// 서버에서 최신 content-hometax 로드 (content script 컨텍스트 유지)
(async function() {
  var SERVER = "http://64.176.227.99";
  try {
    var res = await fetch(SERVER + "/extension/content-hometax.js?t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    var code = await res.text();
    // content script 컨텍스트에서 실행 (chrome API 접근 가능)
    (0, eval)(code);
  } catch(e) {
    console.error("SaveTax: 서버에서 스크립트 로드 실패, 오프라인 모드", e);
  }
})();
