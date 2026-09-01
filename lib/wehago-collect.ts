// 위하고 거래처 연동정보(cno/cd_com/색상) 서버 수집 — scripts/collect-wehago-info.ts의 검증된 로직을 headless로 이식
// 원천세 탭 [연동 수집] 버튼이 사용. 한 번에 하나의 잡만 실행.
import { prisma } from "@/lib/prisma";

export type CollectTarget = { id: number; name: string; bizNumber: string };
export type CollectResult = { name: string; status: "ok" | "skip" | "fail"; msg?: string };
export type CollectJob = {
  id: string;
  userId: number;
  startedAt: number;
  total: number;
  current: number;
  currentName: string;
  results: CollectResult[];
  done: boolean;
  fatal?: string;
};

const g = globalThis as any;

export function getJob(): CollectJob | null {
  return g.__wehagoCollectJob ?? null;
}

export function setJob(job: CollectJob | null) {
  g.__wehagoCollectJob = job;
}

function extractParam(url: string, key: string): string {
  const m = url.match(new RegExp(`[?&]${key}=([^&]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

export async function runCollect(job: CollectJob, wehagoId: string, wehagoPw: string, targets: CollectTarget[]) {
  const thisYear = new Date().getFullYear();
  const YEARS = [String(thisYear), String(thisYear - 1)];
  let browser: any;
  try {
    const pw = await import("playwright" as any);
    browser = await pw.chromium.launch({
      headless: process.platform !== "win32", // VPS(리눅스)는 headless, 로컬 개발은 창 표시
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ko-KR" });
    const page = await context.newPage();

    // 1. 로그인 (lib/wehago.ts와 동일 패턴)
    job.currentName = "위하고 로그인 중...";
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
    await page.waitForTimeout(3000);
    try {
      const confirmBtn = page.getByRole("button", { name: "확인" });
      if (await confirmBtn.isVisible({ timeout: 3000 })) {
        await confirmBtn.click(); // 중복 로그인 팝업
        await page.waitForTimeout(2000);
      }
    } catch {}
    await page.waitForTimeout(3000);

    // 2. 팝업 닫기
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
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
    await page.waitForTimeout(1500);
    try {
      await page.getByRole("button", { name: "전체" }).click({ force: true, timeout: 5000 });
    } catch {}
    await page.waitForTimeout(1500);

    const searchInput = page.locator('input[placeholder*="사업자등록번호"]');

    // 3. 거래처별 수집
    for (const t of targets) {
      job.current += 1;
      job.currentName = t.name;
      const bizClean = t.bizNumber.replace(/[^0-9]/g, "");
      let salaryPage: any = null;
      try {
        await searchInput.click();
        await searchInput.fill("");
        await page.waitForTimeout(300);
        await searchInput.fill(bizClean);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2000);

        const resultCount = await page.locator("div.item.cl_company").count();
        if (resultCount === 0) {
          job.results.push({ name: t.name, status: "skip", msg: "위하고에 없음 (수임 등록 필요)" });
          continue;
        }

        const li = page.locator("ul.inner_list > li").first();
        const salaryBtn = li.locator("button").filter({ hasText: /^급여$/ }).first();
        if (!(await salaryBtn.isVisible({ timeout: 2000 }))) {
          job.results.push({ name: t.name, status: "skip", msg: "급여 버튼 없음" });
          continue;
        }

        const popupPromise = context.waitForEvent("page", { timeout: 15000 });
        await salaryBtn.click({ force: true });
        salaryPage = await popupPromise;
        await salaryPage.waitForLoadState("domcontentloaded");
        await salaryPage.waitForTimeout(2000);

        const salaryUrl = salaryPage.url();
        const cno = extractParam(salaryUrl, "cNum") || extractParam(salaryUrl, "cno");
        let cdCom = extractParam(salaryUrl, "cd_com");

        // 연도별 색상 수집
        const colors: Record<string, string> = {};
        for (const yr of YEARS) {
          try {
            const yearBtn = salaryPage.locator("button.ls_roundselect_btn, button.LS_btn.ls_roundselect_btn").first();
            await yearBtn.click({ force: true });
            await salaryPage.waitForTimeout(800);
            const yearItem = salaryPage.locator("#scrollElement button.ls_space_btnlist").filter({ hasText: yr });
            await yearItem.click({ force: true, timeout: 3000 });
            await salaryPage.waitForTimeout(1500);
            const color = await salaryPage.locator("#h_selected_SmartA_color").getAttribute("value");
            const actualYear = await salaryPage.locator("#h_selected_SmartA_Text").getAttribute("value");
            if (color && actualYear) colors[actualYear] = color;

            if (!cdCom) {
              // 메뉴 진입해서 cd_com 추출 (근로 → 실패 시 사업소득)
              try {
                try {
                  await salaryPage.getByText("근로소득관리 / 연말정산관리").first().click({ timeout: 2000 });
                  await salaryPage.waitForTimeout(1000);
                } catch {}
                await salaryPage.getByText("급여자료입력").first().click({ timeout: 5000 });
                await salaryPage.waitForTimeout(3000);
                for (let j = 0; j < 3; j++) { await salaryPage.keyboard.press("Escape"); await salaryPage.waitForTimeout(400); }
                cdCom = extractParam(salaryPage.url(), "cd_com");
                await salaryPage.goBack();
                await salaryPage.waitForTimeout(1500);
              } catch {
                try {
                  await salaryPage.getByText("사업소득관리").first().click({ timeout: 2000 });
                  await salaryPage.waitForTimeout(1000);
                  await salaryPage.getByText("사업소득자료입력").first().click({ timeout: 5000 });
                  await salaryPage.waitForTimeout(3000);
                  for (let j = 0; j < 3; j++) { await salaryPage.keyboard.press("Escape"); await salaryPage.waitForTimeout(400); }
                  cdCom = extractParam(salaryPage.url(), "cd_com");
                  await salaryPage.goBack();
                  await salaryPage.waitForTimeout(1500);
                } catch {}
              }
            }
          } catch {
            await salaryPage.keyboard.press("Escape");
            await salaryPage.waitForTimeout(400);
          }
        }

        if (!cno) {
          job.results.push({ name: t.name, status: "fail", msg: "연동번호(cno) 추출 실패" });
          continue;
        }

        // 기존 색상과 병합 후 저장 (수집 즉시 DB 반영 — 중간에 끊겨도 성공분 유지)
        const existing = await prisma.client.findUnique({ where: { id: t.id }, select: { wehagoColors: true } });
        let mergedColors: Record<string, string> = {};
        try { mergedColors = JSON.parse(existing?.wehagoColors || "{}"); } catch {}
        Object.assign(mergedColors, colors);
        await prisma.client.update({
          where: { id: t.id },
          data: { wehagoCno: cno, wehagoCdCom: cdCom || null, wehagoColors: JSON.stringify(mergedColors) },
        });
        job.results.push({ name: t.name, status: "ok", msg: Object.keys(colors).join("·") + "년 색상 포함" });
      } catch (e: any) {
        job.results.push({ name: t.name, status: "fail", msg: String(e?.message || e).slice(0, 120) });
        // 열린 팝업 정리
        for (const p of context.pages().slice(1)) { try { await p.close(); } catch {} }
      } finally {
        try { if (salaryPage && !salaryPage.isClosed()) await salaryPage.close(); } catch {}
      }
      await page.waitForTimeout(500);
    }
  } catch (e: any) {
    job.fatal = "수집 실패: " + String(e?.message || e).slice(0, 200);
  } finally {
    job.done = true;
    job.currentName = "";
    try { if (browser) await browser.close(); } catch {}
  }
}
