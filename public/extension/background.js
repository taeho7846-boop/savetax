// 서비스 워커: 파일 fetch + Input.dispatchMouseEvent + Page.handleFileChooser

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
        // 리포트 탭 찾기 (sesw.hometax.go.kr 또는 마지막 탭)
        const allTabs = await chrome.tabs.query({});
        let reportTab = allTabs.find(t => t.url && t.url.includes("clipreport.do"));
        if (!reportTab) reportTab = allTabs[allTabs.length - 1];
        if (!reportTab?.id) { sendResponse({ ok: false, error: "리포트 탭 없음" }); return; }

        await chrome.debugger.attach({ tabId: reportTab.id }, "1.3");
        const result = await chrome.debugger.sendCommand({ tabId: reportTab.id }, "Page.printToPDF", {
          printBackground: true,
          preferCSSPageSize: true,
          paperWidth: 8.27,
          paperHeight: 11.69,
        });
        await chrome.debugger.detach({ tabId: reportTab.id });

        // 거래처명 폴더 안에 저장
        const clientName = (msg.clientName || "거래처").replace(/[/\\:*?"<>|]/g, "_");
        const docName = (msg.docName || "문서").replace(/[/\\:*?"<>|]/g, "_");
        const filename = `${clientName}/${docName}.pdf`;
        const dataUrl = "data:application/pdf;base64," + result.data;

        await chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          conflictAction: "uniquify",
        });

        // 리포트 탭 ID 저장 (close-report-tab에서 사용)
        globalThis._savetaxReportTabId = reportTab.id;

        sendResponse({ ok: true });
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
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false });
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
