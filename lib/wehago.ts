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
  client: WehagoClientInput,
  onProgress?: (step: string) => void,
): Promise<WehagoResult> {
  const progress = onProgress ?? (() => {});
  let browser;
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
    const page = await context.newPage();

    // 1. 위하고 로그인 (직접 로그인 페이지)
    progress("위하고 접속 중...");
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

    progress("로그인 중...");
    await page.getByRole("textbox", { name: "아이디를 입력하세요" }).fill(wehagoId);
    await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(wehagoPw);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForTimeout(1500);

    // 중복 로그인 "확인" 팝업 처리
    try {
      const confirmBtn = page.getByRole("button", { name: "확인" });
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    await page.waitForTimeout(1500);

    // 로그인 확인
    const url = page.url();
    if (url.includes("login")) {
      await browser.close();
      return { success: false, message: "위하고 로그인 실패. ID/PW를 확인해주세요." };
    }

    progress("팝업 닫는 중...");
    // 팝업 다 뜰 때까지 대기 후 ESC로 닫기
    await page.waitForTimeout(5000);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    // 2차인증 팝업 닫기
    try {
      const authClose = page.locator('#divPortalHeader .LUX_basic_dialog .dialog_data_tit button');
      if (await authClose.isVisible({ timeout: 1500 })) {
        await authClose.click({ force: true });
        await page.waitForTimeout(500);
      }
    } catch {}

    // 새 수임처 생성
    progress("수임처 메뉴 진입 중...");
    await page.getByRole("button", { name: "전체" }).click({ force: true });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "새 수임처" }).click({ force: true });
    await page.waitForTimeout(1500);

    // "신규 회사로 생성" 버튼 클릭
    try {
      await page.getByText("신규 회사로 생성").click({ force: true, timeout: 5000 });
    } catch {
      // 클래스명 해시가 다를 수 있으므로 폴백
      try {
        await page.locator('button:has(.icon_company.new)').click({ force: true, timeout: 5000 });
      } catch {
        await page.locator('button.cl139_selectboxItem__btnItem:has(.icon_company.new)').click({ force: true, timeout: 5000 });
      }
    }
    await page.waitForTimeout(1500);

    // 3. 폼 입력 (id 기반 셀렉터)
    progress("정보 입력 중...");
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


    progress("수임처 생성 중...");
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
