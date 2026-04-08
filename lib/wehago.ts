// playwright는 VPS에서만 설치됨 - 동적 import 사용

type WehagoClientInput = {
  name: string;           // 수임처명
  clientType: string;     // "individual" | "corporate"
  ceoName: string;        // 대표자명
  bizNumber: string;      // 사업자등록번호
  residentNumber?: string; // 주민등록번호
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
    await page.waitForTimeout(3000);

    // 로그인 페이지가 아니면 홈에서 로그인 링크 클릭
    try {
      const idInput = await page.getByRole("textbox", { name: "아이디를 입력하세요" });
      if (!(await idInput.isVisible({ timeout: 3000 }))) {
        await page.getByRole("link", { name: "로그인" }).click();
        await page.waitForTimeout(2000);
      }
    } catch {
      try {
        await page.getByRole("link", { name: "로그인" }).click();
        await page.waitForTimeout(2000);
      } catch {}
    }

    await page.getByRole("textbox", { name: "아이디를 입력하세요" }).fill(wehagoId);
    await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(wehagoPw);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForTimeout(5000);

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

    await page.waitForTimeout(2000);

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
    await page.waitForTimeout(1000);

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

    // 방법 3: JavaScript로 모든 오버레이 제거
    await page.evaluate(() => {
      document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="layer"], [class*="dim"], [class*="overlay"]').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    });
    await page.waitForTimeout(1000);

    // 방법 4: 팝업 X 버튼 좌표 직접 클릭 (우측 상단)
    await page.mouse.click(527, 55);
    await page.waitForTimeout(1000);
    await page.mouse.click(527, 55);
    await page.waitForTimeout(2000);

    // 디버깅: 팝업 닫기 후 스크린샷
    await page.screenshot({ path: "/tmp/wehago-debug.png" });
    console.log("[Wehago] 스크린샷1-팝업닫기후: /tmp/wehago-debug.png");

    // 새 수임처 생성
    await page.getByRole("button", { name: "전체" }).click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/tmp/wehago-debug2.png" });
    console.log("[Wehago] 스크린샷2-전체클릭후: /tmp/wehago-debug2.png");

    await page.getByRole("button", { name: "새 수임처" }).click({ force: true });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "/tmp/wehago-debug3.png" });
    console.log("[Wehago] 스크린샷3-새수임처클릭후: /tmp/wehago-debug3.png");

    // "신규 회사로 생성" 버튼 찾기
    const newCompanyBtn = page.getByRole("button", { name: /신규 회사로 생성/ })
      .or(page.locator("button:has-text('신규 회사로 생성')"))
      .or(page.locator(".btn:has-text('신규')"))
      .or(page.locator("[class*='create']:has-text('신규')"));
    await newCompanyBtn.first().click({ force: true, timeout: 10000 });
    await page.waitForTimeout(2000);

    // 3. 폼 입력
    // 회사명
    await page.getByRole("textbox", { name: "회사명을 입력하세요" }).fill(client.name);

    // 회사구분 (법인/개인)
    if (client.clientType === "corporate") {
      await page.getByText("법인사업자").click();
    } else {
      // 기본이 법인사업자일 수 있으므로 개인사업자 클릭
      try {
        await page.locator("a").filter({ hasText: "개인사업자" }).click();
        await page.waitForTimeout(500);
        await page.locator("a").filter({ hasText: /40\.사업/ }).click();
      } catch {
        // 이미 개인사업자인 경우
      }
    }

    // 사업자등록번호
    const bizClean = client.bizNumber.replace(/[^0-9]/g, "");
    await page.getByRole("textbox", { name: "사업자등록번호를 입력하세요" }).fill(bizClean);

    // 대표자명
    await page.getByRole("textbox", { name: "대표자명을 입력하세요" }).fill(client.ceoName);

    // 주민등록번호 (있으면)
    if (client.residentNumber) {
      const resClean = client.residentNumber.replace(/[^0-9]/g, "");
      try {
        await page.getByRole("textbox", { name: "주민등록번호를 입력하세요" }).fill(resClean);
      } catch {}
    }

    await page.waitForTimeout(1000);

    // 4. 수임처 생성 버튼
    await page.getByRole("button", { name: "수임처 생성" }).click();
    await page.waitForTimeout(3000);

    await browser.close();
    return { success: true, message: `위하고 수임처 "${client.name}" 생성 완료` };

  } catch (error: any) {
    if (browser) await browser.close();
    console.error("[Wehago] 자동화 오류:", error);
    return { success: false, message: `위하고 자동화 오류: ${error.message}` };
  }
}
