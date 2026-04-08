// playwright는 VPS에서만 설치됨 - 동적 import 사용

type WehagoClientInput = {
  name: string;          // 수임처명
  clientType: string;    // "individual" | "corporate"
  ceoName: string;       // 대표자명
  bizNumber: string;     // 사업자등록번호 (000-00-00000)
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
      viewport: { width: 1280, height: 800 },
      locale: "ko-KR",
    });
    const page = await context.newPage();

    // 1. 위하고 로그인 페이지
    await page.goto("https://login.wehago.com/login", { waitUntil: "networkidle", timeout: 30000 });

    // 로그인 폼 입력
    await page.fill('input[name="userId"], input[placeholder*="아이디"]', wehagoId, { timeout: 10000 });
    await page.fill('input[name="userPwd"], input[placeholder*="비밀번호"], input[type="password"]', wehagoPw, { timeout: 10000 });

    // 로그인 버튼 클릭
    await page.click('button[type="submit"], .btn_login, button:has-text("로그인")');
    await page.waitForTimeout(3000);

    // 로그인 성공 확인
    const currentUrl = page.url();
    if (currentUrl.includes("login")) {
      return { success: false, message: "위하고 로그인 실패. ID/PW를 확인해주세요." };
    }

    // 2. Smart A 10 → 거래처관리 → 수임처 등록 화면으로 이동
    // 위하고 메인에서 SmartA 접속
    await page.goto("https://smarta.wehago.com", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // 수임처 신규생성 모달 열기 (메뉴 경로는 위하고 UI에 따라 조정 필요)
    // 방법 1: 직접 URL로 이동 시도
    // 방법 2: 메뉴 클릭으로 이동

    // 수임처 등록 버튼 찾기
    const newClientBtn = await page.$('button:has-text("수임처 생성"), button:has-text("신규생성"), a:has-text("수임처 생성")');
    if (newClientBtn) {
      await newClientBtn.click();
      await page.waitForTimeout(2000);
    }

    // 3. 수임처 신규생성 폼 입력
    // 수임처명
    await page.fill('input[placeholder*="회사명"], input[name*="companyName"]', client.name, { timeout: 10000 });

    // 회사구분 (법인/개인)
    if (client.clientType === "corporate") {
      const corpSelect = await page.$('select:near(:text("회사구분"))');
      if (corpSelect) await corpSelect.selectOption({ label: "0.법인사업자" });
    } else {
      const indSelect = await page.$('select:near(:text("회사구분"))');
      if (indSelect) await indSelect.selectOption({ label: "1.개인사업자" });
    }

    // 대표자명
    await page.fill('input[placeholder*="대표자명"], input[name*="ceoName"]', client.ceoName);

    // 사업자등록번호
    const bizClean = client.bizNumber.replace(/[^0-9]/g, "");
    const bizInputs = await page.$$('input:near(:text("사업자등록번호"))');
    if (bizInputs.length >= 1) {
      // 하나의 input에 전체 입력
      await bizInputs[0].fill(bizClean);
    }

    // 4. 수임처 생성 버튼 클릭
    await page.click('button:has-text("수임처 생성"), button:has-text("저장")');
    await page.waitForTimeout(3000);

    // 성공 확인
    const successDialog = await page.$('text=생성되었습니다, text=등록되었습니다, text=완료');
    if (successDialog) {
      await browser.close();
      return { success: true, message: `위하고 수임처 "${client.name}" 생성 완료` };
    }

    // 에러 확인
    const errorMsg = await page.$('.error, .alert-danger, text=오류, text=실패');
    if (errorMsg) {
      const text = await errorMsg.textContent();
      await browser.close();
      return { success: false, message: `위하고 오류: ${text}` };
    }

    await browser.close();
    return { success: true, message: `위하고 수임처 "${client.name}" 생성 요청 완료 (확인 필요)` };

  } catch (error: any) {
    if (browser) await browser.close();
    return { success: false, message: `위하고 자동화 오류: ${error.message}` };
  }
}
