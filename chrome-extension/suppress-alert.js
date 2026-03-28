// 홈택스 alert 자동 닫기 + 파일 업로드 가로채기 (MAIN world)
(function() {
  // alert 자동 닫기
  window.alert = function(msg) {
    console.log("SaveTax: alert 자동 닫기 →", msg);
  };

  // 파일 업로드 가로채기
  window.__savetaxPendingFiles = [];

  // 방법 1: click 이벤트 캡처링
  document.addEventListener("click", function(e) {
    if (e.target && e.target.tagName === "INPUT" && e.target.type === "file" && window.__savetaxPendingFiles.length > 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      injectFile(e.target);
    }
  }, true);

  // 방법 2: HTMLElement.prototype.click 오버라이드
  const origClick = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function() {
    if (this.tagName === "INPUT" && this.type === "file" && window.__savetaxPendingFiles.length > 0) {
      injectFile(this);
      return;
    }
    return origClick.call(this);
  };

  // 방법 3: showPicker 오버라이드
  if (HTMLInputElement.prototype.showPicker) {
    const origShowPicker = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function() {
      if (this.type === "file" && window.__savetaxPendingFiles.length > 0) {
        injectFile(this);
        return;
      }
      return origShowPicker.call(this);
    };
  }

  // 방법 4: input[type=file] 생성 감지 (MutationObserver)
  new MutationObserver(function(mutations) {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const inputs = node.tagName === "INPUT" ? [node] : (node.querySelectorAll ? [...node.querySelectorAll("input[type='file']")] : []);
        for (const input of inputs) {
          if (input.type === "file" && window.__savetaxPendingFiles.length > 0) {
            // click이 호출되기 전에 가로채기
            const origInputClick = input.click.bind(input);
            input.click = function() {
              if (window.__savetaxPendingFiles.length > 0) {
                injectFile(input);
                return;
              }
              origInputClick();
            };
          }
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  function injectFile(input) {
    const fileData = window.__savetaxPendingFiles.shift();
    console.log("SaveTax: 파일 다이얼로그 가로채기 →", fileData.name);
    try {
      const binary = atob(fileData.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], fileData.name, { type: fileData.type });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("SaveTax: 파일 주입 완료 →", fileData.name);
    } catch (e) {
      console.error("SaveTax: 파일 주입 실패:", e);
    }
  }

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
