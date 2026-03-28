// 홈택스 alert 자동 닫기 + 파일 업로드 가로채기 (MAIN world)
(function() {
  // alert 자동 닫기
  window.alert = function(msg) {
    console.log("SaveTax: alert 자동 닫기 →", msg);
  };

  // 파일 업로드 가로채기: file input의 click()을 가로채서 파일 주입
  window.__savetaxPendingFiles = [];

  const origClick = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function() {
    if (this.tagName === "INPUT" && this.type === "file" && window.__savetaxPendingFiles.length > 0) {
      const fileData = window.__savetaxPendingFiles.shift();
      console.log("SaveTax: 파일 다이얼로그 가로채기 →", fileData.name);

      try {
        const binary = atob(fileData.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const file = new File([bytes], fileData.name, { type: fileData.type });

        const dt = new DataTransfer();
        dt.items.add(file);
        this.files = dt.files;
        this.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("SaveTax: 파일 주입 완료 →", fileData.name);
      } catch (e) {
        console.error("SaveTax: 파일 주입 실패:", e);
      }
      return;
    }
    return origClick.call(this);
  };

  // MAIN world 클릭 중계 + 파일 데이터 수신 (beacon DOM 통신)
  const beacon = document.createElement("div");
  beacon.id = "__savetax_beacon";
  beacon.style.display = "none";
  document.documentElement.appendChild(beacon);

  new MutationObserver(function() {
    const fileJson = beacon.getAttribute("data-pending-file");
    if (fileJson) {
      beacon.removeAttribute("data-pending-file");
      try {
        const fileData = JSON.parse(fileJson);
        window.__savetaxPendingFiles.push(fileData);
        console.log("SaveTax: 파일 데이터 수신 →", fileData.name);
      } catch (e) {}
    }

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
})();
