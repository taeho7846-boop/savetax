// 서비스 워커: 파일 fetch + Input.dispatchMouseEvent + Page.handleFileChooser

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

      // 파일 다이얼로그 열릴 때 자동 처리할 Promise
      const fileChooserPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          chrome.debugger.onEvent.removeListener(handler);
          resolve(false);
        }, 10000);

        function handler(source, method, params) {
          if (source.tabId === tabId && method === "Page.fileChooserOpened") {
            clearTimeout(timeout);
            chrome.debugger.onEvent.removeListener(handler);
            chrome.debugger.sendCommand({ tabId }, "Page.handleFileChooser", {
              action: "accept",
              files: [filePath],
            }).then(() => {
              console.log("파일 주입 완료:", filePath);
              resolve(true);
            }).catch((e) => {
              console.error("파일 주입 실패:", e);
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

function downloadFile(url, filename) {
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

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: "savetax_temp/" + (filename || url.split("/").pop() || "file"),
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
