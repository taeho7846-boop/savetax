import path from "path";
import { mkdir } from "fs/promises";

type UploadItem = {
  incomeType: "salary" | "business" | "daily";
  filePath: string;
};

type WemembersUploadInput = {
  clientName: string;
  month: string;       // "03"
  year: string;        // "2026"
  incomeType: "salary" | "business";
  filePath: string;
};

type WemembersMultiInput = {
  clientName: string;
  month: string;
  year: string;
  uploads: UploadItem[];  // 근로 → 사업 순서
};

type WemembersResult = {
  success: boolean;
  message: string;
};

// 단건 업로드 (하위 호환)
export async function uploadToWemembers(
  wemembersId: string,
  wemembersPw: string,
  input: WemembersUploadInput,
): Promise<WemembersResult> {
  return uploadMultiToWemembers(wemembersId, wemembersPw, {
    clientName: input.clientName,
    month: input.month,
    year: input.year,
    uploads: [{ incomeType: input.incomeType, filePath: input.filePath }],
  });
}

// 다건 업로드 (근로 → 사업 한번에)
export async function uploadMultiToWemembers(
  wemembersId: string,
  wemembersPw: string,
  input: WemembersMultiInput,
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
      // 로컬(윈도우)에서는 브라우저 창을 보여주고, VPS(리눅스, 화면 없음)에서는 headless로 실행
      headless: process.platform !== "win32",
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

    // ── 6~8: 급여대장 등록 팝업 (cboxIframe 안) ──
    const popupFrame = page.frameLocator('iframe[class*="cboxIframe"]');

    // 6. 급여 귀속월 변경
    const payStdInput = popupFrame.locator('#payStd');
    await payStdInput.click();
    await page.waitForTimeout(500);
    const monthNum = parseInt(input.month);
    await popupFrame.getByText(String(monthNum), { exact: true }).first().click();
    await page.waitForTimeout(300);
    await popupFrame.getByText("확인", { exact: true }).first().click();
    await page.waitForTimeout(500);
    await screenshot("month_selected");

    // ── 7~9: 각 소득별로 불러오기 + 파일 업로드 + 저장 + 다시 등록 ──
    for (let i = 0; i < input.uploads.length; i++) {
      const upload = input.uploads[i];
      const label = upload.incomeType === "salary" ? "근로소득" : "사업소득";
      const isFirst = i === 0;

      // 첫 번째가 아니면 다시 급여대장 등록 → 월 선택
      if (!isFirst) {
        // 급여대장 등록 버튼 다시 클릭
        try {
          await frame.getByText("급여대장 등록", { exact: false }).first().click();
        } catch {
          await frame.locator('button:has-text("등록"), a:has-text("등록")').first().click();
        }
        await page.waitForTimeout(2000);

        // 팝업 프레임 다시 잡기
        const popupFrame2 = page.frameLocator('iframe[class*="cboxIframe"]');

        // 귀속월 선택
        await popupFrame2.locator('#payStd').click();
        await page.waitForTimeout(500);
        await popupFrame2.getByText(String(monthNum), { exact: true }).first().click();
        await page.waitForTimeout(300);
        await popupFrame2.getByText("확인", { exact: true }).first().click();
        await page.waitForTimeout(500);
      }

      // 현재 팝업 프레임
      const currentPopup = page.frameLocator('iframe[class*="cboxIframe"]');

      // 급여대장 불러오기 드롭다운 클릭
      await currentPopup.getByText("급여대장 불러오기").click();
      await page.waitForTimeout(500);
      await screenshot(`import_dropdown_${label}`);

      // 파일 다이얼로그 가로채기
      const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });

      if (upload.incomeType === "salary") {
        await currentPopup.getByText("일반근로자 임금명세서").first().click();
      } else if (upload.incomeType === "daily") {
        await currentPopup.getByText("일용근로자 임금명세서").first().click();
      } else {
        await currentPopup.getByText("사업소득자").first().click();
      }

      // 파일 선택
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(upload.filePath);
      console.log(`[Wemembers] ${label} 파일 선택 완료:`, upload.filePath);
      await page.waitForTimeout(3000);
      await screenshot(`file_uploaded_${label}`);

      // 저장
      await currentPopup.getByText("저장", { exact: true }).first().click();
      await page.waitForTimeout(2000);
      await screenshot(`saved_${label}`);

      // 등록 완료 얼럿 → Enter로 닫기
      await page.waitForTimeout(1000);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2500);

      console.log(`[Wemembers] ${label} 등록 완료`);
    }

    await browser.close();
    const typeLabels = input.uploads.map(u => u.incomeType === "salary" ? "근로소득" : u.incomeType === "daily" ? "일용직" : "사업소득").join(" + ");
    return { success: true, message: `위멤버스 ${input.clientName} ${typeLabels} 업로드 완료` };

  } catch (error: any) {
    await screenshot("error_final");
    if (browser) await browser.close();
    console.error("[Wemembers] 오류:", error);
    return { success: false, message: `위멤버스 업로드 오류: ${error.message}` };
  }
}
