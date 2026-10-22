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

  // 지금 진행 중인 단계 — 실패 시 사람이 알아볼 수 있는 안내문을 만들 때 사용
  let step: Step = { kind: "launch" };

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
    step = { kind: "login" };
    await page.goto("https://www.wemembers.net/login_0001_01.act", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.locator('#USER_ID').waitFor({ state: "visible", timeout: 5000 });
    await page.locator('#USER_ID').fill(wemembersId);
    await page.locator('input[type="password"]').first().fill(wemembersPw);
    await page.locator('#btnLogin').click();
    await page.waitForTimeout(3000);
    await screenshot("login");

    // ── 2. 급여관리 페이지로 이동 ──
    step = { kind: "salaryPage" };
    await page.goto("https://tax.appplay.co.kr/salm_0000_01.act", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    await screenshot("salary_list");

    // ── 3. 거래처 검색 + 클릭 (iframe 안) ──
    const frame = page.frameLocator('iframe[name="ifrm_page"]');
    await frame.locator('#SEARCH_NM').waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(1000);
    step = { kind: "searchClient" };
    await frame.locator('#SEARCH_NM').click();
    await frame.locator('#SEARCH_NM').fill('');
    await page.keyboard.type(input.clientName);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    await screenshot("search_client");

    // 검색 결과에서 거래처명 클릭 — 완전 일치 우선, 실패 시 공백 차이 허용
    step = { kind: "pickClient" };
    // (예: 우리 "오엠(OM)우레탄" vs 위멤버스 "오엠(OM) 우레탄")
    // 위멤버스 이름 뒤에 괄호 영문명이 붙은 경우도 허용
    // (예: 우리 "주식회사 더클래시코" vs 위멤버스 "주식회사 더클래시코 (THE CLASSIKO CO.,Ltd)")
    try {
      await frame.getByText(input.clientName, { exact: true }).first().click({ timeout: 8000 });
    } catch {
      const esc = input.clientName
        .replace(/\s+/g, "")
        .split("")
        .map((ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s*");
      await frame.getByText(new RegExp(`^\\s*${esc}\\s*(\\([^()]*\\))?\\s*$`)).first().click({ timeout: 15000 });
    }
    await page.waitForTimeout(3000);
    await screenshot("client_detail");

    // ── 4. 급여대장 탭 클릭 ──
    step = { kind: "payrollTab" };
    await frame.getByText("급여대장").first().click();
    await page.waitForTimeout(1500);
    await screenshot("payroll_tab");

    // ── 5. 급여대장 등록 버튼 클릭 ──
    step = { kind: "register" };
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
    const monthNum = parseInt(input.month);
    step = { kind: "month", month: monthNum };
    const payStdInput = popupFrame.locator('#payStd');
    await payStdInput.click();
    await page.waitForTimeout(500);
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
      const typeLabel = upload.incomeType === "salary" ? "근로소득" : upload.incomeType === "daily" ? "일용직" : "사업소득";

      // 첫 번째가 아니면 다시 급여대장 등록 → 월 선택
      if (!isFirst) {
        // 급여대장 등록 버튼 다시 클릭
        step = { kind: "register" };
        try {
          await frame.getByText("급여대장 등록", { exact: false }).first().click();
        } catch {
          await frame.locator('button:has-text("등록"), a:has-text("등록")').first().click();
        }
        await page.waitForTimeout(2000);

        // 팝업 프레임 다시 잡기
        const popupFrame2 = page.frameLocator('iframe[class*="cboxIframe"]');

        // 귀속월 선택
        step = { kind: "month", month: monthNum };
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
      step = { kind: "importMenu", label: typeLabel };
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
      step = { kind: "file", label: typeLabel };
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(upload.filePath);
      console.log(`[Wemembers] ${label} 파일 선택 완료:`, upload.filePath);
      await page.waitForTimeout(3000);
      await screenshot(`file_uploaded_${label}`);

      // 저장
      step = { kind: "save", label: typeLabel };
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
    return { success: false, message: friendlyError(step, input.clientName, error) };
  }
}

// ── 오류 안내문 ──
// Playwright 원문 오류(locator.click: Timeout ... Call log ...)는 서버 로그에만 남기고,
// 화면에는 "어느 단계에서, 왜, 무엇을 확인하면 되는지"만 보여준다.
type Step =
  | { kind: "launch" }
  | { kind: "login" }
  | { kind: "salaryPage" }
  | { kind: "searchClient" }
  | { kind: "pickClient" }
  | { kind: "payrollTab" }
  | { kind: "register" }
  | { kind: "month"; month: number }
  | { kind: "importMenu"; label: string }
  | { kind: "file"; label: string }
  | { kind: "save"; label: string };

function friendlyError(step: Step, clientName: string, error: any): string {
  const raw = String(error?.message ?? error ?? "");
  const isTimeout = /timeout|timed out/i.test(raw);
  const isNetwork = /net::|ERR_|ECONN|ENOTFOUND|EAI_AGAIN/i.test(raw);

  if (isNetwork) {
    return "위멤버스 사이트에 접속하지 못했어요. 인터넷 연결이나 위멤버스 사이트 상태를 확인한 뒤 다시 시도해 주세요.";
  }

  switch (step.kind) {
    case "launch":
      return "자동화용 브라우저를 실행하지 못했어요. 잠시 후 다시 시도하고, 계속되면 관리자에게 알려 주세요.";
    case "login":
      return "위멤버스 로그인 화면이 열리지 않았어요. 위멤버스 사이트 상태를 확인한 뒤 다시 시도해 주세요.";
    case "salaryPage":
      return "위멤버스 급여관리 화면이 열리지 않았어요. 대부분 로그인 실패예요. 설정에 저장된 위멤버스 아이디·비밀번호가 맞는지 확인해 주세요.";
    case "searchClient":
      return "위멤버스 급여관리 화면에서 거래처 검색창을 쓰지 못했어요. 잠시 후 다시 시도해 주세요.";
    case "pickClient":
      return `위멤버스 급여관리 > 신고리스트 관리에서 '${clientName}' 거래처를 찾지 못했어요. 위멤버스에 이 거래처가 등록돼 있는지, 거래처 이름이 우리 쪽과 똑같은지 확인해 주세요.`;
    case "payrollTab":
      return `위멤버스에서 '${clientName}'를 열었지만 '급여대장' 탭이 보이지 않았어요. 위멤버스에서 이 거래처의 급여관리 화면을 직접 확인해 주세요.`;
    case "register":
      return `위멤버스 '${clientName}' 급여대장 화면에서 '급여대장 등록' 버튼을 찾지 못했어요. 위멤버스 화면을 직접 확인해 주세요.`;
    case "month":
      return `급여대장 등록 창에서 귀속월(${step.month}월)을 고르지 못했어요. 위멤버스에서 해당 월을 선택할 수 있는지 확인해 주세요.`;
    case "importMenu":
      return `급여대장 등록 창에서 ${step.label} '급여대장 불러오기' 메뉴를 찾지 못했어요. 위멤버스 화면을 직접 확인해 주세요.`;
    case "file":
      return `위멤버스에 ${step.label} 엑셀 파일을 올리지 못했어요.${isTimeout ? " 파일 선택 창이 열리지 않았어요." : ""} 잠시 후 다시 시도해 주세요.`;
    case "save":
      return `${step.label} 파일은 올렸지만 '저장'을 누르지 못했어요. 위멤버스에 이미 같은 달 급여대장이 있는지, 파일 내용에 문제가 없는지 확인해 주세요.`;
  }
}
