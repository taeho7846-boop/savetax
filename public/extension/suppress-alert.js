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

  // 법인 로그인: 사용자인증 선택 팝업에서 공동·금융 인증 자동 클릭 (popup.html)
  if (window.location.href.indexOf("popup.html") !== -1) {
    var certCheckInterval = setInterval(function() {
      // mf_btnPkcCert_type01 버튼 찾기
      var btn = document.getElementById("mf_btnPkcCert_type01");
      if (btn) {
        clearInterval(certCheckInterval);
        setTimeout(function() {
          btn.click();
          console.log("SaveTax: [MAIN] 공동·금융 인증 클릭");
        }, 1000);
        return;
      }
      // 텍스트로 찾기
      var allInputs = document.querySelectorAll("input[type='button']");
      for (var i = 0; i < allInputs.length; i++) {
        if (allInputs[i].value && allInputs[i].value.indexOf("공동") !== -1) {
          clearInterval(certCheckInterval);
          setTimeout(function() {
            allInputs[i].click();
            console.log("SaveTax: [MAIN] 공동·금융 인증 클릭 (input)");
          }, 1000);
          return;
        }
      }
      // div/span/a로 찾기
      var allEls = document.querySelectorAll("div, span, a, p");
      for (var j = 0; j < allEls.length; j++) {
        var t = allEls[j].textContent || "";
        if (t.indexOf("공동") !== -1 && t.indexOf("금융") !== -1 && t.indexOf("인증") !== -1 && allEls[j].offsetParent !== null) {
          clearInterval(certCheckInterval);
          var el = allEls[j];
          setTimeout(function() {
            el.click();
            console.log("SaveTax: [MAIN] 공동·금융 인증 클릭 (text)");
          }, 1000);
          return;
        }
      }
    }, 500);
    // 30초 후 타임아웃
    setTimeout(function() { clearInterval(certCheckInterval); }, 30000);
  }

  // DOM 기반 팝업 감시
  var autoCloseKeywords = ["정상적으로 접수", "접수되었습니다", "처리되었습니다", "완료되었습니다", "확인되었습니다"];

  var observer = new MutationObserver(function() {
    // 세무대리인 팝업 → 취소
    var popups = document.querySelectorAll("div.w2window, div[class*='popup'], div[class*='w2window']");
    popups.forEach(function(popup) {
      if (!popup.offsetParent) return; // 안 보이면 무시
      var text = popup.textContent || "";

      // 세무대리인 관리번호 로그인 팝업 → 확인
      if (text.indexOf("세무대리인") !== -1 && text.indexOf("관리번호") !== -1) {
        var okBtn = popup.querySelector("input[value='확인']");
        if (okBtn && !okBtn.dataset.savetaxClicked) {
          okBtn.dataset.savetaxClicked = "true";
          okBtn.click();
          console.log("SaveTax: 세무대리인 관리번호 팝업 확인");
        }
        return;
      }

      // 세무대리인 전용 화면 → 취소
      if (text.indexOf("세무대리인") !== -1 && text.indexOf("전용") !== -1) {
        var cancelBtn = popup.querySelector("input[value='취소']");
        if (cancelBtn && !cancelBtn.dataset.savetaxClicked) {
          cancelBtn.dataset.savetaxClicked = "true";
          cancelBtn.click();
          console.log("SaveTax: 세무대리인 팝업 취소");
        }
        return;
      }

      // 알림 팝업 (접수/처리/완료/확인) → 확인
      for (var i = 0; i < autoCloseKeywords.length; i++) {
        if (text.indexOf(autoCloseKeywords[i]) !== -1) {
          var confirmBtn = popup.querySelector("input[value='확인']");
          if (confirmBtn && !confirmBtn.dataset.savetaxClicked) {
            confirmBtn.dataset.savetaxClicked = "true";
            confirmBtn.click();
            console.log("SaveTax: 알림 팝업 자동 확인 → " + autoCloseKeywords[i]);
          }
          return;
        }
      }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
