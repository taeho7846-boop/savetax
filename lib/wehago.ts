// playwright는 VPS에서만 설치됨 - 동적 import 사용

type WehagoClientInput = {
  name: string;           // 수임처명
  clientType: string;     // "individual" | "corporate"
  ceoName: string;        // 대표자명
  bizNumber: string;      // 사업자등록번호
  residentNumber?: string; // 주민등록번호
  openDate?: string;       // 개업년월일 (YYYY-MM-DD)
};

type WehagoResult = {
  success: boolean;
  message: string;
};

export async function createWehagoClient(
  wehagoId: string,
  wehagoPw: string,
  client: WehagoClientInput
): Promise<WehagoResult> {
  let browser;
  try {
    const pw = await import("playwright" as any);
    const chromium = pw.chromium;

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "ko-KR",
    });
    const page = await context.newPage();

    // 1. 위하고 로그인 (직접 로그인 페이지)
    await page.goto("https://www.wehago.com/#/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);

    // 로그인 페이지가 아니면 홈에서 로그인 링크 클릭
    try {
      const idInput = await page.getByRole("textbox", { name: "아이디를 입력하세요" });
      if (!(await idInput.isVisible({ timeout: 3000 }))) {
        await page.getByRole("link", { name: "로그인" }).click();
        await page.waitForTimeout(1500);
      }
    } catch {
      try {
        await page.getByRole("link", { name: "로그인" }).click();
        await page.waitForTimeout(1500);
      } catch {}
    }

    await page.getByRole("textbox", { name: "아이디를 입력하세요" }).fill(wehagoId);
    await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(wehagoPw);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForTimeout(1500);

    // 중복 로그인 "확인" 팝업 처리
    try {
      const confirmBtn = page.getByRole("button", { name: "확인" });
      if (await confirmBtn.isVisible({ timeout: 3000 })) {
        await confirmBtn.click();
        await page.waitForTimeout(1500);
      }
    } catch {}

    await page.waitForTimeout(1500);

    // 팝업/공지 닫기 (최대 5번 시도)
    for (let i = 0; i < 5; i++) {
      try {
        const closeBtn = await page.getByRole("button", { name: "닫기" }).first();
        if (await closeBtn.isVisible({ timeout: 1500 })) {
          // "하루 동안 보지 않기" 같은 체크박스가 있으면 클릭
          const skipTexts = ["하루 동안 보지 않기", "오늘 하루 보지 않기", "다시 보지 않기"];
          for (const txt of skipTexts) {
            try {
              const el = await page.getByText(txt).first();
              if (await el.isVisible({ timeout: 500 })) await el.click();
            } catch {}
          }
          await closeBtn.click();
          await page.waitForTimeout(500);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    // 확인 버튼 (로그인 후 나오는 경우)
    try {
      const confirmBtn = await page.getByRole("button", { name: "확인" });
      if (await confirmBtn.isVisible({ timeout: 1500 })) await confirmBtn.click();
    } catch {}

    await page.waitForTimeout(1500);

    // 로그인 확인
    const url = page.url();
    if (url.includes("login")) {
      await browser.close();
      return { success: false, message: "위하고 로그인 실패. ID/PW를 확인해주세요." };
    }

    // 2. 모든 팝업/오버레이 강제 닫기 (광고 포함)
    // 방법 1: ESC 키로 팝업 닫기 시도
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(800);

    // 방법 2: 체크박스 + 버튼 클릭
    for (let i = 0; i < 15; i++) {
      try {
        // "하루 동안 보지 않기" 체크
        for (const txt of ["하루 동안 보지 않기", "오늘 하루 보지 않기", "다시 보지 않기"]) {
          try {
            const chk = page.getByText(txt).first();
            if (await chk.isVisible({ timeout: 300 })) await chk.click({ force: true });
          } catch {}
        }
        await page.waitForTimeout(300);

        // 닫기 버튼 찾기
        let found = false;
        const closeSelectors = [
          'button.btn_close', 'button[class*="close"]', '.popup_close',
          'button:has-text("닫기")', 'button:has-text("확인")',
          'button:has-text("×")', 'button:has-text("X")',
          '[class*="modal"] button', '[class*="popup"] button',
          '[class*="layer"] button', '[role="dialog"] button',
        ];
        for (const sel of closeSelectors) {
          try {
            const btns = await page.locator(sel).all();
            for (const btn of btns) {
              if (await btn.isVisible({ timeout: 200 })) {
                await btn.click({ force: true });
                found = true;
                await page.waitForTimeout(500);
                break;
              }
            }
            if (found) break;
          } catch {}
        }
        if (!found) break;
      } catch { break; }
    }

    // 방법 3: JavaScript로 모든 오버레이/iframe 강제 제거
    await page.evaluate(() => {
      // 일반 오버레이
      document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="layer"], [class*="dim"], [class*="overlay"], [class*="banner"]').forEach(el => {
        (el as HTMLElement).remove();
      });
      // iframe 제거
      document.querySelectorAll('iframe').forEach(el => {
        if (el.src && (el.src.includes('banner') || el.src.includes('popup') || el.src.includes('ad'))) {
          el.remove();
        }
      });
      // z-index 높은 fixed/absolute 요소 제거
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const zIndex = parseInt(style.zIndex);
        if ((style.position === 'fixed' || style.position === 'absolute') && zIndex > 999) {
          (el as HTMLElement).remove();
        }
      });
    });
    await page.waitForTimeout(1500);

    // 새 수임처 생성
    await page.getByRole("button", { name: "전체" }).click({ force: true });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "새 수임처" }).click({ force: true });
    await page.waitForTimeout(1500);

    // "신규 회사로 생성" 버튼 클릭
    await page.locator('button.cl139_selectboxItem__btnItem:has(.icon_company.new)').click({ force: true, timeout: 10000 });
    await page.waitForTimeout(1500);

    // 3. 폼 입력 (id 기반 셀렉터)
    // 회사명
    await page.locator('#companyNameKr').fill(client.name);
    await page.waitForTimeout(500);

    // 회사구분 (법인/개인) - 드롭다운 클릭 후 선택
    if (client.clientType !== "corporate") {
      try {
        await page.locator('#companyCategory').click();
        await page.waitForTimeout(500);
        await page.locator('a').filter({ hasText: '개인사업자' }).click();
        await page.waitForTimeout(500);
        // 세부 유형 선택
        await page.locator('a').filter({ hasText: /40\.사업/ }).click();
        await page.waitForTimeout(500);
      } catch {}
    }

    // 사업자등록번호
    const bizClean = client.bizNumber.replace(/[^0-9]/g, "");
    await page.locator('#companyRegNoField').fill(bizClean);
    await page.waitForTimeout(500);

    // 대표자명
    await page.locator('#ceoNmKr').fill(client.ceoName);
    await page.waitForTimeout(500);

    // 주민등록번호 (있으면)
    if (client.residentNumber) {
      const resClean = client.residentNumber.replace(/[^0-9]/g, "");
      try {
        await page.getByPlaceholder('주민등록번호를 입력하세요').fill(resClean);
      } catch {}
    }

    await page.waitForTimeout(500);

    // 개업년월일 (있으면)
    if (client.openDate) {
      try {
        const dateClean = client.openDate.replace(/[^0-9]/g, "");
        await page.locator('#openDate').click();
        await page.waitForTimeout(500);
        await page.keyboard.type(dateClean);
        await page.waitForTimeout(500);
        // 엔터 → 탭탭탭 → 엔터(수임처 생성)
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);
        await page.keyboard.press("Tab");
        await page.waitForTimeout(300);
        await page.keyboard.press("Tab");
        await page.waitForTimeout(300);
        await page.keyboard.press("Tab");
        await page.waitForTimeout(300);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1500);
      } catch {}
    } else {
      // 개업년월일 없으면 수임처 생성 버튼 직접 클릭
      await page.locator('button.WSC_LUXButton:has-text("수임처 생성")').click({ force: true });
      await page.waitForTimeout(1500);
    }


    // 확인/알림 팝업 처리
    for (let i = 0; i < 5; i++) {
      try {
        const okBtn = page.locator('button.WSC_LUXButton:has-text("확인"), button:has-text("확인"), button:has-text("예"), button:has-text("OK")');
        if (await okBtn.first().isVisible({ timeout: 1500 })) {
          await okBtn.first().click({ force: true });
          await page.waitForTimeout(800);
        } else {
          break;
        }
      } catch { break; }
    }
    await page.waitForTimeout(1500);


    await browser.close();
    return { success: true, message: `위하고 수임처 "${client.name}" 생성 완료` };

  } catch (error: any) {
    if (browser) await browser.close();
    console.error("[Wehago] 자동화 오류:", error);
    return { success: false, message: `위하고 자동화 오류: ${error.message}` };
  }
}
