// 위하고 거래처 cno/cd_com 수집 스크립트 (근로소득 거래처만, 검색 방식)
//
// 사전 준비: 로컬에서 npm run dev 실행 중이어야 함 (DB 조회용 API)
// 실행: npx tsx scripts/collect-wehago-info.ts

import { chromium } from "playwright";
import * as fs from "fs";

const WEHAGO_ID = "taehotax";
const WEHAGO_PW = "Taeho9311!";

// JSON 파일 또는 API에서 근로소득 거래처 목록 가져오기
const JSON_FILE = "scripts/labor-clients.json";
const API_URL = "http://localhost:3000/api/export-labor-clients";

async function main() {
  // 1. 근로소득 거래처 목록 가져오기 (JSON 파일 우선)
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

  // 이미 수집된 거래처 스킵 (CSV에서 사업자번호 확인)
  const alreadyCollected = new Set<string>();
  if (fs.existsSync("scripts/wehago-clients.csv")) {
    const csv = fs.readFileSync("scripts/wehago-clients.csv", "utf-8");
    csv.split("\n").slice(1).filter(Boolean).forEach((line) => {
      const biz = line.split(",")[2]?.replace(/"/g, "").replace(/[^0-9]/g, "");
      if (biz) alreadyCollected.add(biz);
    });
    console.log(`  이미 수집된 거래처: ${alreadyCollected.size}개 → 스킵`);
  }

  const targets = targetClients.filter((c) => {
    if (!c.bizNumber) return false;
    const bizClean = c.bizNumber.replace(/[^0-9]/g, "");
    return !alreadyCollected.has(bizClean);
  });
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

  // 중복 로그인 확인
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

  // 4. "전체" 버튼 클릭 → 검색창 표시
  console.log("4. 전체 버튼 클릭...");
  await page.getByRole("button", { name: "전체" }).click({ force: true });
  await page.waitForTimeout(2000);

  // 검색창 찾기
  const searchInput = page.locator('input[placeholder*="사업자등록번호"]');

  // 5. 각 거래처 검색 → 급여 → 급여자료입력 → cno/cd_com 추출
  console.log("\n5. cno/cd_com 수집 시작...\n");
  const results: { id: number; name: string; bizNumber: string; cno: string; cdCom: string }[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const client = targets[i];
    const bizClean = client.bizNumber.replace(/[^0-9]/g, "");
    console.log(`[${i + 1}/${targets.length}] ${client.name} (${client.bizNumber})`);

    try {
      // 검색창 클릭 → 기존 텍스트 지우기 → 사업자번호 입력 → 엔터
      await searchInput.click();
      await searchInput.fill("");
      await page.waitForTimeout(300);
      await searchInput.fill(bizClean);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);

      // 검색 결과 확인
      const resultCount = await page.locator("div.item.cl_company").count();
      if (resultCount === 0) {
        console.log("  - 검색 결과 없음 → 스킵");
        skipped.push(`${client.name}: 위하고에 없음`);
        continue;
      }

      // 급여 버튼 클릭 (텍스트 "급여")
      const li = page.locator("ul.inner_list > li").first();
      const salaryBtn = li.locator("button").filter({ hasText: /^급여$/ }).first();

      if (!(await salaryBtn.isVisible({ timeout: 2000 }))) {
        console.log("  - 급여 버튼 없음 → 스킵");
        skipped.push(`${client.name}: 급여 버튼 없음`);
        continue;
      }

      // 급여 버튼 클릭 → 새 탭
      const salaryPopup = context.waitForEvent("page", { timeout: 15000 });
      await salaryBtn.click({ force: true });
      const salaryPage = await salaryPopup;
      await salaryPage.waitForLoadState("domcontentloaded");
      await salaryPage.waitForTimeout(2000);

      // 급여자료입력 클릭 (같은 탭에서 이동)
      await salaryPage.getByText("급여자료입력").first().click({ timeout: 5000 });
      await salaryPage.waitForTimeout(3000);

      // ESC 3번 (팝업 닫기)
      for (let j = 0; j < 3; j++) {
        await salaryPage.keyboard.press("Escape");
        await salaryPage.waitForTimeout(500);
      }

      // URL에서 cno, cd_com, color 추출
      const url = salaryPage.url();
      const cno = extractParam(url, "cno");
      const cdCom = extractParam(url, "cd_com");
      const color = extractParam(url, "color");

      if (cno && cdCom) {
        results.push({ id: client.id, name: client.name, bizNumber: client.bizNumber, cno, cdCom, color });
        console.log(`  ✓ cno=${cno}, cd_com=${cdCom}, color=${color}`);
      } else {
        console.log(`  ✗ URL 파싱 실패: ${url}`);
        errors.push(`${client.name}: URL 파싱 실패`);
      }

      // 탭 닫기
      await salaryPage.close();

    } catch (err: any) {
      console.log(`  ✗ 오류: ${err.message}`);
      errors.push(`${client.name}: ${err.message}`);
      // 열린 탭 닫기
      const pages = context.pages();
      for (let p = pages.length - 1; p > 0; p--) {
        await pages[p].close();
      }
    }

    // 중간 저장 (5개마다)
    if (results.length > 0 && results.length % 5 === 0) {
      saveCsv(results);
      console.log(`  📁 중간 저장: ${results.length}개`);
    }

    await page.waitForTimeout(500);
  }

  // 6. 최종 저장
  saveCsv(results);
  console.log(`\n✅ 완료! ${results.length}개 수집 → scripts/wehago-clients.csv`);
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

function saveCsv(results: { id: number; name: string; bizNumber: string; cno: string; cdCom: string; color: string }[]) {
  const header = "id,거래처명,사업자번호,cno,cd_com,color\n";
  const rows = results.map((r) => `${r.id},"${r.name}","${r.bizNumber}","${r.cno}","${r.cdCom}","${r.color}"`).join("\n");
  fs.writeFileSync("scripts/wehago-clients.csv", "\uFEFF" + header + rows, "utf-8");
}

main().catch(console.error);
