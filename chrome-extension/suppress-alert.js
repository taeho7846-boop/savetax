// suppress-alert 로더 (MAIN world)
// 기본 코드 내장 + 서버에서 최신 버전 시도
(function() {
  // 기본 내장 코드 (서버 연결 실패 시에도 작동)
  var origAlert = window.alert;
  var origConfirm = window.confirm;

  window.alert = function(msg) {
    var s = String(msg || "");
    if (s.indexOf("세무대리인") !== -1 && s.indexOf("전용") !== -1) {
      console.log("SaveTax: alert 자동 닫기 →", msg);
      return;
    }
    if (s.indexOf("확인되었습니다") !== -1) {
      console.log("SaveTax: alert 자동 닫기 →", msg);
      return;
    }
    return origAlert.call(window, msg);
  };

  window.confirm = function(msg) {
    var s = String(msg || "");
    if (s.indexOf("세무대리인") !== -1 && s.indexOf("전용") !== -1) {
      console.log("SaveTax: confirm 자동 취소 →", msg);
      return false;
    }
    return origConfirm.call(window, msg);
  };

  // DOM 기반 팝업 감시
  var observer = new MutationObserver(function() {
    var popups = document.querySelectorAll("div[style*='visible'], div[class*='popup'], div[class*='alert'], div[class*='modal']");
    popups.forEach(function(popup) {
      if (popup.textContent && popup.textContent.indexOf("세무대리인") !== -1 && popup.textContent.indexOf("전용") !== -1) {
        var cancelBtn = popup.querySelector("input[value='취소'], button:first-child");
        if (cancelBtn && !cancelBtn.dataset.savetaxClicked) {
          cancelBtn.dataset.savetaxClicked = "true";
          cancelBtn.click();
          console.log("SaveTax: 세무대리인 팝업 취소 자동 클릭");
        }
      }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
