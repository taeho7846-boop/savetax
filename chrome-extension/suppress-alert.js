// 홈택스 alert를 자동 확인 처리 (MAIN world에서 실행)
(function() {
  const origAlert = window.alert;
  window.alert = function(msg) {
    console.log("SaveTax: alert 자동 닫기 →", msg);
    // alert를 무시하고 자동으로 넘어감
  };
})();
