import path from "path";
import { mkdir } from "fs/promises";

type WemembersUploadInput = {
  clientName: string;
  month: string;       // "03"
  year: string;        // "2026"
  incomeType: "salary" | "business";  // 근로소득 or 사업소득
  filePath: string;    // 업로드할 파일 경로
};

type WemembersResult = {
  success: boolean;
  message: string;
};

export async function uploadToWemembers(
  wemembersId: string,
  wemembersPw: string,
  input: WemembersUploadInput,
): Promise<WemembersResult> {
  let browser;
  let page: any;

  const screenshotDir = path.join(process.cwd(), "public", "uploads", "wehago-debug");
  await mkdir(screenshotDir, { recursive: true });
  let stepNum = 0;

  async function screenshot(name: string) {
    if (!page) return;
    try {
      stepNum++;
      await page.screenshot({ path: path.join(screenshotDir, `wemembers_${stepNum}_${name}.png`), fullPage: false });
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
    });
    page = await context.newPage();

    // ── 1. 위멤버스 로그인 ──
    await page.goto("https://www.wemembers.net/login_0001_01.act", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.locator('#USER_ID').waitFor({ state: "visible", timeout: 5000 });
    await page.locator('#USER_ID').fill(wemembersId);
    // 비밀번호 필드 찾기
    await page.locator('input[type="password"]').first().fill(wemembersPw);
    await page.locator('#btnLogin').click();
    await page.waitForTimeout(3000);
    await screenshot("login");

    // ── 2. 급여관리 페이지로 이동 ──
    await page.goto("https://tax.appplay.co.kr/salm_0000_01.act", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await screenshot("salary_list");

    // ── 3. 거래처 검색 + 클릭 (iframe 안) ──
    const frame = page.frameLocator('iframe[name="ifrm_page"]');
    await frame.locator('#SEARCH_NM').waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(1000);
    await frame.locator('#SEARCH_NM').click();
    await frame.locator('#SEARCH_NM').fill('');
    await page.keyboard.type(input.clientName);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    await screenshot("search_client");

    // 검색 결과에서 거래처명 클릭
    await frame.getByText(input.clientName, { exact: true }).first().click();
    await page.waitForTimeout(3000);
    await screenshot("client_detail");

    // ── 4. 급여대장 탭 클릭 ──
    await frame.getByText("급여대장").first().click();
    await page.waitForTimeout(1500);
    await screenshot("payroll_tab");

    // ── 5. 급여대장 등록 버튼 클릭 ──
    try {
      await frame.getByText("급여대장 등록", { exact: false }).first().click();
    } catch {
      await frame.locator('button:has-text("등록"), a:has-text("등록")').first().click();
    }
    await page.waitForTimeout(2000);
    await screenshot("register_dialog");

    // ── 6~9: 급여대장 등록 팝업 (cboxIframe 안) ──
    const popupFrame = page.frameLocator('iframe[class*="cboxIframe"]');

    // 6. 급여 귀속월 변경
    const payStdInput = popupFrame.locator('#payStd');
    await payStdInput.click();
    await page.waitForTimeout(500);
    // 월 선택 팝업에서 해당 월 클릭
    const monthNum = parseInt(input.month);
    await popupFrame.getByText(String(monthNum), { exact: true }).first().click();
    await page.waitForTimeout(300);
    await popupFrame.getByText("확인", { exact: true }).first().click();
    await page.waitForTimeout(500);
    await screenshot("month_selected");

    // 7. 급여대장 불러오기 드롭다운 → 소득 유형 선택
    await popupFrame.getByText("급여대장 불러오기").click();
    await page.waitForTimeout(500);
    await screenshot("import_dropdown");

    // 파일 다이얼로그를 가로채서 자동으로 파일 선택
    const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });

    if (input.incomeType === "salary") {
      await popupFrame.getByText("일반근로자 임금명세서").first().click();
    } else {
      await popupFrame.getByText("사업소득자").first().click();
    }

    // 파일 다이얼로그 가로채기 → 파일 자동 선택
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(input.filePath);
    console.log("[Wemembers] 파일 선택 완료:", input.filePath);
    await page.waitForTimeout(3000);
    await screenshot("file_uploaded");

    // 9. 저장 버튼 클릭
    await popupFrame.getByText("저장", { exact: true }).first().click();
    await page.waitForTimeout(2000);
    await screenshot("saved");

    // 확인 팝업
    try {
      await popupFrame.getByText("확인").first().click();
      await page.waitForTimeout(500);
    } catch {}
    try {
      await page.getByText("확인").first().click();
      await page.waitForTimeout(500);
    } catch {}

    await browser.close();
    return { success: true, message: `위멤버스 ${input.clientName} ${input.incomeType === "salary" ? "급여명세서" : "사업소득"} 업로드 완료` };

  } catch (error: any) {
    await screenshot("error_final");
    if (browser) await browser.close();
    console.error("[Wemembers] 오류:", error);
    return { success: false, message: `위멤버스 업로드 오류: ${error.message}` };
  }
}
