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

    // 1. 위하고 로그인
    await page.goto("https://www.wehago.com/landing/ko/home/", { waitUntil: "networkidle", timeout: 30000 });
    await page.getByRole("link", { name: "로그인" }).click();
    await page.getByRole("textbox", { name: "아이디를 입력하세요" }).fill(wehagoId);
    await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(wehagoPw);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForTimeout(3000);

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

    // 2. 새 수임처 생성
    await page.getByRole("button", { name: "전체" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "새 수임처" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /신규 회사로 생성/ }).click();
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
