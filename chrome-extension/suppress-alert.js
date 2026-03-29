// 홈택스 세무대리인 팝업만 선택적 차단 (MAIN world)
(function() {
  var origAlert = window.alert;
  var origConfirm = window.confirm;

  window.alert = function(msg) {
    var s = String(msg || "");
    // 세무대리인 관련 알럿만 차단, 나머지는 원래대로
    if (s.indexOf("세무대리인") !== -1 && s.indexOf("전용") !== -1) {
      console.log("SaveTax: alert 자동 닫기 →", msg);
      return;
    }
    return origAlert.call(window, msg);
  };

  window.confirm = function(msg) {
    var s = String(msg || "");
    // 세무대리인 관련 confirm만 취소, 나머지는 원래대로
    if (s.indexOf("세무대리인") !== -1 && s.indexOf("전용") !== -1) {
      console.log("SaveTax: confirm 자동 취소 →", msg);
      return false;
    }
    return origConfirm.call(window, msg);
  };

  // DOM 기반 팝업 감시 - "세무대리인 전용 화면" 팝업에서 취소 자동 클릭
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
