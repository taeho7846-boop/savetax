// 웹앱에서 보낸 메시지를 받아서 chrome.storage에 저장 후 홈택스 열기
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === "HOMETAX_LOGIN") {
    // 자격증명 저장
    chrome.storage.local.set({
      hometaxId: message.hometaxId,
      hometaxPw: message.hometaxPw,
      residentNumber: message.residentNumber || "",
    }, () => {
      // 홈택스 로그인 페이지 열기
      chrome.tabs.create({
        url: "https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3"
      });
      sendResponse({ success: true });
    });
    return true; // 비동기 응답
  }
});
