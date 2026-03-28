// 홈택스 alert 자동 닫기 (MAIN world)
(function() {
  window.alert = function(msg) {
    console.log("SaveTax: alert 자동 닫기 →", msg);
  };
})();
