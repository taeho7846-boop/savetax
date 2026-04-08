// 로컬 테스트용: npx tsx scripts/test-wehago.ts
// 브라우저가 뜨면서 위하고 자동화 과정을 직접 볼 수 있음

import { chromium } from "playwright";

const WEHAGO_ID = "taehotax";
const WEHAGO_PW = "Taeho9311!";

// 테스트용 거래처 정보
const testClient = {
  name: "테스트회사삭제요",
  clientType: "individual",
  ceoName: "홍길동",
  bizNumber: "633-69-00689",
  residentNumber: "9209231078721",
  openDate: "2025-06-14",
};

async function main() {
  const browser = await chromium.launch({
    headless: false,  // 화면 보이게!
    slowMo: 500,      // 0.5초씩 천천히 (보기 편하게)
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. 로그인
  console.log("1. 위하고 접속...");
  await page.goto("https://www.wehago.com/landing/ko/home/");
  await page.getByRole("link", { name: "로그인" }).click();
  await page.getByRole("textbox", { name: "아이디를 입력하세요" }).fill(WEHAGO_ID);
  await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(WEHAGO_PW);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForTimeout(3000);

  // 중복 로그인 확인 팝업
  try {
    const confirmBtn = page.getByRole("button", { name: "확인" });
    if (await confirmBtn.isVisible({ timeout: 3000 })) {
      console.log("중복 로그인 팝업 발견 → 확인 클릭");
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}

  await page.waitForTimeout(3000);

  // 2. 팝업 닫기
  console.log("2. 팝업 닫기...");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  // JS로 오버레이 제거
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex);
      if ((style.position === 'fixed' || style.position === 'absolute') && zIndex > 999) {
        (el as HTMLElement).remove();
      }
    });
  });
  await page.waitForTimeout(2000);

  // 3. 새 수임처
  console.log("3. 전체 → 새 수임처...");
  await page.getByRole("button", { name: "전체" }).click({ force: true });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "새 수임처" }).click({ force: true });
  await page.waitForTimeout(3000);

  // 4. 신규 회사로 생성
  console.log("4. 신규 회사로 생성...");
  await page.locator('button.cl139_selectboxItem__btnItem:has(.icon_company.new)').click({ force: true });
  await page.waitForTimeout(3000);

  // 5. 폼 입력
  console.log("5. 폼 입력...");
  await page.locator('#companyNameKr').fill(testClient.name);
  await page.waitForTimeout(500);

  // 개인사업자 선택
  await page.locator('#companyCategory').click();
  await page.waitForTimeout(500);
  await page.locator('a').filter({ hasText: '개인사업자' }).click();
  await page.waitForTimeout(500);
  await page.locator('a').filter({ hasText: /40\.사업/ }).click();
  await page.waitForTimeout(500);

  const bizClean = testClient.bizNumber.replace(/[^0-9]/g, "");
  await page.locator('#companyRegNoField').fill(bizClean);
  await page.waitForTimeout(500);

  await page.locator('#ceoNmKr').fill(testClient.ceoName);
  await page.waitForTimeout(500);

  // 주민등록번호
  try {
    await page.getByPlaceholder('주민등록번호를 입력하세요').fill(testClient.residentNumber);
    await page.waitForTimeout(500);
  } catch (e) {
    console.log("주민번호 입력 실패:", e);
  }

  // 개업년월일 - 클릭 → 타이핑 → 엔터 → 탭탭탭 → 엔터(수임처 생성)
  try {
    await page.locator('#openDate').click();
    await page.waitForTimeout(500);
    await page.keyboard.type("20250614");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log("개업년월일 입력 실패:", e);
  }

  await page.waitForTimeout(1000);

  console.log("6. 폼 입력 완료! 확인해봐.");
  console.log("   엔터 누르면 수임처 생성 버튼 클릭함.");

  // 여기서 잠시 멈춤 - 폼 확인할 시간
  await page.waitForTimeout(10000);

  // 6. 수임처 생성
  console.log("7. 수임처 생성 클릭...");
  await page.locator('button.WSC_LUXButton:has-text("수임처 생성")').click({ force: true });
  await page.waitForTimeout(3000);

  // 확인 팝업
  for (let i = 0; i < 5; i++) {
    try {
      const okBtn = page.locator('button.WSC_LUXButton:has-text("확인"), button:has-text("확인")');
      if (await okBtn.first().isVisible({ timeout: 1500 })) {
        await okBtn.first().click({ force: true });
        await page.waitForTimeout(1000);
      } else break;
    } catch { break; }
  }

  console.log("완료! 10초 후 브라우저 닫힘.");
  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch(console.error);
