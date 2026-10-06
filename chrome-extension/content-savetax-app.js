// SaveTax 사이트(app.savetaxnh.com / localhost:3000) ↔ 확장 프로그램 다리
// 사이트 페이지가 window.postMessage({ source: "savetax-app", id, type, ... }) 로 보내면
// background에 전달하고, 응답을 { source: "savetax-ext", id, ...res } 로 돌려준다.
// 원천세 탭의 [마감상태 조회]/[파일 제작]이 위하고 창을 "최소화된 별도 창"으로 열기 위해 사용.
(function () {
  if (window !== window.top) return;
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== "savetax-app" || !d.id) return;
    const reply = (res) => window.postMessage({ source: "savetax-ext", id: d.id, ...(res || {}) }, "*");
    if (d.type === "ping") {
      reply({ ok: true, version: chrome.runtime.getManifest().version });
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "app-" + d.type, payload: d.payload || {} }, (res) => {
        if (chrome.runtime.lastError) reply({ ok: false, error: chrome.runtime.lastError.message });
        else reply(res || { ok: false, error: "응답 없음" });
      });
    } catch (e) {
      reply({ ok: false, error: e.message });
    }
  });
  // 페이지가 확장 존재를 바로 알 수 있도록 표시
  document.documentElement.dataset.savetaxExt = chrome.runtime.getManifest().version;
})();
