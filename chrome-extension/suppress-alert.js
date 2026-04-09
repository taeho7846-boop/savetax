// suppress-alert 로더 (MAIN world)
(function() {
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

  // === 법인 로그인: 팝업에서 공동금융인증 + 인증서 처리 ===
  if (window.location.href.indexOf("popup.html") !== -1 || window.location.href.indexOf("UTECMABA") !== -1) {

    // 1. 공동금융인증 버튼 찾아서 클릭
    var certBtnInterval = setInterval(function() {
      var btn = document.getElementById("mf_btnPkcCert_type01");
      if (!btn) {
        var allInputs = document.querySelectorAll("input[type='button']");
        for (var i = 0; i < allInputs.length; i++) {
          if (allInputs[i].value && allInputs[i].value.indexOf("공동") !== -1) { btn = allInputs[i]; break; }
        }
      }
      if (!btn) return;
      clearInterval(certBtnInterval);

      setTimeout(function() {
        btn.click();
        console.log("SaveTax: [MAIN] 공동·금융 인증 클릭");

        // 2. dscert iframe 대기
        var iframeInterval = setInterval(function() {
          var frame = document.querySelector("iframe[name='dscert']");
          if (!frame) return;
          var doc;
          try { doc = frame.contentDocument || frame.contentWindow.document; } catch(e) { return; }
          if (!doc) return;
          var pwField = doc.getElementById("input_cert_pw") || doc.querySelector("input[type='password']");
          if (!pwField) return;
          clearInterval(iframeInterval);
          console.log("SaveTax: [MAIN] dscert iframe + 비밀번호 필드 발견!");

          // 하드디스크 탭 클릭
          doc.querySelectorAll("a").forEach(function(a) {
            if ((a.textContent || "").indexOf("하드디스크") !== -1) {
              a.click();
              console.log("SaveTax: [MAIN] 하드디스크 탭 클릭");
            }
          });

          // 3. cookie에서 인증 정보 읽기 대기
          setTimeout(function() {
            console.log("SaveTax: [MAIN] cookie에서 인증 정보 대기...");
            var cookieInterval = setInterval(function() {
              var match = document.cookie.match(/savetax_corp=([^;]+)/);
              if (!match) return;
              clearInterval(cookieInterval);

              var cd;
              try { cd = JSON.parse(decodeURIComponent(match[1])); } catch(e) { return; }
              document.cookie = "savetax_corp=; path=/; max-age=0";
              console.log("SaveTax: [MAIN] 인증 정보 발견! certName:", cd.certName);

              // 4. 인증서 선택
              var doc2;
              try { doc2 = frame.contentDocument || frame.contentWindow.document; } catch(e) { return; }

              if (cd.certName) {
                doc2.querySelectorAll("a").forEach(function(a) {
                  if ((a.textContent || "").indexOf(cd.certName) !== -1) {
                    a.click();
                    console.log("SaveTax: [MAIN] 인증서 선택: " + cd.certName);
                  }
                });
              }

              // 5. 비밀번호 입력 + 확인
              setTimeout(function() {
                var pw2 = doc2.getElementById("input_cert_pw") || doc2.querySelector("input[type='password']");
                if (pw2 && cd.certPw) {
                  pw2.focus();
                  pw2.value = cd.certPw;
                  pw2.dispatchEvent(new Event("input", { bubbles: true }));
                  console.log("SaveTax: [MAIN] 인증서 비밀번호 입력");
                }

                setTimeout(function() {
                  var confirmBtn = doc2.getElementById("btn_confirm_iframe");
                  if (confirmBtn) {
                    confirmBtn.click();
                    console.log("SaveTax: [MAIN] 인증서 확인 클릭");
                  }

                  // 6. 원래 창에서 관리번호 입력
                  if (cd.agentNumber && window.opener) {
                    setTimeout(function() {
                      try {
                        var opDoc = window.opener.document;
                        var inputs = opDoc.querySelectorAll("input");
                        for (var m = 0; m < inputs.length; m++) {
                          if ((inputs[m].title || "").indexOf("관리번호") !== -1) {
                            inputs[m].focus(); inputs[m].value = cd.agentNumber;
                            inputs[m].dispatchEvent(new Event("input", { bubbles: true }));
                            console.log("SaveTax: [MAIN] 관리번호 입력: " + cd.agentNumber);
                            break;
                          }
                        }
                        var pwInputs = opDoc.querySelectorAll("input[type='password']");
                        if (pwInputs.length > 0) {
                          var lastPw = pwInputs[pwInputs.length - 1];
                          lastPw.focus(); lastPw.value = cd.agentPw;
                          lastPw.dispatchEvent(new Event("input", { bubbles: true }));
                          console.log("SaveTax: [MAIN] 비밀번호 입력");
                        }
                        setTimeout(function() {
                          var btns = opDoc.querySelectorAll("button, input[type='button']");
                          for (var n = 0; n < btns.length; n++) {
                            if ((btns[n].textContent || btns[n].value || "").trim() === "로그인" && btns[n].offsetParent) {
                              btns[n].click();
                              console.log("SaveTax: [MAIN] 로그인 클릭");
                              break;
                            }
                          }
                        }, 300);
                      } catch(e) {
                        console.error("SaveTax: [MAIN] 관리번호 입력 실패:", e);
                      }
                    }, 3000);
                  }
                }, 500);
              }, 500);
            }, 500);
            setTimeout(function() { clearInterval(cookieInterval); }, 30000);
          }, 1500);
        }, 500);
        setTimeout(function() { clearInterval(iframeInterval); }, 30000);
      }, 1000);
    }, 500);
    setTimeout(function() { clearInterval(certBtnInterval); }, 30000);
  }

  // === 법인 로그인: content script가 DOM에 심은 인증 정보 → cookie로 변환 (MAIN world) ===
  var corpDataInterval = setInterval(function() {
    var el = document.getElementById("savetax-corp-data");
    if (!el) return;
    clearInterval(corpDataInterval);
    document.cookie = "savetax_corp=" + encodeURIComponent(el.value) + "; path=/; max-age=120";
    el.remove();
    console.log("SaveTax: [MAIN] 인증 정보 DOM→cookie 변환 완료");
  }, 300);
  setTimeout(function() { clearInterval(corpDataInterval); }, 30000);

  // === 관리번호 팝업 확인 버튼 반복 찾기 ===
  var corpConfirmInterval = setInterval(function() {
    var btn = document.querySelector("input[id*='btn_confirm'][value='확인']");
    if (btn && btn.offsetParent && !btn.dataset.savetaxCorpClicked) {
      btn.dataset.savetaxCorpClicked = "true";
      btn.click();
      console.log("SaveTax: 관리번호 팝업 확인 클릭!");
      clearInterval(corpConfirmInterval);
    }
  }, 500);
  setTimeout(function() { clearInterval(corpConfirmInterval); }, 30000);

  // === DOM 기반 팝업 감시 ===
  var autoCloseKeywords = ["정상적으로 접수", "접수되었습니다", "처리되었습니다", "완료되었습니다", "확인되었습니다"];

  var observer = new MutationObserver(function() {
    var popups = document.querySelectorAll("div.w2window, div[class*='popup'], div[class*='w2window']");
    popups.forEach(function(popup) {
      if (!popup.offsetParent) return;
      var text = popup.textContent || "";

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

      // 알림 팝업 → 확인
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
