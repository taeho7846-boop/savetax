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
    // ID 입력 필드 찾기
    const idInput = document.querySelector('input[name="userId"]')
      || document.querySelector('input[name="user_id"]')
      || document.querySelector('input[name="loginId"]')
      || document.querySelector('input[type="text"][id*="id" i]')
      || document.querySelector('input[type="text"][placeholder*="아이디"]')
      || document.querySelector('input[type="text"]');

    // PW 입력 필드 찾기
    const pwInput = document.querySelector('input[name="userPw"]')
      || document.querySelector('input[name="user_pw"]')
      || document.querySelector('input[name="loginPw"]')
      || document.querySelector('input[type="password"]');

    if (!idInput || !pwInput) {
      console.log("SaveTax: 입력 필드 아직 없음, 재시도...");
      return false;
    }

    console.log("SaveTax: 입력 필드 발견, 자격증명 입력");
    setInput(idInput, creds.id);
    setInput(pwInput, creds.pw);

    // 로그인 버튼 클릭
    setTimeout(function () {
      const loginBtn = document.querySelector('button[type="submit"]')
        || document.querySelector('input[type="submit"]')
        || document.querySelector('a.btn_login')
        || document.querySelector('button.btn_login')
        || document.querySelector('[onclick*="login" i]');

      // 텍스트로 찾기
      if (!loginBtn) {
        const allBtns = document.querySelectorAll("button, input[type='button'], a.btn");
        for (const btn of allBtns) {
          const text = (btn.textContent || btn.value || "").trim();
          if (text === "로그인" || text === "LOGIN" || text === "Sign In") {
            btn.click();
            console.log("SaveTax: 위멤버스 로그인 버튼 클릭 (텍스트 매칭)");
            return;
          }
        }
      }

      if (loginBtn) {
        loginBtn.click();
        console.log("SaveTax: 위멤버스 로그인 버튼 클릭");
      } else {
        // 폼 submit
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
