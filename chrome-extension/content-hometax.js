// URL hash에서 자격증명 읽기
(async function () {
  const hash = window.location.hash;
  if (!hash.includes("savetax=")) return;

  const encoded = hash.split("savetax=")[1];
  if (!encoded) return;

  // hash 제거 (보안)
  history.replaceState(null, "", window.location.pathname + window.location.search);

  let creds;
  try {
    creds = JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    try {
      creds = JSON.parse(atob(encoded));
    } catch { return; }
  }

  const hometaxId = creds.id;
  const hometaxPw = creds.pw;
  const certName = creds.certName || "";
  const certPw = creds.certPw || "";
  const rn = (creds.rn || "").replace(/[-\s]/g, "");
  const jumin1 = rn.slice(0, 6);
  const jumin2 = rn.slice(6, 7);

  function waitForId(id, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.getElementById(id);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error("Timeout: #" + id));
        setTimeout(check, 300);
      };
      check();
    });
  }

  function waitForXPath(xpath, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error("Timeout: " + xpath));
        setTimeout(check, 300);
      };
      check();
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  try {
    // 1. 로그인 버튼 클릭
    const loginBtn = await waitForId("mf_wfHeader_group1503");
    loginBtn.click();

    // 2. 아이디 로그인 탭 클릭
    await sleep(1000);
    const idLoginTab = await waitForId("mf_txppWframe_anchor15");
    idLoginTab.click();

    // 3. 아이디 입력
    await sleep(500);
    const idInput = await waitForId("mf_txppWframe_iptUserId");
    idInput.focus();
    idInput.value = hometaxId;
    idInput.dispatchEvent(new Event("input", { bubbles: true }));
    idInput.dispatchEvent(new Event("change", { bubbles: true }));

    // 4. 비밀번호 입력
    const pwInput = await waitForId("mf_txppWframe_iptUserPw");
    pwInput.focus();
    pwInput.value = hometaxPw;
    pwInput.dispatchEvent(new Event("input", { bubbles: true }));
    pwInput.dispatchEvent(new Event("change", { bubbles: true }));

    // 5. 로그인 클릭
    await sleep(300);
    const submitBtn = await waitForId("mf_txppWframe_anchor25");
    submitBtn.click();

    // 6. 권한 팝업 처리
    await sleep(1000);
    try {
      const allowBtn = await waitForXPath("//*[normalize-space(text())='허용']", 3000);
      if (allowBtn) allowBtn.click();
    } catch (e) {}

    // 7. 주민등록번호 입력 (개인 거래처 로그인 시)
    if (jumin1) {
      try {
        await sleep(2000);
        const j1 = await waitForId("mf_txppWframe_UTXPPABC12_wframe_iptUserJuminNo1", 10000);
        j1.click();
        j1.value = jumin1;
        j1.dispatchEvent(new Event("input", { bubbles: true }));
        j1.dispatchEvent(new Event("change", { bubbles: true }));

        const j2 = document.getElementById("mf_txppWframe_UTXPPABC12_wframe_iptUserJuminNo2");
        if (j2) {
          j2.click();
          j2.value = jumin2;
          j2.dispatchEvent(new Event("input", { bubbles: true }));
          j2.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const confirmBtn = document.getElementById("mf_txppWframe_UTXPPABC12_wframe_trigger46");
        if (confirmBtn) confirmBtn.click();
      } catch (e) {}
    }

    // 8. 공인인증서 처리 (세무대리인 로그인 시)
    if (certPw) {
      try {
        await sleep(3000);

        // iframe 안의 인증서 UI 탐색
        const iframes = document.querySelectorAll("iframe");
        let certFrame = null;
        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument;
            if (doc && doc.getElementById("input_cert_pw")) {
              certFrame = iframe;
              break;
            }
          } catch (e) {}
        }

        if (certFrame) {
          const doc = certFrame.contentDocument;

          // 인증서 선택 (이름으로 찾기)
          if (certName) {
            const certSpan = doc.evaluate(
              `//span[contains(@title, '${certName}')]`,
              doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            ).singleNodeValue;
            if (certSpan) certSpan.click();
          } else {
            // 첫 번째 인증서 선택
            const firstCert = doc.evaluate(
              "//span[@title and string-length(@title) > 0]",
              doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
            ).singleNodeValue;
            if (firstCert) firstCert.click();
          }

          await sleep(500);

          // 인증서 비밀번호 입력
          const pwField = doc.getElementById("input_cert_pw");
          if (pwField) {
            pwField.focus();
            pwField.value = certPw;
            pwField.dispatchEvent(new Event("input", { bubbles: true }));
            pwField.dispatchEvent(new Event("change", { bubbles: true }));
          }

          await sleep(300);

          // 확인 버튼 클릭
          const confirmBtn = doc.getElementById("btn_confirm_iframe");
          if (confirmBtn) confirmBtn.click();

          await sleep(2000);
        }

        // 인증 후 확인 팝업 처리
        try {
          const popup1 = await waitForXPath("//input[contains(@id,'mf_txppWframe') and contains(@id,'btn_confirm') and @value='확인']", 5000);
          if (popup1) popup1.click();
        } catch (e) {}

        await sleep(1000);

        try {
          const popup2 = await waitForXPath("//input[contains(@id,'mf_wfHeader') and contains(@id,'btn_confirm') and @value='확인']", 5000);
          if (popup2) popup2.click();
        } catch (e) {}

        await sleep(1000);

        // 현행 홈택스 이용하기
        try {
          const oldBtn = await waitForXPath("//span[contains(@id,'mf_wfHeader') and contains(.,'현행 홈택스')]", 5000);
          if (oldBtn) oldBtn.click();
        } catch (e) {}

      } catch (e) {
        console.error("SaveTax 인증서 처리 실패:", e);
      }
    }

  } catch (e) {
    console.error("SaveTax 자동 로그인 실패:", e);
  }
})();
