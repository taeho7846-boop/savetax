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
    creds = JSON.parse(atob(encoded));
  } catch { return; }

  const hometaxId = creds.id;
  const hometaxPw = creds.pw;
  const rn = (creds.rn || "").replace(/[-\s]/g, "");
  const jumin1 = rn.slice(0, 6);
  const jumin2 = rn.slice(6, 7);

  function waitForId(id, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const check = () => {
        const el = document.getElementById(id);
        if (el) return resolve(el);
        setTimeout(check, 300);
      };
      check();
      setTimeout(() => reject(new Error("Timeout: #" + id)), timeout);
    });
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
