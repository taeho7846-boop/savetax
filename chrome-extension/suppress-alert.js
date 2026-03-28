// 홈택스 alert 자동 닫기 + MAIN world 클릭 중계
(function() {
  window.alert = function(msg) {
    console.log("SaveTax: alert 자동 닫기 →", msg);
  };

  // content script에서 DOM 속성으로 클릭 요청 수신
  const beacon = document.createElement("div");
  beacon.id = "__savetax_beacon";
  beacon.style.display = "none";
  document.documentElement.appendChild(beacon);

  new MutationObserver(function() {
    const id = beacon.getAttribute("data-click");
    if (id) {
      beacon.removeAttribute("data-click");
      const el = document.getElementById(id);
      if (el) {
        el.click();
        console.log("SaveTax: MAIN world 클릭 →", id);
      }
    }
  }).observe(beacon, { attributes: true });
})();
