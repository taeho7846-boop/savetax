// playwright는 VPS에서만 설치됨 - 동적 import 사용
import path from "path";
import { mkdir } from "fs/promises";

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
  client: WehagoClientInput,
  onProgress?: (step: string) => void,
): Promise<WehagoResult> {
  const progress = onProgress ?? (() => {});
  let browser;
  let page: any;
  const screenshotDir = path.join(process.cwd(), "public", "uploads", "wehago-debug");
  await mkdir(screenshotDir, { recursive: true });
  let stepNum = 0;

  async function screenshot(name: string) {
    if (!page) return;
    try {
      stepNum++;
      await page.screenshot({ path: path.join(screenshotDir, `${stepNum}_${name}.png`), fullPage: false });
    } catch {}
  }

  try {
    progress("브라우저 시작 중...");
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
    page = await context.newPage();

    // 1. 위하고 로그인 (직접 로그인 페이지)
    progress("위하고 접속 중...");
    await page.goto("https://www.wehago.com/#/login", { waitUntil: "domcontentloaded", timeout: 30000 });

    // 로그인 입력창이 뜰 때까지 대기
    try {
      await page.getByRole("textbox", { name: "아이디를 입력하세요" }).waitFor({ state: "visible", timeout: 5000 });
    } catch {
      try {
        await page.getByRole("link", { name: "로그인" }).click();
        await page.getByRole("textbox", { name: "아이디를 입력하세요" }).waitFor({ state: "visible", timeout: 5000 });
      } catch {}
    }

    progress("로그인 중...");
    await page.getByRole("textbox", { name: "아이디를 입력하세요" }).fill(wehagoId);
    await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(wehagoPw);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForTimeout(2000);
    await screenshot("login_clicked");

    // 중복 로그인 "확인" 팝업 처리
    try {
      const confirmBtn = page.getByRole("button", { name: "확인" });
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        await confirmBtn.click();
        await page.waitForTimeout(1500);
      }
    } catch {}

    // 로그인 완료 대기
    await page.waitForTimeout(1500);

    const url = page.url();
    if (url.includes("login")) {
      await screenshot("login_failed");
      await browser.close();
      return { success: false, message: "위하고 로그인 실패. ID/PW를 확인해주세요." };
    }
    await screenshot("login_success");

    progress("팝업 닫는 중...");

    // 팝업 닫기 + 메뉴 진입을 최대 3회 시도
    let menuOpened = false;
    for (let retry = 0; retry < 3; retry++) {
      // ESC로 팝업 닫기
      await page.waitForTimeout(retry === 0 ? 3000 : 2000);
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }

      // 2차인증 팝업 닫기
      try {
        const authClose = page.locator('#divPortalHeader .LUX_basic_dialog .dialog_data_tit button');
        if (await authClose.isVisible({ timeout: 1000 })) {
          await authClose.click({ force: true });
          await page.waitForTimeout(300);
        }
      } catch {}

      // JS로 팝업/오버레이 강제 제거
      await page.evaluate(() => {
        document.querySelectorAll('[id^="common_pop_dialog"]').forEach(el => el.remove());
        document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="layer"], [class*="dim"], [class*="overlay"], [class*="dialog"]').forEach(el => {
          if ((el as HTMLElement).style) (el as HTMLElement).remove();
        });
      });
      await page.waitForTimeout(500);

      // "전체" 버튼 클릭 시도
      try {
        await page.getByRole("button", { name: "전체" }).click({ force: true, timeout: 3000 });
        await page.getByRole("button", { name: "새 수임처" }).waitFor({ state: "visible", timeout: 5000 });
        menuOpened = true;
        break;
      } catch {
        console.log(`[Wehago] 메뉴 진입 실패 (${retry + 1}/3), 재시도...`);
        await screenshot(`retry_menu_${retry + 1}`);
      }
    }

    if (!menuOpened) {
      await screenshot("error_menu_failed");
      await browser.close();
      return { success: false, message: "위하고 메뉴 진입 실패. 팝업이 닫히지 않았습니다." };
    }
    await screenshot("after_menu_all");

    await page.getByRole("button", { name: "새 수임처" }).click({ force: true });
    await page.waitForTimeout(1000);
    await screenshot("after_new_client");

    // "신규 회사로 생성" 버튼 클릭
    try {
      await page.getByText("신규 회사로 생성").click({ force: true, timeout: 5000 });
    } catch {
      try {
        await page.locator('button:has(.icon_company.new)').click({ force: true, timeout: 5000 });
      } catch {
        await screenshot("error_new_company_btn");
        await page.locator('button.cl139_selectboxItem__btnItem:has(.icon_company.new)').click({ force: true, timeout: 5000 });
      }
    }

    // 폼이 뜰 때까지 대기
    await page.locator('#companyNameKr').waitFor({ state: "visible", timeout: 5000 });
    await screenshot("after_new_company");

    // 3. 폼 입력
    progress("정보 입력 중...");
    // 폼 필드 클릭 후 입력 (위하고가 포커스 후 활성화되는 구조)
    await page.locator('#companyNameKr').click();
    await page.locator('#companyNameKr').fill(client.name);
    await page.waitForTimeout(300);

    // 회사구분 (법인/개인) - 드롭다운 클릭 후 선택
    if (client.clientType !== "corporate") {
      try {
        await page.locator('#companyCategory').click();
        await page.locator('a').filter({ hasText: '개인사업자' }).waitFor({ state: "visible", timeout: 3000 });
        await page.locator('a').filter({ hasText: '개인사업자' }).click();
        await page.waitForTimeout(300);
        await page.locator('a').filter({ hasText: /40\.사업/ }).waitFor({ state: "visible", timeout: 3000 });
        await page.locator('a').filter({ hasText: /40\.사업/ }).click();
        await page.waitForTimeout(300);
      } catch {}
    }

    // 사업자등록번호
    const bizClean = client.bizNumber.replace(/[^0-9]/g, "");
    await page.locator('#companyRegNoField').click();
    await page.locator('#companyRegNoField').fill(bizClean);
    await page.waitForTimeout(300);

    // 대표자명
    await page.locator('#ceoNmKr').click();
    await page.locator('#ceoNmKr').fill(client.ceoName);
    await page.waitForTimeout(300);

    // 주민등록번호 (있으면)
    if (client.residentNumber) {
      const resClean = client.residentNumber.replace(/[^0-9]/g, "");
      try {
        await page.getByPlaceholder('주민등록번호를 입력하세요').click();
        await page.getByPlaceholder('주민등록번호를 입력하세요').fill(resClean);
      } catch {}
    }
    await page.waitForTimeout(300);

    await screenshot("after_form_fill");

    // 개업년월일 (있으면)
    if (client.openDate) {
      const dateClean = client.openDate.replace(/[^0-9]/g, "");
      // 방법 1: fill로 직접 입력
      try {
        await page.locator('#openDate').click();
        await page.locator('#openDate').fill(dateClean);
        await page.waitForTimeout(300);
      } catch {
        // 방법 2: 기존 값 지우고 타이핑
        try {
          await page.locator('#openDate').click({ clickCount: 3 });
          await page.keyboard.type(dateClean);
          await page.waitForTimeout(300);
        } catch {}
      }
      await screenshot("after_opendate");
      // Enter → Tab×3 → Enter (수임처 생성)
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await screenshot("before_submit");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1500);
    } else {
      await screenshot("before_submit");
      await page.locator('button.WSC_LUXButton:has-text("수임처 생성")').click({ force: true });
      await page.waitForTimeout(1500);
    }

    await screenshot("after_submit");
    progress("수임처 생성 중...");
    // 확인/알림 팝업 처리
    for (let i = 0; i < 3; i++) {
      try {
        const okBtn = page.locator('button.WSC_LUXButton:has-text("확인"), button:has-text("확인"), button:has-text("예"), button:has-text("OK")');
        if (await okBtn.first().isVisible({ timeout: 1000 })) {
          await okBtn.first().click({ force: true });
          await page.waitForTimeout(500);
        } else {
          break;
        }
      } catch { break; }
    }

    // 생성 검증 — 검색창에 사업자등록번호 입력해서 확인
    progress("생성 확인 중...");
    const searchInput = page.locator('.WSC_LUXTextField input[type=text]').first();
    let verified = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await page.waitForTimeout(3000);
        await searchInput.click();
        await searchInput.fill(bizClean);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2000);
        // 검색 결과에 사업자번호가 있는지 확인
        const result = await page.getByText(client.name).isVisible({ timeout: 3000 });
        if (result) {
          verified = true;
          break;
        }
      } catch {}
    }
    await screenshot("verify_result");

    await browser.close();
    if (verified) {
      return { success: true, message: `위하고 수임처 "${client.name}" 생성 완료 (검증됨)` };
    } else {
      return { success: true, message: `위하고 수임처 "${client.name}" 생성 요청 완료 (검증 실패 — 위하고에서 직접 확인해주세요)` };
    }

  } catch (error: any) {
    await screenshot("error_final");
    if (browser) await browser.close();
    console.error("[Wehago] 자동화 오류:", error);
    return { success: false, message: `위하고 자동화 오류: ${error.message}` };
  }
}
