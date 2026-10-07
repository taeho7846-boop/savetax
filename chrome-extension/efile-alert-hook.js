// 원천세 자동신고 제출 단계(홈택스·위택스) — 페이지 MAIN world에서 alert/confirm 가로채기
// 자동 진행 중에는 사이트의 안내창(alert)·확인창(confirm)이 떠 있으면 화면이 멈추므로,
// 문구를 sessionStorage에 적어 두고(사이트 진행 창에 그대로 보여 줌) 창은 띄우지 않는다.
//  - savetax_efile_mode 가 "verify"(검증 진행 중) 또는 "submit"(사람이 사이트에서 [제출]을 확인한 뒤)일 때만 동작
//  - 그 외(평소 사용, 검증 후 사람 확인을 기다리는 동안)에는 원래 동작 그대로
(function () {
  if (window.__savetaxEfileAlertHook) return;
  window.__savetaxEfileAlertHook = true;
  function mode() { try { return sessionStorage.getItem("savetax_efile_mode") || ""; } catch (e) { return ""; } }
  function note(kind, msg) {
    try {
      var a = JSON.parse(sessionStorage.getItem("savetax_efile_alerts") || "[]");
      a.push({ k: kind, m: String(msg == null ? "" : msg).replace(/\s+/g, " ").slice(0, 300), t: Date.now() });
      sessionStorage.setItem("savetax_efile_alerts", JSON.stringify(a.slice(-30)));
    } catch (e) {}
  }
  var prevAlert = window.alert, prevConfirm = window.confirm;
  // 홈택스 로그인 때 뜨는 '세무대리인 전용' 안내는 기존 처리(suppress-alert.js)에 그대로 맡긴다
  function legacy(msg) { var t = String(msg == null ? "" : msg); return t.indexOf("세무대리인") !== -1 && t.indexOf("전용") !== -1; }
  window.alert = function (msg) {
    var m = mode();
    if ((m === "verify" || m === "submit") && !legacy(msg)) { note("alert", msg); console.log("SaveTax 제출: alert →", msg); return; }
    return prevAlert.apply(window, arguments);
  };
  window.confirm = function (msg) {
    var m = mode();
    if ((m === "verify" || m === "submit") && !legacy(msg)) { note("confirm", msg); console.log("SaveTax 제출: confirm 자동 확인 →", msg); return true; }
    return prevConfirm.apply(window, arguments);
  };
})();
