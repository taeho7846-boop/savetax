// 서비스 워커: 파일 fetch + Input.dispatchMouseEvent + Page.handleFileChooser

// 홈택스 팝업 자동 허용 (신고도움 미리보기 등 리포트 창이 팝업 차단에 걸리면 수집 실패)
function allowHometaxPopups() {
  if (!chrome.contentSettings?.popups) return;
  for (const pattern of ["https://hometax.go.kr/*", "https://sesw.hometax.go.kr/*"]) {
    chrome.contentSettings.popups.set({ primaryPattern: pattern, setting: "allow" }, () => {
      if (chrome.runtime.lastError) {
        console.warn("SaveTax BG: 팝업 허용 설정 실패:", pattern, chrome.runtime.lastError.message);
      } else {
        console.log("SaveTax BG: 팝업 허용 설정 완료:", pattern);
      }
    });
  }
}
allowHometaxPopups();
chrome.runtime.onInstalled.addListener(allowHometaxPopups);
chrome.runtime.onStartup.addListener(allowHometaxPopups);

// 홈택스 리포트 뷰어(ClipReport)의 네이티브 PDF 저장(pdfDownLoad)을 호출하고
// 그 PDF 응답을 디버거 Fetch 도메인으로 가로채 base64로 반환한다.
//  - 화면 캡처(Page.printToPDF)와 달리 툴바 없이 전체 페이지가 담긴 벡터 PDF가 나온다.
//  - 캡처 성공 시 로컬 다운로드는 Abort 시켜 사용자 다운로드 폴더를 더럽히지 않는다.
//  - 실패(메서드 없음/네트워크 아님/타임아웃) 시 null 반환 → 호출측이 printToPDF로 폴백.
// ★ 전제: 디버거가 이미 tabId에 attach 되어 있어야 함(호출측에서 attach/detach 관리).
async function captureClipReportPdf(tabId, timeoutMs = 30000) {
  return await new Promise(async (resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      chrome.debugger.onEvent.removeListener(onEvent);
      chrome.debugger.sendCommand({ tabId }, "Fetch.disable").catch(() => {});
      resolve(val);
    };

    const onEvent = async (source, method, params) => {
      if (source.tabId !== tabId || method !== "Fetch.requestPaused") return;
      const requestId = params.requestId;
      const headers = params.responseHeaders || [];
      const ct = (headers.find(h => h.name.toLowerCase() === "content-type")?.value || "");
      const cd = (headers.find(h => h.name.toLowerCase() === "content-disposition")?.value || "");
      const isPdf = /pdf/i.test(ct) || /\.pdf/i.test(cd) || /application\/octet-stream/i.test(ct);
      if (!isPdf) {
        // PDF가 아닌 요청은 그대로 흘려보낸다(안 그러면 페이지가 멈춤)
        chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", { requestId }).catch(() => {});
        return;
      }
      try {
        const body = await chrome.debugger.sendCommand({ tabId }, "Fetch.getResponseBody", { requestId });
        const b64 = body.base64Encoded ? body.body : btoa(unescape(encodeURIComponent(body.body)));
        // 로컬 파일로 떨어지지 않게 Abort (바이트는 이미 확보함)
        chrome.debugger.sendCommand({ tabId }, "Fetch.failRequest", { requestId, errorReason: "Aborted" }).catch(() => {});
        finish(b64 && b64.length > 1000 ? b64 : null);
      } catch (e) {
        chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", { requestId }).catch(() => {});
      }
    };

    try {
      chrome.debugger.onEvent.addListener(onEvent);
      await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
        patterns: [{ urlPattern: "*", requestStage: "Response" }],
      });
      const evalRes = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression: "(function(){try{var ks=Object.keys(m_reportHashMap||{});if(!ks.length)return 'nokey';m_reportHashMap[ks[0]].pdfDownLoad();return 'ok';}catch(e){return 'err:'+(e&&e.message);}})()",
        returnByValue: true,
      });
      const verdict = evalRes?.result?.value;
      console.log("SaveTax BG: ClipReport pdfDownLoad 호출 ->", verdict);
      if (typeof verdict !== "string" || verdict !== "ok") {
        finish(null);
        return;
      }
      setTimeout(() => finish(null), timeoutMs);
    } catch (e) {
      console.warn("SaveTax BG: ClipReport 캡처 준비 실패:", e.message);
      finish(null);
    }
  });
}

// 법인 관리번호 로그인 완료 감지 → 모든 hometax 탭 close + 새 탭 open
// 사용자 통찰: 관리번호까지 끝나면 무조건 reopen, 후속 작업(register 등)은 새 탭에서만 진행
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.savetax_login_done && changes.savetax_login_done.newValue) {
    console.log("SaveTax BG: savetax_login_done 감지!");
    setTimeout(async () => {
      try {
        const tabs = await chrome.tabs.query({ url: "https://hometax.go.kr/*" });
        // 가드 제거 — corp_login 원래 동작 회복. 시그널은 IIFE A의 관리번호 클릭 직전에만 set되므로 인증서 단계에 set될 일 없음.
        // 잔존 cookie 발동 가능성은 cookie watcher의 페이지 로드 시 정리로 대응.
        for (const tab of tabs) {
          await chrome.tabs.remove(tab.id);
        }
        await chrome.tabs.create({ url: "https://hometax.go.kr" });
        // reopen_done 마커: 새 탭에서만 후속 IIFE가 작동하도록. 같은 탭 race 차단.
        await chrome.storage.local.set({ savetax_corp_reopen_done: Date.now() });
        await chrome.storage.local.remove(["savetax_login_done", "savetax_corp_agent"]);
        console.log("SaveTax BG: 법인 로그인 완료 → reopen + reopen_done 마커 set");
      } catch (e) {
        console.error("SaveTax BG: reopen 실패:", e);
      }
    }, 3000);
  }
});

// 확장 프로그램 시작 시 버전 체크
const SERVER = "http://64.176.227.99";
const CHECK_INTERVAL = 60 * 60 * 1000; // 1시간마다

async function checkVersion() {
  try {
    const res = await fetch(SERVER + "/extension/version.json?t=" + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    const manifest = chrome.runtime.getManifest();
    if (data.version && data.version !== manifest.version) {
      // 업데이트 필요 알림
      chrome.notifications?.create("savetax-update", {
        type: "basic",
        iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        title: "SaveTax 확장 프로그램 업데이트",
        message: `새 버전(v${data.version})이 있습니다. 설정 탭에서 다운로드해주세요.`,
      });
    }
  } catch (e) {}
}

// 설치/업데이트 시 + 주기적 체크
chrome.runtime.onInstalled?.addListener(() => setTimeout(checkVersion, 5000));
setInterval(checkVersion, CHECK_INTERVAL);

// 법인 로그인: 팝업 탭 감지 → 자동 인증서 처리
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.includes("hometax.go.kr") || !tab.url.includes("popup.html")) return;

  // chrome.storage에서 인증 정보 확인
  chrome.storage.local.get("savetax_corp_cert", (data) => {
    if (!data.savetax_corp_cert) return;
    const creds = data.savetax_corp_cert;
    chrome.storage.local.remove("savetax_corp_cert");

    console.log("SaveTax BG: 팝업 탭 감지, 인증서 처리 시작", tabId);

    // 2초 대기 후 인증서 처리 코드 주입
    setTimeout(() => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: "MAIN",
        func: (certName, certPw) => {
          console.log("SaveTax: [BG-INJECT] 인증서 처리 시작");

          // 공동금융인증 버튼 클릭
          var btnInterval = setInterval(function() {
            var btn = document.getElementById("mf_btnPkcCert_type01");
            if (!btn) return;
            clearInterval(btnInterval);
            btn.click();
            console.log("SaveTax: [BG-INJECT] 공동금융인증 클릭");

            // dscert iframe 대기
            var iframeInterval = setInterval(function() {
              var f = document.querySelector("iframe[name='dscert']");
              if (!f) return;
              var d;
              try { d = f.contentDocument || f.contentWindow.document; } catch(e) { return; }
              if (!d) return;
              var pw = d.getElementById("input_cert_pw") || d.querySelector("input[type='password']");
              if (!pw) return;

              clearInterval(iframeInterval);
              console.log("SaveTax: [BG-INJECT] dscert iframe 발견");

              // 하드디스크 탭
              d.querySelectorAll("a").forEach(function(a) {
                if ((a.textContent || "").indexOf("하드디스크") !== -1) a.click();
              });

              setTimeout(function() {
                // 인증서 선택
                if (certName) {
                  d.querySelectorAll("a").forEach(function(a) {
                    if ((a.textContent || "").indexOf(certName) !== -1) {
                      a.click();
                      console.log("SaveTax: [BG-INJECT] 인증서 선택: " + certName);
                    }
                  });
                }

                setTimeout(function() {
                  // 비밀번호 입력
                  var pw2 = d.getElementById("input_cert_pw") || d.querySelector("input[type='password']");
                  if (pw2) {
                    pw2.focus(); pw2.value = certPw;
                    pw2.dispatchEvent(new Event("input", { bubbles: true }));
                    console.log("SaveTax: [BG-INJECT] 비밀번호 입력");
                  }

                  setTimeout(function() {
                    var confirmBtn = d.getElementById("btn_confirm_iframe");
                    if (confirmBtn) {
                      confirmBtn.click();
                      console.log("SaveTax: [BG-INJECT] 확인 클릭");
                    }
                  }, 500);
                }, 500);
              }, 1000);
            }, 500);
            setTimeout(function() { clearInterval(iframeInterval); }, 30000);
          }, 500);
          setTimeout(function() { clearInterval(btnInterval); }, 15000);
        },
        args: [creds.certName, creds.certPw],
      }).catch(e => console.error("SaveTax BG: 인증서 처리 실패:", e));

      // 인증 후 관리번호 입력 (15초 후 메인 탭에서)
      setTimeout(() => {
        chrome.tabs.query({ url: "https://hometax.go.kr/*" }, (tabs) => {
          const mainTab = tabs.find(t => t.url && !t.url.includes("popup.html"));
          if (!mainTab) return;

          chrome.scripting.executeScript({
            target: { tabId: mainTab.id },
            world: "MAIN",
            func: (agentNumber, agentPw) => {
              console.log("SaveTax: [BG-INJECT] 관리번호 입력 시작");
              var inputs = document.querySelectorAll("input");
              for (var i = 0; i < inputs.length; i++) {
                if ((inputs[i].title || "").indexOf("관리번호") !== -1) {
                  inputs[i].focus(); inputs[i].value = agentNumber;
                  inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
                  inputs[i].dispatchEvent(new Event("change", { bubbles: true }));
                  console.log("SaveTax: [BG-INJECT] 관리번호 입력 완료");
                  break;
                }
              }
              var pwInputs = document.querySelectorAll("input[type='password']");
              if (pwInputs.length > 0) {
                var lastPw = pwInputs[pwInputs.length - 1];
                lastPw.focus(); lastPw.value = agentPw;
                lastPw.dispatchEvent(new Event("input", { bubbles: true }));
                lastPw.dispatchEvent(new Event("change", { bubbles: true }));
                console.log("SaveTax: [BG-INJECT] 비밀번호 입력 완료");
              }
              setTimeout(function() {
                var btns = document.querySelectorAll("button, input[type='button']");
                for (var j = 0; j < btns.length; j++) {
                  if ((btns[j].textContent || btns[j].value || "").trim() === "로그인" && btns[j].offsetParent) {
                    btns[j].click();
                    console.log("SaveTax: [BG-INJECT] 로그인 클릭");
                    break;
                  }
                }
              }, 300);
            },
            args: [creds.agentNumber, creds.agentPw],
          }).catch(e => console.error("SaveTax BG: 관리번호 입력 실패:", e));
        });
      }, 15000);
    }, 2000);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "print-pdf") {
    (async () => {
      try {
        // 리포트 탭 찾기: 홈택스 리포트 URL만 인정. 기본 15초 대기,
        // 신고서 일괄출력처럼 렌더가 긴 경우 msg.waitSec으로 연장(최대 300초)
        // ★ "마지막 탭" 폴백 금지 — 사용자가 보던 무관한 탭을 PDF로 찍어버리는 사고 방지
        const waitSec = Math.min(Math.max(Number(msg.waitSec) || 15, 15), 300);
        let reportTab = null;
        for (let i = 0; i < waitSec * 2; i++) {
          const allTabs = await chrome.tabs.query({});
          reportTab = allTabs.find(t => t.url && (t.url.includes("clipreport.do") || t.url.includes("sesw.hometax.go.kr")));
          if (reportTab && reportTab.status === "complete") break;
          await new Promise(r => setTimeout(r, 500));
        }
        if (!reportTab?.id || reportTab.status !== "complete") {
          sendResponse({ ok: false, error: "리포트(미리보기) 탭을 찾지 못했습니다" });
          return;
        }

        let pdfBase64 = null;
        let captureMethod = null;
        await chrome.debugger.attach({ tabId: reportTab.id }, "1.3");
        try {
          // 1순위: ClipReport 네이티브 PDF 저장(pdfDownLoad) — 툴바 없는 전체 벡터 PDF
          pdfBase64 = await captureClipReportPdf(reportTab.id);
          if (pdfBase64) captureMethod = "clipreport-pdf";

          // 폴백: 화면 인쇄(printToPDF) — 네이티브 저장이 안 될 때만
          if (!pdfBase64) {
            const result = await chrome.debugger.sendCommand({ tabId: reportTab.id }, "Page.printToPDF", {
              printBackground: true,
              preferCSSPageSize: true,
              paperWidth: 8.27,
              paperHeight: 11.69,
            });
            pdfBase64 = result.data;
            captureMethod = "print-to-pdf";
          }
        } finally {
          try { await chrome.debugger.detach({ tabId: reportTab.id }); } catch (e) {}
        }
        console.log("SaveTax BG: PDF 캡처 방식 =", captureMethod);
        const result = { data: pdfBase64 };

        const clientName = (msg.clientName || "거래처").replace(/[/\\:*?"<>|]/g, "_");
        const docName = (msg.docName || "문서").replace(/[/\\:*?"<>|]/g, "_");

        // 앱 서버에 PDF 업로드 (자료수집 상태·파일 열람용)
        let uploaded = false;
        let uploadError = null;
        if (msg.upload && msg.upload.appOrigin) {
          try {
            const up = msg.upload;
            const res = await fetch(`${up.appOrigin}/api/data-collect/upload`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: up.token || "",
                clientId: up.clientId,
                docType: up.docType,
                taxYear: up.taxYear,
                fileName: up.fileName || `${docName}.pdf`,
                dataBase64: result.data,
              }),
            });
            const data = await res.json().catch(() => ({}));
            uploaded = res.ok && data.ok;
            if (!uploaded) uploadError = data.error || `HTTP ${res.status}`;
            console.log("SaveTax BG: 앱 업로드", uploaded ? "성공" : "실패 - " + uploadError);
          } catch (e) {
            uploadError = e.message;
            console.error("SaveTax BG: 앱 업로드 실패:", e);
          }
        }

        // 앱에 업로드됐으면 로컬 다운로드 생략 (다운로드 폴더에 사본·중복 쌓임 방지)
        // 업로드 실패했거나 업로드 대상이 아닌 경우에만 로컬 저장
        if (!uploaded) {
          await chrome.downloads.download({
            url: "data:application/pdf;base64," + result.data,
            filename: `${clientName}/${docName}.pdf`,
            conflictAction: "uniquify",
          });
        }

        // 리포트 탭 ID 저장 (close-report-tab에서 사용)
        globalThis._savetaxReportTabId = reportTab.id;

        sendResponse({ ok: true, uploaded, uploadError });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === "close-report-tab") {
    (async () => {
      try {
        // 리포트 탭 닫기
        const allTabs = await chrome.tabs.query({});
        const reportTab = allTabs.find(t => t.url && t.url.includes("clipreport.do"));
        if (reportTab?.id) {
          await chrome.tabs.remove(reportTab.id);
        } else if (globalThis._savetaxReportTabId) {
          try { await chrome.tabs.remove(globalThis._savetaxReportTabId); } catch {}
        }
        // 신고서보기/공개여부 팝업 창이 남아 있으면 함께 닫기 (다음 행 수집 시 혼선 방지)
        for (const t of allTabs) {
          if (t.url && (t.url.includes("UTERNAAZ34") || t.url.includes("UTERNAAZ39"))) {
            try { await chrome.tabs.remove(t.id); } catch (e) {}
          }
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  // 자료수집 완료 → 앱 DB에 수집 상태 반영 (앱 로그인 세션 쿠키 포함)
  if (msg.type === "mark-collected") {
    (async () => {
      try {
        if (!msg.appOrigin || !msg.clientId || !msg.docType || !msg.taxYear) {
          sendResponse({ ok: false, error: "appOrigin/clientId/docType/taxYear 필요" });
          return;
        }
        const res = await fetch(`${msg.appOrigin}/api/data-collect/mark`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: msg.token || "",
            clientId: msg.clientId,
            docType: msg.docType,
            taxYear: msg.taxYear,
            params: msg.params || null,
            status: msg.status || "collected",
          }),
        });
        const data = await res.json().catch(() => ({}));

        // 수집 완료 → 앱(data-collect) 탭을 앞으로 가져와 결과를 바로 보이게 (진행/완료 인지 + 자동 갱신)
        try {
          const all = await chrome.tabs.query({});
          const appTab = all.find(t => t.url && t.url.indexOf(msg.appOrigin) === 0 && t.url.indexOf("/data-collect") !== -1);
          if (appTab && appTab.id != null) {
            await chrome.tabs.update(appTab.id, { active: true });
            if (appTab.windowId != null) await chrome.windows.update(appTab.windowId, { focused: true });
            console.log("SaveTax BG: 앱 data-collect 탭 활성화");
          }
        } catch (e) { console.warn("SaveTax BG: 앱 탭 활성화 실패", e.message); }

        sendResponse({ ok: res.ok, status: res.status, ...data });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === "fetch-file") {
    fetch(msg.url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        sendResponse({ ok: true, data: btoa(binary), type: blob.type });
      })
      .catch(err => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  // 법인 로그인: 팝업 탭에서 MAIN world 코드 실행
  if (msg.type === "exec-corp-cert") {
    (async () => {
      try {
        // sender.tab.id로 정확한 팝업 탭 사용
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ ok: false, error: "탭 ID 없음" }); return; }
        console.log("SaveTax BG: exec-corp-cert 수신, tabId:", tabId);

        // MAIN world에서 인증서 처리 코드 실행
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: "MAIN",
          func: (certName, certPw) => {
            function doCorpCert() {
              // 공동금융인증 버튼 클릭
              var btn = document.getElementById("mf_btnPkcCert_type01");
              if (btn) {
                btn.click();
                console.log("SaveTax: [BG] 공동금융인증 클릭");
              }

              // dscert iframe 대기
              var interval = setInterval(function() {
                var f = document.querySelector("iframe[name='dscert']");
                if (!f) return;
                var d;
                try { d = f.contentDocument || f.contentWindow.document; } catch(e) { return; }
                if (!d) return;
                var pw = d.getElementById("input_cert_pw") || d.querySelector("input[type='password']");
                if (!pw) return;

                clearInterval(interval);
                console.log("SaveTax: [BG] dscert iframe 발견");

                // 하드디스크 탭
                d.querySelectorAll("a").forEach(function(a) {
                  if ((a.textContent || "").indexOf("하드디스크") !== -1) a.click();
                });

                setTimeout(function() {
                  // 인증서 선택
                  if (certName) {
                    d.querySelectorAll("a").forEach(function(a) {
                      if ((a.textContent || "").indexOf(certName) !== -1) {
                        a.click();
                        console.log("SaveTax: [BG] 인증서 선택: " + certName);
                      }
                    });
                  }

                  setTimeout(function() {
                    // 비밀번호 입력
                    var pw2 = d.getElementById("input_cert_pw") || d.querySelector("input[type='password']");
                    if (pw2) {
                      pw2.focus();
                      pw2.value = certPw;
                      pw2.dispatchEvent(new Event("input", { bubbles: true }));
                      console.log("SaveTax: [BG] 비밀번호 입력");
                    }

                    setTimeout(function() {
                      var confirmBtn = d.getElementById("btn_confirm_iframe");
                      if (confirmBtn) {
                        confirmBtn.click();
                        console.log("SaveTax: [BG] 확인 클릭");
                      }
                    }, 500);
                  }, 500);
                }, 1000);
              }, 500);
              setTimeout(function() { clearInterval(interval); }, 30000);
            }
            doCorpCert();
          },
          args: [msg.certName, msg.certPw],
        });

        // 인증 후 15초 뒤 관리번호 입력
        if (msg.agentNumber) {
          setTimeout(() => {
            chrome.tabs.query({ url: "https://hometax.go.kr/*" }, (tabs) => {
              const mainTab = tabs.find(t => !t.url.includes("popup.html"));
              if (!mainTab) return;
              console.log("SaveTax BG: 관리번호 입력 시작, tabId:", mainTab.id);
              chrome.scripting.executeScript({
                target: { tabId: mainTab.id },
                world: "MAIN",
                func: (agentNumber, agentPw) => {
                  console.log("SaveTax: [BG] 관리번호 입력 시작");
                  var inputs = document.querySelectorAll("input");
                  for (var i = 0; i < inputs.length; i++) {
                    if ((inputs[i].title || "").indexOf("관리번호") !== -1) {
                      inputs[i].focus(); inputs[i].value = agentNumber;
                      inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
                      console.log("SaveTax: [BG] 관리번호 입력 완료");
                      break;
                    }
                  }
                  var pwInputs = document.querySelectorAll("input[type='password']");
                  if (pwInputs.length > 0) {
                    var lastPw = pwInputs[pwInputs.length - 1];
                    lastPw.focus(); lastPw.value = agentPw;
                    lastPw.dispatchEvent(new Event("input", { bubbles: true }));
                    console.log("SaveTax: [BG] 비밀번호 입력 완료");
                  }
                  setTimeout(function() {
                    var btns = document.querySelectorAll("button, input[type='button']");
                    for (var j = 0; j < btns.length; j++) {
                      if ((btns[j].textContent || btns[j].value || "").trim() === "로그인" && btns[j].offsetParent) {
                        btns[j].click();
                        console.log("SaveTax: [BG] 로그인 클릭");
                        break;
                      }
                    }
                  }, 300);
                },
                args: [msg.agentNumber, msg.agentPw],
              }).catch(e => console.error("SaveTax BG: 관리번호 실패:", e));
            });
          }, 15000);
        }

        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // 법인 로그인: 원래 탭에서 관리번호 입력 (수동 호출용)
  if (msg.type === "exec-corp-agent") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: "https://hometax.go.kr/*" });
        const mainTab = tabs.find(t => t.url && !t.url.includes("popup.html"));
        if (!mainTab) { sendResponse({ ok: false, error: "메인 탭 없음" }); return; }

        await chrome.scripting.executeScript({
          target: { tabId: mainTab.id },
          world: "MAIN",
          func: (agentNumber, agentPw) => {
            var inputs = document.querySelectorAll("input");
            for (var i = 0; i < inputs.length; i++) {
              if ((inputs[i].title || "").indexOf("관리번호") !== -1) {
                inputs[i].focus(); inputs[i].value = agentNumber;
                inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
                console.log("SaveTax: [BG] 관리번호 입력");
                break;
              }
            }
            // 비밀번호
            var pwInputs = document.querySelectorAll("input[type='password']");
            if (pwInputs.length > 0) {
              var lastPw = pwInputs[pwInputs.length - 1];
              lastPw.focus(); lastPw.value = agentPw;
              lastPw.dispatchEvent(new Event("input", { bubbles: true }));
              console.log("SaveTax: [BG] 비밀번호 입력");
            }
            // 로그인 클릭
            setTimeout(function() {
              var btns = document.querySelectorAll("button, input[type='button']");
              for (var j = 0; j < btns.length; j++) {
                if ((btns[j].textContent || btns[j].value || "").trim() === "로그인" && btns[j].offsetParent) {
                  btns[j].click();
                  console.log("SaveTax: [BG] 로그인 클릭");
                  break;
                }
              }
            }, 300);
          },
          args: [msg.agentNumber, msg.agentPw],
        });

        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === "download-files") {
    (async () => {
      try {
        let count = 0;
        for (const file of msg.files) {
          if (!file.url) continue;
          const path = await downloadFile(file.url, file.filename, false);
          if (path) count++;
        }
        sendResponse({ ok: count > 0, count });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === "upload-files") {
    handleFileUpload(msg.files, sender.tab.id)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // 사업소득 엑셀 → 구글드라이브 업로드
  if (msg.type === "upload-business-income") {
    (async () => {
      try {
        // 1. 최근 다운로드된 엑셀 찾기
        const downloads = await chrome.downloads.search({
          filenameRegex: ".*\\.xlsx$",
          orderBy: ["-startTime"],
          limit: 1,
          state: "complete",
        });

        if (!downloads || downloads.length === 0) {
          sendResponse({ ok: false, error: "다운로드된 엑셀 파일을 찾을 수 없습니다" });
          return;
        }

        const downloadItem = downloads[0];
        console.log("SaveTax BG: 엑셀 파일 찾음:", downloadItem.filename);

        // 2. 원본 다운로드 URL로 파일 다시 fetch → base64 변환
        let base64 = null;
        const downloadUrl = downloadItem.finalUrl || downloadItem.url;

        if (downloadUrl && !downloadUrl.startsWith("file:")) {
          try {
            const res = await fetch(downloadUrl);
            const blob = await res.blob();
            const buf = await blob.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = "";
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
            }
            base64 = btoa(binary);
            console.log("SaveTax BG: 파일 fetch 성공, size:", bytes.length);
          } catch (e) {
            console.log("SaveTax BG: URL fetch 실패, content script로 시도:", e.message);
          }
        }

        // 3. URL fetch 실패 시 → content script에서 XMLHttpRequest로 시도
        if (!base64) {
          // sender 탭에서 다운로드 URL로 fetch 시도
          try {
            const [result] = await chrome.scripting.executeScript({
              target: { tabId: sender.tab.id },
              func: async (url) => {
                try {
                  const res = await fetch(url);
                  const blob = await res.blob();
                  return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(",")[1]);
                    reader.readAsDataURL(blob);
                  });
                } catch {
                  return null;
                }
              },
              args: [downloadUrl],
            });
            if (result?.result) {
              base64 = result.result;
              console.log("SaveTax BG: content script fetch 성공");
            }
          } catch (e) {
            console.log("SaveTax BG: content script fetch도 실패:", e.message);
          }
        }

        if (!base64) {
          sendResponse({ ok: false, error: "파일을 읽을 수 없습니다. 수동으로 구글드라이브에 업로드해주세요." });
          return;
        }

        // 4. 서버 API로 전송
        const monthPadded = String(msg.month).padStart(2, "0");
        const uploadRes = await fetch("http://localhost:3000/api/automation/upload-business-income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: msg.clientName,
            year: msg.year,
            month: monthPadded,
            fileBase64: base64,
            fileName: `${msg.year}년 ${monthPadded}월 사업소득조회_${msg.clientName}.xlsx`,
          }),
        });
        const result = await uploadRes.json();
        sendResponse(result);
      } catch (e) {
        console.error("SaveTax BG: 업로드 실패:", e);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // 홈택스 로그인 완료 → 탭 닫고 새 탭으로 홈택스 열기

  if (msg.type === "hometax-reopen") {
    (async () => {
      try {
        // 현재 홈택스 탭 닫기
        if (sender.tab?.id) {
          await chrome.tabs.remove(sender.tab.id);
        }
        // 새 탭으로 홈택스 열기
        await chrome.tabs.create({ url: "https://hometax.go.kr" });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // 일용직 pyautogui 저장
  if (msg.type === "save-daily-worker") {
    (async () => {
      try {
        const monthPadded = String(msg.month).padStart(2, "0");
        const res = await fetch("http://localhost:3000/api/automation/save-daily-worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: msg.clientName,
            year: msg.year,
            month: monthPadded,
          }),
        });
        const result = await res.json();
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // 위하고 급여명세서 pyautogui 저장
  if (msg.type === "save-payslip-pdf") {
    (async () => {
      try {
        const res = await fetch("http://localhost:3000/api/automation/save-payslip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: msg.clientName,
            year: msg.year,
            month: msg.month,
          }),
        });
        const result = await res.json();
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // 위하고 급여명세서 PDF 저장 (content script가 보낸 탭에서 직접)
  if (msg.type === "wehago-print-pdf") {
    (async () => {
      try {
        const tabId = sender.tab?.id;
        if (!tabId) { sendResponse({ ok: false, error: "탭 ID 없음" }); return; }

        await chrome.debugger.attach({ tabId }, "1.3");
        const result = await chrome.debugger.sendCommand({ tabId }, "Page.printToPDF", {
          printBackground: true,
          preferCSSPageSize: true,
          paperWidth: 8.27,
          paperHeight: 11.69,
        });
        await chrome.debugger.detach({ tabId });

        const docName = (msg.docName || "급여명세서").replace(/[/\\:*?"<>|]/g, "_");
        const dataUrl = "data:application/pdf;base64," + result.data;

        await chrome.downloads.download({
          url: dataUrl,
          filename: `급여명세서/${docName}.pdf`,
          conflictAction: "uniquify",
        });

        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});

async function handleFileUpload(files, tabId) {
  // 1. 파일 다운로드
  const downloadedPaths = [];
  for (const file of files) {
    if (!file.url) continue;
    try {
      const path = await downloadFile(file.url, file.filename);
      if (path) {
        downloadedPaths.push(path);
        console.log("다운로드 완료:", path);
      }
    } catch (e) {
      console.error("다운로드 실패:", file.url, e);
    }
  }

  if (downloadedPaths.length === 0) {
    return { ok: false, error: "다운로드된 파일 없음" };
  }

  // 2. Debugger 연결
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (e) {
    return { ok: false, error: "디버거 연결 실패: " + e.message };
  }

  let uploadCount = 0;
  try {
    await chrome.debugger.sendCommand({ tabId }, "DOM.enable");
    await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");

    // 파일 다이얼로그 가로채기 활성화
    await chrome.debugger.sendCommand({ tabId }, "Page.setInterceptFileChooserDialog", { enabled: true });

    for (let i = 0; i < downloadedPaths.length; i++) {
      const filePath = downloadedPaths[i];

      // 파일 다이얼로그 열릴 때 DOM.setFileInputFiles로 직접 주입
      const fileChooserPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          chrome.debugger.onEvent.removeListener(handler);
          resolve(false);
        }, 10000);

        function handler(source, method, params) {
          if (source.tabId === tabId && method === "Page.fileChooserOpened") {
            clearTimeout(timeout);
            chrome.debugger.onEvent.removeListener(handler);
            // backendNodeId로 직접 파일 설정
            chrome.debugger.sendCommand({ tabId }, "DOM.setFileInputFiles", {
              backendNodeId: params.backendNodeId,
              files: [filePath],
            }).then(() => {
              console.log("파일 주입 완료:", filePath);
              resolve(true);
            }).catch((e) => {
              console.error("파일 주입 실패 (DOM.setFileInputFiles):", e);
              resolve(false);
            });
          }
        }
        chrome.debugger.onEvent.addListener(handler);
      });

      // "파일선택" 버튼 좌표 가져오기
      const btnResult = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression: `(() => {
          const btn = document.getElementById("mf_txppWframe_pf_UTECAAAZ03_pf_UTECMGAA06_UTECMGAA06_trigger1");
          if (!btn) return null;
          const rect = btn.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`,
        returnByValue: true,
      });

      if (!btnResult.result.value) {
        console.log("파일선택 버튼을 찾을 수 없음");
        continue;
      }

      const { x, y } = btnResult.result.value;
      console.log(`파일선택 버튼 클릭 (${i + 1}/${downloadedPaths.length}) 좌표: ${x}, ${y}`);

      // 진짜 마우스 클릭 시뮬레이션 (user activation 발생!)
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
        type: "mousePressed", x, y, button: "left", clickCount: 1,
      });
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x, y, button: "left", clickCount: 1,
      });

      // 파일 다이얼로그 자동 처리 대기
      const success = await fileChooserPromise;
      if (success) uploadCount++;

      await new Promise(r => setTimeout(r, 1500));
    }

    // 파일 다이얼로그 가로채기 해제
    try {
      await chrome.debugger.sendCommand({ tabId }, "Page.setInterceptFileChooserDialog", { enabled: false });
    } catch (e) {}

  } catch (e) {
    console.error("파일 업로드 중 오류:", e);
  }

  // 3. 정리
  try { await chrome.debugger.detach({ tabId }); } catch (e) {}

  // 임시 파일 정리
  for (const path of downloadedPaths) {
    try {
      const items = await chrome.downloads.search({ filename: path });
      for (const item of items) {
        await chrome.downloads.removeFile(item.id);
        await chrome.downloads.erase({ id: item.id });
      }
    } catch (e) {}
  }

  return { ok: true, count: uploadCount };
}

function downloadFile(url, filename, useTemp = true) {
  return new Promise(async (resolve) => {
    try {
      // fetch로 파일 데이터 가져오기
      const res = await fetch(url);
      if (!res.ok) {
        console.error("downloadFile fetch 실패:", url, res.status);
        resolve(null);
        return;
      }
      const blob = await res.blob();
      const buf = await blob.arrayBuffer();

      // ArrayBuffer → base64 data URL (서비스 워커에서 FileReader 대신)
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      const dataUrl = "data:" + (blob.type || "application/octet-stream") + ";base64," + btoa(binary);

      const saveName = filename || url.split("/").pop() || "file";
      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: useTemp ? "savetax_temp/" + saveName : saveName,
        conflictAction: "overwrite",
      });

      console.log("다운로드 시작 ID:", downloadId);

      const checkComplete = () => {
        chrome.downloads.search({ id: downloadId }, (items) => {
          if (items && items.length > 0) {
            if (items[0].state === "complete") {
              console.log("다운로드 완료 경로:", items[0].filename);
              resolve(items[0].filename);
            } else if (items[0].state === "interrupted") {
              console.error("다운로드 중단:", items[0].error);
              resolve(null);
            } else {
              setTimeout(checkComplete, 300);
            }
          } else {
            resolve(null);
          }
        });
      };
      setTimeout(checkComplete, 500);
    } catch (e) {
      console.error("downloadFile 오류:", e);
      resolve(null);
    }
  });
}
