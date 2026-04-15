// 위멤버스 자동 로그인
// URL hash에 #savetax={base64 JSON} 형태로 자격증명이 전달됨
(function () {
  if (!window.location.href.includes("login")) return;

  const hash = window.location.hash;
  if (!hash || !hash.includes("savetax=")) return;

  const encoded = hash.split("savetax=")[1];
  if (!encoded) return;

  let creds;
  try {
    creds = JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch (e) {
    console.error("SaveTax: 위멤버스 자격증명 파싱 실패", e);
    return;
  }

  // URL에서 hash 제거 (자격증명 노출 방지)
  history.replaceState(null, "", window.location.pathname + window.location.search);

  console.log("SaveTax: 위멤버스 자동 로그인 시작");

  function setInput(el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function tryLogin() {
    // ID 입력 필드
    const idInput = document.getElementById("USER_ID");

    // PW 입력 필드
    const pwInput = document.getElementById("PWD");

    if (!idInput || !pwInput) {
      console.log("SaveTax: 입력 필드 아직 없음, 재시도...");
      return false;
    }

    console.log("SaveTax: 입력 필드 발견, 자격증명 입력");
    setInput(idInput, creds.id);
    setInput(pwInput, creds.pw);

    // 로그인 버튼 클릭
    setTimeout(function () {
      const loginBtn = document.getElementById("btnLogin");
      if (loginBtn) {
        loginBtn.click();
        console.log("SaveTax: 위멤버스 #btnLogin 클릭");
      } else {
        // fallback
        const form = idInput.closest("form");
        if (form) {
          form.submit();
          console.log("SaveTax: 위멤버스 폼 submit");
        }
      }
    }, 500);

    return true;
  }

  // 페이지 로드 후 시도 (최대 10초)
  let attempts = 0;
  const interval = setInterval(function () {
    attempts++;
    if (tryLogin() || attempts > 20) {
      clearInterval(interval);
    }
  }, 500);
})();
