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
    page.setDefaultTimeout(15000);

    // 1. 위하고 로그인
    await page.goto("https://www.wehago.com/#/login", { waitUntil: "domcontentloaded", timeout: 30000 });

    // 로그인 폼 대기 + 입력
    const idInput = page.getByRole("textbox", { name: "아이디를 입력하세요" });
    try {
      await idInput.waitFor({ state: "visible", timeout: 5000 });
    } catch {
      await page.getByRole("link", { name: "로그인" }).click();
      await idInput.waitFor({ state: "visible" });
    }

    await idInput.fill(wehagoId);
    await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(wehagoPw);
    await page.getByRole("button", { name: "로그인" }).click();

    // 중복 로그인 "확인" 팝업 (있으면 클릭, 없으면 넘어감)
    try {
      const confirmBtn = page.getByRole("button", { name: "확인" });
      await confirmBtn.waitFor({ state: "visible", timeout: 4000 });
      await confirmBtn.click();
    } catch {}

    // 2. 팝업/광고 닫기
    await page.waitForTimeout(2000);

    // ESC로 팝업 닫기
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // JS로 오버레이 강제 제거
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const zIndex = parseInt(style.zIndex);
        if ((style.position === 'fixed' || style.position === 'absolute') && zIndex > 999) {
          (el as HTMLElement).remove();
        }
      });
    });
    await page.waitForTimeout(1000);

    // 로그인 확인
    if (page.url().includes("login")) {
      await browser.close();
      return { success: false, message: "위하고 로그인 실패. ID/PW를 확인해주세요." };
    }

    // 3. 새 수임처 생성
    await page.getByRole("button", { name: "전체" }).click({ force: true });
    await page.getByRole("button", { name: "새 수임처" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "새 수임처" }).click({ force: true });

    // 신규 회사로 생성
    const newBtn = page.locator('button.cl139_selectboxItem__btnItem:has(.icon_company.new)');
    await newBtn.waitFor({ state: "visible" });
    await newBtn.click({ force: true });

    // 4. 폼 입력
    await page.locator('#companyNameKr').waitFor({ state: "visible" });
    await page.locator('#companyNameKr').fill(client.name);

    // 회사구분
    if (client.clientType !== "corporate") {
      await page.locator('#companyCategory').click();
      await page.locator('a').filter({ hasText: '개인사업자' }).click();
      await page.locator('a').filter({ hasText: /40\.사업/ }).click();
    }

    // 사업자등록번호
    const bizClean = client.bizNumber.replace(/[^0-9]/g, "");
    await page.locator('#companyRegNoField').fill(bizClean);

    // 대표자명
    await page.locator('#ceoNmKr').fill(client.ceoName);

    // 주민등록번호
    if (client.residentNumber) {
      const resClean = client.residentNumber.replace(/[^0-9]/g, "");
      try {
        await page.getByPlaceholder('주민등록번호를 입력하세요').fill(resClean);
      } catch {}
    }

    // 5. 개업년월일 + 수임처 생성
    if (client.openDate) {
      const dateClean = client.openDate.replace(/[^0-9]/g, "");
      await page.locator('#openDate').click();
      await page.keyboard.type(dateClean);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      await page.keyboard.press("Enter"); // 수임처 생성
    } else {
      await page.locator('button.WSC_LUXButton:has-text("수임처 생성")').click({ force: true });
    }

    // 6. 생성 후 확인 팝업 처리
    await page.waitForTimeout(2000);
    for (let i = 0; i < 3; i++) {
      try {
        const okBtn = page.getByRole("button", { name: "확인" });
        if (await okBtn.isVisible({ timeout: 2000 })) {
          await okBtn.click();
          await page.waitForTimeout(500);
        } else break;
      } catch { break; }
    }

    await browser.close();
    return { success: true, message: `위하고 수임처 "${client.name}" 생성 완료` };

  } catch (error: any) {
    if (browser) await browser.close();
    console.error("[Wehago] 자동화 오류:", error);
    return { success: false, message: `위하고 자동화 오류: ${error.message}` };
  }
}
