// 위하고 거래처 cno/cd_com/color 수집 스크립트 (년도별 color)
// 실행: npx tsx scripts/collect-wehago-info.ts
// dev 서버 실행 필요 (npm run dev) — 또는 labor-clients.json 파일 사용

import { chromium } from "playwright";
import * as fs from "fs";

const WEHAGO_ID = "doyultax";
const WEHAGO_PW = "doyultax24!";
const YEARS_TO_COLLECT = ["2026", "2025"];

const JSON_FILE = "scripts/labor-clients.json";
const API_URL = "http://localhost:3000/api/export-labor-clients";

async function main() {
  // 1. 근로소득 거래처 목록
  console.log("1. 근로소득 거래처 목록 조회...");
  let targetClients: { id: number; name: string; bizNumber: string }[];
  if (fs.existsSync(JSON_FILE)) {
    targetClients = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
    console.log(`  JSON 파일에서 ${targetClients.length}개 로드`);
  } else {
    try {
      const res = await fetch(API_URL);
      targetClients = await res.json();
    } catch {
      console.error("❌ labor-clients.json도 없고 API도 안 됩니다.");
      process.exit(1);
    }
  }

  const targets = targetClients.filter((c) => c.bizNumber);
  console.log(`  수집 대상: ${targets.length}개\n`);

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  // 2. 위하고 로그인
  console.log("2. 위하고 로그인...");
  await page.goto("https://www.wehago.com/landing/ko/home/");
  await page.getByRole("link", { name: "로그인" }).click();
  await page.getByRole("textbox", { name: "아이디를 입력하세요" }).fill(WEHAGO_ID);
  await page.getByRole("textbox", { name: "비밀번호를 입력하세요" }).fill(WEHAGO_PW);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForTimeout(3000);

  try {
    const confirmBtn = page.getByRole("button", { name: "확인" });
    if (await confirmBtn.isVisible({ timeout: 3000 })) {
      console.log("  중복 로그인 팝업 → 확인");
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await page.waitForTimeout(3000);

  // 3. 팝업 닫기
  console.log("3. 팝업 닫기...");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => {
    document.querySelectorAll("*").forEach((el) => {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex);
      if ((style.position === "fixed" || style.position === "absolute") && zIndex > 999) {
        (el as HTMLElement).remove();
      }
    });
  });
  await page.waitForTimeout(2000);

  // 4. 전체 버튼
  console.log("4. 전체 버튼 클릭...");
  await page.getByRole("button", { name: "전체" }).click({ force: true });
  await page.waitForTimeout(2000);

  const searchInput = page.locator('input[placeholder*="사업자등록번호"]');

  // 5. 수집
  console.log("\n5. cno/cd_com/color 수집 시작...\n");
  type Result = { id: number; name: string; bizNumber: string; cno: string; cdCom: string; colors: Record<string, string> };
  const results: Result[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const client = targets[i];
    const bizClean = client.bizNumber.replace(/[^0-9]/g, "");
    console.log(`[${i + 1}/${targets.length}] ${client.name} (${client.bizNumber})`);

    try {
      // 검색
      await searchInput.click();
      await searchInput.fill("");
      await page.waitForTimeout(300);
      await searchInput.fill(bizClean);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);

      const resultCount = await page.locator("div.item.cl_company").count();
      if (resultCount === 0) {
        console.log("  - 검색 결과 없음 → 스킵");
        skipped.push(`${client.name}: 위하고에 없음`);
        continue;
      }

      // 급여 버튼 클릭 → 새 탭
      const li = page.locator("ul.inner_list > li").first();
      const salaryBtn = li.locator("button").filter({ hasText: /^급여$/ }).first();
      if (!(await salaryBtn.isVisible({ timeout: 2000 }))) {
        console.log("  - 급여 버튼 없음 → 스킵");
        skipped.push(`${client.name}: 급여 버튼 없음`);
        continue;
      }

      const salaryPopup = context.waitForEvent("page", { timeout: 15000 });
      await salaryBtn.click({ force: true });
      const salaryPage = await salaryPopup;
      await salaryPage.waitForLoadState("domcontentloaded");
      await salaryPage.waitForTimeout(2000);

      // cno는 URL에서 추출
      const salaryUrl = salaryPage.url();
      const cno = extractParam(salaryUrl, "cNum") || extractParam(salaryUrl, "cno");
      const cdCom = extractParam(salaryUrl, "cd_com") || "";

      // 년도별 color 수집 (hidden input에서 읽기)
      const colors: Record<string, string> = {};

      // 첫 번째 년도(2026) color 수집 → 바로 cd_com 추출 → 나머지 년도 수집
      let finalCdCom = cdCom;

      for (let yi = 0; yi < YEARS_TO_COLLECT.length; yi++) {
        const yr = YEARS_TO_COLLECT[yi];
        try {
          // 년도 드롭다운 열기
          const yearBtn = salaryPage.locator("button.ls_roundselect_btn, button.LS_btn.ls_roundselect_btn").first();
          await yearBtn.click({ force: true });
          await salaryPage.waitForTimeout(800);

          // 해당 년도 선택
          const yearItem = salaryPage.locator('#scrollElement button.ls_space_btnlist').filter({ hasText: yr });
          await yearItem.click({ force: true, timeout: 3000 });
          await salaryPage.waitForTimeout(1500);

          // hidden input에서 color 읽기
          const color = await salaryPage.locator('#h_selected_SmartA_color').getAttribute("value");
          const actualYear = await salaryPage.locator('#h_selected_SmartA_Text').getAttribute("value");

          if (color && actualYear) {
            colors[actualYear] = color;
            console.log(`  ✓ ${actualYear}년: color=${color}`);
          }

          // 첫 번째 성공한 년도에서 cd_com 추출 (아직 없으면)
          if (!finalCdCom) {
            try {
              try {
                await salaryPage.getByText("근로소득관리 / 연말정산관리").first().click({ timeout: 2000 });
                await salaryPage.waitForTimeout(1000);
              } catch {}
              await salaryPage.getByText("급여자료입력").first().click({ timeout: 5000 });
              await salaryPage.waitForTimeout(3000);
              for (let j = 0; j < 3; j++) {
                await salaryPage.keyboard.press("Escape");
                await salaryPage.waitForTimeout(500);
              }
              finalCdCom = extractParam(salaryPage.url(), "cd_com");
              // 뒤로가기해서 급여 메뉴로 돌아가기
              await salaryPage.goBack();
              await salaryPage.waitForTimeout(1500);
            } catch {
              try {
                await salaryPage.getByText("사업소득관리").first().click({ timeout: 2000 });
                await salaryPage.waitForTimeout(1000);
                await salaryPage.getByText("사업소득자료입력").first().click({ timeout: 5000 });
                await salaryPage.waitForTimeout(3000);
                for (let j = 0; j < 3; j++) {
                  await salaryPage.keyboard.press("Escape");
                  await salaryPage.waitForTimeout(500);
                }
                finalCdCom = extractParam(salaryPage.url(), "cd_com");
                await salaryPage.goBack();
                await salaryPage.waitForTimeout(1500);
              } catch {}
            }
          }
        } catch {
          // 년도 선택 실패 시 ESC로 드롭다운 닫기
          await salaryPage.keyboard.press("Escape");
          await salaryPage.waitForTimeout(500);
          console.log(`  - ${yr}년 color 수집 실패`);
        }
      }

      if (cno) {
        results.push({ id: client.id, name: client.name, bizNumber: client.bizNumber, cno, cdCom: finalCdCom, colors });
        console.log(`  ✓ cno=${cno}, cd_com=${finalCdCom}, colors=${JSON.stringify(colors)}`);
      } else {
        errors.push(`${client.name}: cno 추출 실패`);
      }

      await salaryPage.close();

    } catch (err: any) {
      console.log(`  ✗ 오류: ${err.message}`);
      errors.push(`${client.name}: ${err.message}`);
      const pages = context.pages();
      for (let p = pages.length - 1; p > 0; p--) {
        await pages[p].close();
      }
    }

    // 중간 저장
    if (results.length > 0 && results.length % 5 === 0) {
      saveJson(results);
      console.log(`  📁 중간 저장: ${results.length}개`);
    }

    await page.waitForTimeout(500);
  }

  // 6. 저장
  saveJson(results);
  console.log(`\n✅ 완료! ${results.length}개 수집 → scripts/wehago-clients-result.json`);
  if (skipped.length > 0) {
    console.log(`⏭ ${skipped.length}개 스킵:`);
    skipped.forEach((s) => console.log(`  - ${s}`));
  }
  if (errors.length > 0) {
    console.log(`⚠ ${errors.length}개 실패:`);
    errors.forEach((e) => console.log(`  - ${e}`));
  }

  console.log("\n10초 후 브라우저 닫힘...");
  await page.waitForTimeout(10000);
  await browser.close();
}

function extractParam(url: string, key: string): string {
  const regex = new RegExp(`[?&]${key}=([^&]*)`);
  const match = url.match(regex);
  return match ? decodeURIComponent(match[1]) : "";
}

function saveJson(results: Result[]) {
  fs.writeFileSync("scripts/wehago-clients-result.json", JSON.stringify(results, null, 2), "utf-8");
}

type Result = { id: number; name: string; bizNumber: string; cno: string; cdCom: string; colors: Record<string, string> };

main().catch(console.error);
