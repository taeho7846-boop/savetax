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

  // 법인 로그인: 사용자인증 선택 팝업에서 공동·금융 인증 + 인증서 처리 (popup.html)
  if (window.location.href.indexOf("popup.html") !== -1 || window.location.href.indexOf("UTECMABA") !== -1) {

    // 인증서 정보를 content script에서 받기 위해 커스텀 이벤트 리스너
    var corpCertCreds = null;
    window.addEventListener("savetax_corp_creds", function(e) {
      corpCertCreds = e.detail;
      console.log("SaveTax: [MAIN] 인증 정보 수신:", corpCertCreds.certName);
    });

    // 공동·금융 인증 버튼 찾기
    var certCheckInterval = setInterval(function() {
      var btn = document.getElementById("mf_btnPkcCert_type01");
      if (!btn) {
        // 텍스트로 찾기
        var allInputs = document.querySelectorAll("input[type='button']");
        for (var i = 0; i < allInputs.length; i++) {
          if (allInputs[i].value && allInputs[i].value.indexOf("공동") !== -1) { btn = allInputs[i]; break; }
        }
      }
      if (!btn) return;

      clearInterval(certCheckInterval);
      setTimeout(function() {
        btn.click();
        console.log("SaveTax: [MAIN] 공동·금융 인증 클릭");

        // 인증서 iframe 대기 후 처리
        var certIframeInterval = setInterval(function() {
          var dscertFrame = document.querySelector("iframe[name='dscert']");
          if (!dscertFrame) return;
          var certDoc;
          try { certDoc = dscertFrame.contentDocument || dscertFrame.contentWindow.document; } catch(e) { return; }
          if (!certDoc) return;

          var pwField = certDoc.getElementById("input_cert_pw") || certDoc.querySelector("input[type='password']");
          if (!pwField) return;

          clearInterval(certIframeInterval);
          console.log("SaveTax: [MAIN] dscert iframe + 비밀번호 필드 발견!");

          // 하드디스크 탭 클릭
          var hdLinks = certDoc.querySelectorAll("a");
          for (var h = 0; h < hdLinks.length; h++) {
            if ((hdLinks[h].textContent || "").indexOf("하드디스크") !== -1) {
              hdLinks[h].click();
              console.log("SaveTax: [MAIN] 하드디스크 탭 클릭");
              break;
            }
          }

          setTimeout(function() {
            // DOM에서 인증 정보 읽기 대기
            var credsWait = setInterval(function() {
              var credsEl = document.getElementById("savetax-corp-creds");
              if (!credsEl) return;
              clearInterval(credsWait);

              var cd = {
                certName: credsEl.dataset.certName || "",
                certPw: credsEl.dataset.certPw || "",
              };
              var certDoc2;
              try { certDoc2 = dscertFrame.contentDocument || dscertFrame.contentWindow.document; } catch(e) { return; }

              // 인증서 선택
              if (cd.certName) {
                var links = certDoc2.querySelectorAll("a");
                for (var k = 0; k < links.length; k++) {
                  if ((links[k].textContent || "").indexOf(cd.certName) !== -1) {
                    links[k].click();
                    console.log("SaveTax: [MAIN] 인증서 선택: " + cd.certName);
                    break;
                  }
                }
              }

              setTimeout(function() {
                // 비밀번호 입력
                var pw2 = certDoc2.getElementById("input_cert_pw") || certDoc2.querySelector("input[type='password']");
                if (pw2 && cd.certPw) {
                  pw2.focus();
                  pw2.value = cd.certPw;
                  pw2.dispatchEvent(new Event("input", { bubbles: true }));
                  console.log("SaveTax: [MAIN] 인증서 비밀번호 입력");
                }

                setTimeout(function() {
                  // 확인 클릭
                  var confirmBtn = certDoc2.getElementById("btn_confirm_iframe");
                  if (confirmBtn) {
                    confirmBtn.click();
                    console.log("SaveTax: [MAIN] 인증서 확인 클릭");
                  }

                  // 인증 후 원래 창에서 관리번호 입력
                  var agentNumber = credsEl.dataset.agentNumber;
                  var agentPw = credsEl.dataset.agentPw;
                  if (agentNumber && window.opener) {
                    setTimeout(function() {
                      try {
                        var opDoc = window.opener.document;
                        var inputs = opDoc.querySelectorAll("input");
                        for (var m = 0; m < inputs.length; m++) {
                          if ((inputs[m].title || "").indexOf("관리번호") !== -1) {
                            inputs[m].focus(); inputs[m].value = agentNumber;
                            inputs[m].dispatchEvent(new Event("input", { bubbles: true }));
                            console.log("SaveTax: [MAIN] 관리번호 입력: " + agentNumber);
                            break;
                          }
                        }
                        var pwInputs = opDoc.querySelectorAll("input[type='password']");
                        if (pwInputs.length > 0) {
                          var lastPw = pwInputs[pwInputs.length - 1];
                          lastPw.focus(); lastPw.value = agentPw;
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
            // 15초 타임아웃
            setTimeout(function() { clearInterval(credsWait); }, 15000);
          }, 1500);
        }, 500);
        // 30초 타임아웃
        setTimeout(function() { clearInterval(certIframeInterval); }, 30000);
      }, 1000);
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
