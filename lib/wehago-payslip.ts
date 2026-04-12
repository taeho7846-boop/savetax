import path from "path";
import { mkdir } from "fs/promises";

type PayslipInput = {
  wehagoUrl: string;    // 급여자료입력 URL (이미 파라미터 포함)
  clientName: string;
  month: number;        // 3 = 3월
};

type PayslipResult = {
  success: boolean;
  message: string;
  filePath?: string;
};

export async function downloadPayslip(
  wehagoId: string,
  wehagoPw: string,
  input: PayslipInput,
): Promise<PayslipResult> {
  let browser;
  let page: any;

  const screenshotDir = path.join(process.cwd(), "public", "uploads", "wehago-debug");
  const downloadDir = path.join(process.cwd(), "tmp", "payslip_pdfs");
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(downloadDir, { recursive: true });

  let stepNum = 0;
  async function screenshot(name: string) {
    if (!page) return;
    try {
      stepNum++;
      await page.screenshot({ path: path.join(screenshotDir, `payslip_${stepNum}_${name}.png`), fullPage: false });
    } catch {}
  }

  try {
    const pw = await import("playwright" as any);
    const chromium = pw.chromium;

    browser = await chromium.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: "ko-KR",
      acceptDownloads: true,
      permissions: ["notifications"],
    });
    page = await context.newPage();

    // ── 1. 위하고 로그인 ──
    await page.goto("https://www.wehago.com/#/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.getByRole("textbox", { name: "아이디를 입력하세요" }).waitFor({ state: "visible", timeout: 5000 });
    } catch {
      try {
        await page.getByRole("link", { name: "로그인" }).click();
        await page.getByRole("textbox", { name: "아이디를 입력하세요" }).waitFor({ state: "visible", timeout: 5000 });
      } catch {}
    }

    await page.getByRole("textbox", { name: "아이디를 입력하세요" }).fill(wehagoId);
    await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(wehagoPw);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForTimeout(2000);

    // 중복 로그인 확인
    try {
      const confirmBtn = page.getByRole("button", { name: "확인" });
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        await confirmBtn.click();
        await page.waitForTimeout(1500);
      }
    } catch {}
    await page.waitForTimeout(1500);

    // 팝업 닫기
    await page.waitForTimeout(5000);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    try {
      const authClose = page.locator('#divPortalHeader .LUX_basic_dialog .dialog_data_tit button');
      if (await authClose.isVisible({ timeout: 1000 })) {
        await authClose.click({ force: true });
        await page.waitForTimeout(300);
      }
    } catch {}
    await screenshot("login_done");

    // ── 2. 급여자료입력 URL로 이동 ──
    await page.goto(input.wehagoUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // 팝업 닫기
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    await screenshot("salary_page");

    // ── 3. 지급일자 클릭 ──
    try {
      await page.locator('.sao_head_menu > div:nth-child(4) > div:nth-child(1) > button').click({ timeout: 5000 });
    } catch {
      await page.locator('button:has-text("지급일자")').click({ timeout: 5000 });
    }
    await page.waitForTimeout(1500);
    await screenshot("payment_date_dialog");

    // ── 4. 월 선택 (왼쪽 캔버스) ──
    // 각 행 높이 약 20px, 헤더 ~25px
    const rowY = 25 + (input.month - 1) * 20 + 10;
    await page.locator('#Dlg13_left_grid > div > canvas').click({ position: { x: 50, y: rowY } });
    await page.waitForTimeout(500);
    await screenshot("month_selected");

    // 오른쪽 그리드 첫 번째 행 클릭 (지급건 선택)
    await page.locator('#Dlg13_right_grid > div > canvas').click({ position: { x: 100, y: 35 } });
    await page.waitForTimeout(500);
    await screenshot("payment_selected");

    // 실행 버튼 클릭
    try {
      await page.getByRole("button", { name: "실행" }).click({ timeout: 5000 });
    } catch {
      try {
        await page.locator('button:has-text("실행")').click({ timeout: 3000 });
      } catch {
        await page.keyboard.press("Enter");
      }
    }
    await page.waitForTimeout(2000);
    await screenshot("date_confirmed");

    // ── 5. F9로 인쇄 미리보기 ──
    await page.keyboard.press("F9");
    await page.waitForTimeout(3000);
    await screenshot("print_preview");

    // ── 6. PDF 다운로드 ──
    const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
    // PDF 버튼 클릭
    try {
      await page.locator('button:has-text("PDF")').click({ timeout: 5000 });
    } catch {
      // Shift+P 폴백
      await page.keyboard.press("Shift+P");
    }

    const download = await downloadPromise;
    const safeName = input.clientName.replace(/[/\\:*?"<>|]/g, "_");
    const filePath = path.join(downloadDir, `${safeName}_${input.month}월_급여명세서.pdf`);
    await download.saveAs(filePath);
    await screenshot("download_complete");

    await browser.close();
    return { success: true, message: "급여명세서 다운로드 완료", filePath };

  } catch (error: any) {
    await screenshot("error_final");
    if (browser) await browser.close();
    console.error("[Payslip] 오류:", error);
    return { success: false, message: `급여명세서 다운로드 오류: ${error.message}` };
  }
}
