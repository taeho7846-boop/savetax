// 홈택스 페이지에서 자동 로그인 수행
(async function () {
  const data = await chrome.storage.local.get(["hometaxId", "hometaxPw", "residentNumber"]);
  if (!data.hometaxId || !data.hometaxPw) return;

  // 사용 후 즉시 삭제
  await chrome.storage.local.remove(["hometaxId", "hometaxPw", "residentNumber"]);

  const hometaxId = data.hometaxId;
  const hometaxPw = data.hometaxPw;
  const rn = (data.residentNumber || "").replace(/[-\s]/g, "");
  const jumin1 = rn.slice(0, 6);
  const jumin2 = rn.slice(6, 7);

  function waitForElement(selector, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { observer.disconnect(); resolve(el); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); reject(new Error("Timeout: " + selector)); }, timeout);
    });
  }

  function waitForId(id, timeout = 20000) {
    return waitForElement("#" + id, timeout);
  }

  try {
    // 1. 로그인 버튼 클릭
    const loginBtn = await waitForId("mf_wfHeader_group1503");
    loginBtn.click();

    // 2. 아이디 로그인 탭 클릭
    await new Promise(r => setTimeout(r, 1000));
    const idLoginTab = await waitForId("mf_txppWframe_anchor15");
    idLoginTab.click();

    // 3. 아이디 입력
    await new Promise(r => setTimeout(r, 500));
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
    await new Promise(r => setTimeout(r, 300));
    const submitBtn = await waitForId("mf_txppWframe_anchor25");
    submitBtn.click();

    // 6. 권한 팝업 처리
    await new Promise(r => setTimeout(r, 1000));
    try {
      const allowBtn = document.evaluate(
        "//*[normalize-space(text())='허용']",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
      if (allowBtn) allowBtn.click();
    } catch (e) {}

    // 7. 주민등록번호 입력 (필요한 경우)
    if (jumin1) {
      try {
        await new Promise(r => setTimeout(r, 3000));
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

  } catch (e) {
    console.error("SaveTax 자동 로그인 실패:", e);
  }
})();
