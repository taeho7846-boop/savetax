// 홈택스 alert를 자동 확인 처리 + MAIN world 클릭 중계
(function() {
  // alert 자동 닫기
  window.alert = function(msg) {
    console.log("SaveTax: alert 자동 닫기 →", msg);
  };

  // content script에서 요청하는 클릭을 MAIN world에서 실행
  window.addEventListener("savetax-click", function(e) {
    const id = e.detail;
    const el = document.getElementById(id);
    if (el) {
      el.click();
      console.log("SaveTax: MAIN world 클릭 →", id);
    }
  });
})();
