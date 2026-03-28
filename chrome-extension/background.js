// 서비스 워커: content script 대신 HTTP 파일을 fetch (Mixed Content 우회)
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
});
