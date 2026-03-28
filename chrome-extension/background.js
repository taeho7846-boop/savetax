// 서비스 워커: 파일 fetch + 파일 다이얼로그 자동 처리

// 1. HTTP 파일 fetch (Mixed Content 우회)
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

  // 2. 파일 다운로드 + 파일 다이얼로그 자동 처리
  if (msg.type === "upload-files") {
    handleFileUpload(msg.files, sender.tab.id)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function handleFileUpload(files, tabId) {
  const downloadedPaths = [];

  // 파일 다운로드
  for (const file of files) {
    if (!file.url) continue;
    try {
      const path = await downloadFile(file.url, file.filename);
      if (path) downloadedPaths.push(path);
    } catch (e) {
      console.error("다운로드 실패:", file.url, e);
    }
  }

  if (downloadedPaths.length === 0) {
    return { ok: false, error: "다운로드된 파일 없음" };
  }

  // Debugger로 파일 다이얼로그 가로채기
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    await chrome.debugger.sendCommand({ tabId }, "Page.setInterceptFileChooserDialog", { enabled: true });

    // 파일 선택 대기 핸들러 등록
    let fileIndex = 0;
    const fileChooserHandler = async (source, method, params) => {
      if (method === "Page.fileChooserOpened" && fileIndex < downloadedPaths.length) {
        const filePath = downloadedPaths[fileIndex];
        fileIndex++;
        try {
          await chrome.debugger.sendCommand({ tabId }, "Page.handleFileChooser", {
            action: "accept",
            files: [filePath],
          });
          console.log("파일 주입 완료:", filePath);
        } catch (e) {
          console.error("파일 주입 실패:", e);
          try {
            await chrome.debugger.sendCommand({ tabId }, "Page.handleFileChooser", {
              action: "cancel",
            });
          } catch (e2) {}
        }
      }
    };
    chrome.debugger.onEvent.addListener(fileChooserHandler);

    // content script에 "파일선택 버튼 클릭" 신호 보내기
    await chrome.tabs.sendMessage(tabId, {
      type: "click-file-buttons",
      count: downloadedPaths.length,
    });

    // 모든 파일이 처리될 때까지 대기 (최대 30초)
    const startTime = Date.now();
    while (fileIndex < downloadedPaths.length && Date.now() - startTime < 30000) {
      await new Promise(r => setTimeout(r, 500));
    }

    // 정리
    chrome.debugger.onEvent.removeListener(fileChooserHandler);
    try {
      await chrome.debugger.sendCommand({ tabId }, "Page.setInterceptFileChooserDialog", { enabled: false });
    } catch (e) {}
    try {
      await chrome.debugger.detach({ tabId });
    } catch (e) {}

    // 다운로드한 임시 파일 삭제
    for (const path of downloadedPaths) {
      try {
        const items = await chrome.downloads.search({ filename: path });
        for (const item of items) {
          await chrome.downloads.removeFile(item.id);
          await chrome.downloads.erase({ id: item.id });
        }
      } catch (e) {}
    }

    return { ok: true, count: fileIndex };
  } catch (e) {
    try { await chrome.debugger.detach({ tabId }); } catch (e2) {}
    return { ok: false, error: e.message };
  }
}

function downloadFile(url, filename) {
  return new Promise(async (resolve) => {
    try {
      // fetch로 파일 데이터 가져오기
      const res = await fetch(url);
      if (!res.ok) { resolve(null); return; }
      const blob = await res.blob();
      const dataUrl = await blobToDataUrl(blob);

      // chrome.downloads로 저장
      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: "savetax_temp/" + (filename || url.split("/").pop() || "file"),
        conflictAction: "overwrite",
      });

      // 다운로드 완료 대기
      const checkComplete = () => {
        chrome.downloads.search({ id: downloadId }, (items) => {
          if (items && items.length > 0) {
            if (items[0].state === "complete") {
              resolve(items[0].filename); // 전체 파일 경로 반환
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
      console.error("downloadFile 실패:", e);
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
