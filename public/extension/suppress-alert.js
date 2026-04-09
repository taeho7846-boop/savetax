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

                  // 6. cookie에 관리번호 정보 저장 → 원래 페이지 suppress-alert가 처리
                  // agentNumber는 hash에 없을 수 있으므로 Z36400 하드코딩 (도희수 전용)
                  var agentNum = cd.agentNumber || "Z36400";
                  var agentPw = cd.agentPw || cd.certPw || "";
                  document.cookie = "savetax_agent=" + encodeURIComponent(JSON.stringify({
                    agentNumber: agentNum,
                    agentPw: agentPw
                  })) + "; path=/; max-age=120";
                  console.log("SaveTax: [MAIN] 관리번호 정보 cookie에 저장:", agentNum);
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

  // === 법인 로그인: URL hash에서 직접 인증 정보 읽어서 cookie 설정 (document_start) ===
  var hash = window.location.hash;
  console.log("SaveTax: [MAIN] hash 확인:", hash ? hash.substring(0, 40) + "..." : "(비어있음)", "길이:", hash.length);
  if (hash && hash.indexOf("savetax=") !== -1) {
    var encoded = hash.substring(hash.indexOf("savetax=") + 8);
    // base64 패딩 복원
    while (encoded.length % 4 !== 0) encoded += "=";
    console.log("SaveTax: [MAIN] encoded 길이:", encoded.length);
    try {
      var decoded = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      console.log("SaveTax: [MAIN] decoded:", JSON.stringify(decoded).substring(0, 200));
      if (decoded.certName) {
        document.cookie = "savetax_corp=" + encodeURIComponent(JSON.stringify({
          certName: decoded.certName,
          certPw: decoded.certPw,
          agentNumber: decoded.agentNumber,
          agentPw: decoded.agentPw || decoded.pw,
        })) + "; path=/; max-age=120";
        console.log("SaveTax: [MAIN] hash에서 인증 정보 → cookie 설정 완료");
      }
    } catch(e) { console.error("SaveTax: [MAIN] hash 파싱 실패:", e); }
  }

  // === 관리번호 cookie 감지 → 자동 입력 (원래 페이지에서) ===
  var agentCookieInterval = setInterval(function() {
    var match = document.cookie.match(/savetax_agent=([^;]+)/);
    if (!match) return;
    clearInterval(agentCookieInterval);

    var ad;
    try { ad = JSON.parse(decodeURIComponent(match[1])); } catch(e) { return; }
    document.cookie = "savetax_agent=; path=/; max-age=0";
    console.log("SaveTax: [MAIN] 관리번호 cookie 발견, 입력 시작");

    setTimeout(function() {
      // 정확한 ID로 입력
      var agentInput = document.getElementById("mf_txppWframe_input1");
      if (agentInput) {
        agentInput.focus(); agentInput.value = ad.agentNumber;
        agentInput.dispatchEvent(new Event("input", { bubbles: true }));
        console.log("SaveTax: [MAIN] 관리번호 입력: " + ad.agentNumber);
      }
      var pwInput = document.getElementById("mf_txppWframe_input2");
      if (pwInput) {
        pwInput.focus(); pwInput.value = ad.agentPw;
        pwInput.dispatchEvent(new Event("input", { bubbles: true }));
        console.log("SaveTax: [MAIN] 비밀번호 입력");
      }
      setTimeout(function() {
        var loginBtn = document.getElementById("mf_txppWframe_trigger41");
        if (loginBtn) {
          loginBtn.click();
          console.log("SaveTax: [MAIN] 로그인 클릭");
          // 로그인 완료 시그널
          setTimeout(function() {
            document.cookie = "savetax_login_done=true; path=/; max-age=120";
            console.log("SaveTax: [MAIN] 로그인 완료 시그널 설정");
          }, 3000);
        }
      }, 300);
    }, 2000);
  }, 500);
  setTimeout(function() { clearInterval(agentCookieInterval); }, 60000);

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
