// 홈택스 alert/confirm 자동 닫기 + DOM 팝업 감시 (MAIN world)
(function() {
  window.alert = function(msg) {
    console.log("SaveTax: alert 자동 닫기 →", msg);
  };
  window.confirm = function(msg) {
    console.log("SaveTax: confirm 자동 닫기(취소) →", msg);
    return false;
  };

  // DOM 기반 팝업 감시 - "세무대리인 전용 화면" 등 팝업에서 취소 자동 클릭
  var observer = new MutationObserver(function() {
    // "세무대리인" 텍스트가 포함된 팝업의 취소 버튼 찾기
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
