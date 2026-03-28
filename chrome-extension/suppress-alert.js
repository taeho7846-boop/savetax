// 홈택스 alert 자동 닫기 + 파일 업로드 가로채기 (MAIN world)
(function() {
  // alert 자동 닫기
  window.alert = function(msg) {
    console.log("SaveTax: alert 자동 닫기 →", msg);
  };

  // MAIN world 클릭 중계 (beacon DOM 통신)
  const beacon = document.createElement("div");
  beacon.id = "__savetax_beacon";
  beacon.style.display = "none";
  document.documentElement.appendChild(beacon);

  new MutationObserver(function() {
    // 파일 데이터 수신
    const fileJson = beacon.getAttribute("data-pending-file");
    if (fileJson) {
      beacon.removeAttribute("data-pending-file");
      try {
        const fileData = JSON.parse(fileJson);
        window.__savetaxPendingFiles.push(fileData);
        console.log("SaveTax: 파일 데이터 수신 →", fileData.name);
      } catch (e) {}
    }

    // 클릭 요청
    const id = beacon.getAttribute("data-click");
    if (id) {
      beacon.removeAttribute("data-click");
      const el = document.getElementById(id);
      if (el) {
        el.click();
        console.log("SaveTax: MAIN world 클릭 →", id);
      }
    }
  }).observe(beacon, { attributes: true });

  // 파일 업로드 가로채기: input[type=file]의 click()을 오버라이드
  window.__savetaxPendingFiles = [];

  const origClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function() {
    if (this.type === "file" && window.__savetaxPendingFiles.length > 0) {
      const fileData = window.__savetaxPendingFiles.shift();
      console.log("SaveTax: 파일 다이얼로그 가로채기 →", fileData.name);

      // base64 → File
      const binary = atob(fileData.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], fileData.name, { type: fileData.type });

      const dt = new DataTransfer();
      dt.items.add(file);
      this.files = dt.files;
      this.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    return origClick.call(this);
  };
})();
