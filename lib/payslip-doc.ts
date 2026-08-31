// 급여명세서 생성 — 위하고 '급여명세서' 엑셀(직원별 세로 블록)을 읽어 직원 1명당 1페이지 PDF로 변환
import * as XLSX from "xlsx";
import { PDFDocument, rgb, PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

export type PayslipEmployee = {
  code: string;
  name: string;
  birth: string;
  dept: string;
  rank: string;
  hobong: string;
  payDate: string;
  overtimeH: string; nightH: string; holidayH: string; hourlyWage: string;
  payments: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  paymentTotal: number;
  deductionTotal: number;
  net: number;
};

const s = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
};

export function parsePayslipXlsx(buf: Buffer): { companyName: string; yearMonthLabel: string; employees: PayslipEmployee[] } {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  let companyName = "";
  let yearMonthLabel = "";
  const employees: PayslipEmployee[] = [];

  // 직원 블록 시작점: '회사명 :' 행
  const starts: number[] = [];
  rows.forEach((r, i) => { if (s(r[0]).startsWith("회사명")) starts.push(i); });
  if (starts.length === 0) throw new Error("엑셀에서 '회사명' 행을 찾지 못했습니다");

  for (let b = 0; b < starts.length; b++) {
    const st = starts[b];
    const en = b + 1 < starts.length ? starts[b + 1] - 3 : rows.length;

    if (!companyName) companyName = s(rows[st][1]);
    // 제목 행(블록 위쪽 2줄 이내)에서 "2026년 03월분 급여명세서" 추출
    for (let i = Math.max(0, st - 3); i < st; i++) {
      const t = rows[i]?.map(s).find((v) => v.includes("급여명세서"));
      if (t && !yearMonthLabel) yearMonthLabel = t;
    }

    const emp: PayslipEmployee = {
      code: "", name: "", birth: "", dept: "", rank: "", hobong: "",
      payDate: s(rows[st][5]),
      overtimeH: "", nightH: "", holidayH: "", hourlyWage: "",
      payments: [], deductions: [], paymentTotal: 0, deductionTotal: 0, net: 0,
    };

    let inTable = false;
    for (let i = st; i < en && i < rows.length; i++) {
      const r = rows[i];
      const c0 = s(r[0]);
      if (c0.startsWith("사원코드")) { emp.code = s(r[1]); emp.name = s(r[3]); emp.birth = s(r[5]); }
      else if (c0.startsWith("부")) { emp.dept = s(r[1]); emp.rank = s(r[3]); emp.hobong = s(r[5]); }
      else if (c0 === "연장근로시간") {
        const v = rows[i + 1] ?? [];
        emp.overtimeH = s(v[0]); emp.nightH = s(v[1]); emp.holidayH = s(v[2]); emp.hourlyWage = s(v[3]);
      } else if (c0.replace(/\s/g, "") === "지급내역") { inTable = true; }
      else if (c0.replace(/\s/g, "") === "지급액계") {
        emp.paymentTotal = num(r[1]); emp.net = num(r[5]); inTable = false;
      } else if (inTable) {
        const dLabel = s(r[3]);
        if (dLabel.replace(/\s/g, "") === "공제액계") { emp.deductionTotal = num(r[5]); }
        else {
          if (c0 && r[1] !== "" && r[1] != null) emp.payments.push({ label: c0, amount: num(r[1]) });
          if (dLabel && dLabel.replace(/\s/g, "") !== "공제액계" && r[5] !== "" && r[5] != null)
            emp.deductions.push({ label: dLabel, amount: num(r[5]) });
        }
      }
    }
    if (emp.name) employees.push(emp);
  }

  return { companyName, yearMonthLabel, employees };
}

const fmt = (n: number) => (n ? n.toLocaleString("ko-KR") : "");

export async function generatePayslipPdf(
  companyName: string,
  yearMonth: string, // "2026-08"
  employees: PayslipEmployee[]
): Promise<Uint8Array> {
  const [year, month] = yearMonth.split("-");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await fs.readFile(path.join(process.cwd(), "pdf-editor-app", "lib", "nanumgothic.ttf"));
  const font = await doc.embedFont(new Uint8Array(fontBytes), { subset: true });

  const W = 595, H = 842, M = 50;
  const GRAY = rgb(0.85, 0.85, 0.85);
  const LINE = rgb(0.35, 0.35, 0.35);
  const BLACK = rgb(0.1, 0.1, 0.1);

  for (const emp of employees) {
    const page = doc.addPage([W, H]);
    const text = (str: string, x: number, y: number, size = 9, opts?: { centerW?: number; right?: boolean }) => {
      if (!str) return;
      let tx = x;
      if (opts?.centerW) tx = x + (opts.centerW - font.widthOfTextAtSize(str, size)) / 2;
      if (opts?.right) tx = x - font.widthOfTextAtSize(str, size);
      page.drawText(str, { x: tx, y, size, font, color: BLACK });
    };
    const rect = (x: number, y: number, w: number, h: number, fill?: boolean) => {
      if (fill) page.drawRectangle({ x, y, width: w, height: h, color: GRAY });
      page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.6, borderColor: LINE });
    };
    const hl = (x1: number, x2: number, y: number) =>
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: LINE });
    const vl = (x: number, y1: number, y2: number) =>
      page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.6, color: LINE });

    // 제목
    const title = `${year}년${month}월분  급여명세서`;
    text(title, 0, H - 90, 16, { centerW: W });

    // 회사명 / 지급일
    text(`회사명 :   ${companyName}`, M + 20, H - 130, 9.5);
    text(`지급일 :   ${emp.payDate}`, W - M - 150, H - 130, 9.5);

    // 사원 정보 박스 (2행)
    const infoTop = H - 142, infoH = 34;
    rect(M - 10, infoTop - infoH, W - 2 * M + 20, infoH);
    hl(M - 10, W - M + 10, infoTop - infoH / 2);
    const r1y = infoTop - infoH / 4 - 3.5, r2y = infoTop - (infoH * 3) / 4 - 3.5;
    text(`사원코드 :    ${emp.code}`, M - 4, r1y, 9);
    text(`사 원 명 :    ${emp.name}`, M + 155, r1y, 9);
    text(`생년월일 :    ${emp.birth}`, M + 320, r1y, 9);
    text(`부    서 :    ${emp.dept}`, M - 4, r2y, 9);
    text(`직    급 :    ${emp.rank}`, M + 155, r2y, 9);
    text(`호    봉 :    ${emp.hobong}`, M + 320, r2y, 9);

    // 근로시간 표
    const wtTop = infoTop - infoH - 14, wtH = 36, wtW = (W - 2 * M + 20) / 5;
    for (let i = 0; i < 5; i++) rect(M - 10 + wtW * i, wtTop - wtH, wtW, wtH);
    hl(M - 10, W - M + 10, wtTop - wtH / 2);
    const wtLabels = ["연장근로시간", "야간근로시간", "휴일근로시간", "통상시급(원)", ""];
    const wtVals = [emp.overtimeH, emp.nightH, emp.holidayH, emp.hourlyWage, ""];
    wtLabels.forEach((l, i) => {
      text(l, M - 10 + wtW * i, wtTop - wtH / 4 - 3.5, 9, { centerW: wtW });
      text(wtVals[i], M - 10 + wtW * i, wtTop - (wtH * 3) / 4 - 3.5, 9, { centerW: wtW });
    });

    // 본표 (지급내역/지급액/공제내역/공제액)
    text("(단위, 원)", W - M + 10, wtTop - wtH - 12, 7.5, { right: true });
    const tTop = wtTop - wtH - 18;
    const colW = (W - 2 * M + 20) / 4;
    const headH = 18, rowH = 15;
    const bodyRows = Math.max(emp.payments.length, emp.deductions.length, 28); // 샘플처럼 길게
    const bodyH = bodyRows * rowH;
    const tBot = tTop - headH - bodyH - rowH * 2; // + 공제액계/지급액계 2줄

    // 헤더
    for (let i = 0; i < 4; i++) rect(M - 10 + colW * i, tTop - headH, colW, headH, true);
    ["지 급 내 역", "지 급 액", "공 제 내 역", "공 제 액"].forEach((l, i) =>
      text(l, M - 10 + colW * i, tTop - headH + 5, 9.5, { centerW: colW })
    );

    // 본문 테두리 — 왼쪽(지급) 열은 공제액계 줄까지 한 칸 더 내려감 (샘플과 동일)
    rect(M - 10, tTop - headH - bodyH - rowH, colW * 2, bodyH + rowH);
    vl(M - 10 + colW, tTop - headH, tTop - headH - bodyH - rowH);
    rect(M - 10 + colW * 2, tTop - headH - bodyH, colW * 2, bodyH);
    vl(M - 10 + colW * 3, tTop - headH, tTop - headH - bodyH);

    emp.payments.forEach((p, i) => {
      const y = tTop - headH - rowH * (i + 1) + 4;
      text(p.label, M - 10, y, 9, { centerW: colW });
      text(fmt(p.amount), M - 10 + colW * 2 - 8, y, 9, { right: true });
    });
    emp.deductions.forEach((d, i) => {
      const y = tTop - headH - rowH * (i + 1) + 4;
      text(d.label, M - 10 + colW * 2, y, 9, { centerW: colW });
      text(fmt(d.amount), M - 10 + colW * 4 - 8, y, 9, { right: true });
    });

    // 공제액계 (오른쪽 절반) / 지급액계·차인지급액
    const sumY1 = tTop - headH - bodyH;
    rect(M - 10 + colW * 2, sumY1 - rowH, colW, rowH, true);
    rect(M - 10 + colW * 3, sumY1 - rowH, colW, rowH);
    text("공 제 액 계", M - 10 + colW * 2, sumY1 - rowH + 4, 9.5, { centerW: colW });
    text(fmt(emp.deductionTotal), M - 10 + colW * 4 - 8, sumY1 - rowH + 4, 9.5, { right: true });

    const sumY2 = sumY1 - rowH;
    rect(M - 10, sumY2 - rowH, colW, rowH, true);
    rect(M - 10 + colW, sumY2 - rowH, colW, rowH);
    rect(M - 10 + colW * 2, sumY2 - rowH, colW, rowH, true);
    rect(M - 10 + colW * 3, sumY2 - rowH, colW, rowH);
    text("지 급 액 계", M - 10, sumY2 - rowH + 4, 9.5, { centerW: colW });
    text(fmt(emp.paymentTotal), M - 10 + colW * 2 - 8, sumY2 - rowH + 4, 9.5, { right: true });
    text("차 인 지 급 액", M - 10 + colW * 2, sumY2 - rowH + 4, 9.5, { centerW: colW });
    text(fmt(emp.net), M - 10 + colW * 4 - 8, sumY2 - rowH + 4, 9.5, { right: true });

    // 계산방법 박스
    text("(단위, 원)", W - M + 10, tBot - 12, 7.5, { right: true });
    const cTop = tBot - 18, cRowH = 16;
    rect(M - 10, cTop - cRowH, W - 2 * M + 20, cRowH, true);
    text("계산방법", M - 10, cTop - cRowH + 4.5, 9, { centerW: W - 2 * M + 20 });
    const cw = [colW, colW * 2.3, (W - 2 * M + 20) - colW - colW * 2.3];
    let cx = M - 10;
    ["구분", "산출식 또는 산출방법", "지급액"].forEach((l, i) => {
      rect(cx, cTop - cRowH * 2, cw[i], cRowH, true);
      text(l, cx, cTop - cRowH * 2 + 4.5, 9, { centerW: cw[i] });
      rect(cx, cTop - cRowH * 3, cw[i], cRowH);
      cx += cw[i];
    });

    text("귀하의 노고에 감사드립니다.", 0, cTop - cRowH * 3 - 24, 9.5, { centerW: W });
  }

  return doc.save();
}
