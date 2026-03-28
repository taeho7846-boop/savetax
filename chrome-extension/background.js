// 서비스 워커: 파일 fetch + DOM.setFileInputFiles로 직접 파일 주입

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

    for (let i = 0; i < downloadedPaths.length; i++) {
      const filePath = downloadedPaths[i];

      // 파일선택 버튼 클릭 (input[type=file] 생성 유도)
      await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression: `document.getElementById("mf_txppWframe_pf_UTECAAAZ03_pf_UTECMGAA06_UTECMGAA06_trigger1")?.click()`,
      });
      console.log(`파일선택 버튼 클릭 (${i + 1}/${downloadedPaths.length})`);

      // input[type=file] 생성 대기
      await new Promise(r => setTimeout(r, 1000));

      // input[type=file] 찾기
      const result = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression: `(() => {
          const inputs = document.querySelectorAll("input[type='file']");
          for (const input of inputs) {
            if (!input._savetaxDone) {
              input._savetaxDone = true;
              return true;
            }
          }
          // iframe 안에서도 찾기
          const iframes = document.querySelectorAll("iframe");
          for (const iframe of iframes) {
            try {
              const iInputs = iframe.contentDocument.querySelectorAll("input[type='file']");
              for (const input of iInputs) {
                if (!input._savetaxDone) {
                  input._savetaxDone = true;
                  return true;
                }
              }
            } catch(e) {}
          }
          return false;
        })()`,
        returnByValue: true,
      });

      // DOM.querySelector로 file input의 nodeId 가져오기
      const doc = await chrome.debugger.sendCommand({ tabId }, "DOM.getDocument", { depth: 0 });

      // 모든 file input 찾기
      const nodeResult = await chrome.debugger.sendCommand({ tabId }, "DOM.querySelectorAll", {
        nodeId: doc.root.nodeId,
        selector: "input[type='file']",
      });

      if (nodeResult.nodeIds && nodeResult.nodeIds.length > 0) {
        // 마지막으로 생성된 file input 사용
        const targetNodeId = nodeResult.nodeIds[nodeResult.nodeIds.length - 1];

        try {
          await chrome.debugger.sendCommand({ tabId }, "DOM.setFileInputFiles", {
            nodeId: targetNodeId,
            files: [filePath],
          });
          console.log(`파일 주입 완료 (${i + 1}):`, filePath);
          uploadCount++;
        } catch (e) {
          console.error(`파일 주입 실패 (${i + 1}):`, e);
        }
      } else {
        console.log("file input을 찾을 수 없음");
      }

      await new Promise(r => setTimeout(r, 1000));
    }
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
      const res = await fetch(url);
      if (!res.ok) { resolve(null); return; }
      const blob = await res.blob();
      const dataUrl = await blobToDataUrl(blob);

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: "savetax_temp/" + (filename || url.split("/").pop() || "file"),
        conflictAction: "overwrite",
      });

      const checkComplete = () => {
        chrome.downloads.search({ id: downloadId }, (items) => {
          if (items && items.length > 0) {
            if (items[0].state === "complete") {
              resolve(items[0].filename);
            } else if (items[0].state === "interrupted") {
              resolve(null);
            } else {
              setTimeout(checkComplete, 200);
            }
          } else {
            resolve(null);
          }
        });
      };
      setTimeout(checkComplete, 300);
    } catch (e) {
      resolve(null);
    }
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
