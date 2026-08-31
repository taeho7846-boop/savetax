// 사업소득지급대장 생성 — 위하고 '사업소득조회' 엑셀을 읽어 세무사랑 양식의 PDF로 변환
// 데이터 흐름: 드라이브의 "N년 M월 사업소득조회_거래처.xlsx" → parseBusinessIncomeXlsx → generateLedgerPdf
import * as XLSX from "xlsx";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

export type LedgerRow = {
  name: string;
  resident?: string; // 주민번호(마스킹) — 동명이인 구분용 합산 키

  gwisok: string;   // 귀속년월 "2026.03"
  jigub: string;    // 지급년월 "2026.03"
  amount: number;   // 지급액
  incomeTax: number;
  localTax: number;
  expense: number;  // 예술인경비 + 특고인경비
  empIns: number;   // 고용보험료 합
  scholarship: number;
  accident: number; // 산재보험료
  net: number;      // 차인지급액
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function ym(v: unknown): string {
  const s = String(v ?? "");
  const m = s.match(/(\d{4})[.-]?(\d{2})/);
  return m ? `${m[1]}.${m[2]}` : s;
}

export function parseBusinessIncomeXlsx(buf: Buffer): LedgerRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // 헤더 행 찾기 (첫 칸이 '소득자명')
  const headerIdx = rows.findIndex((r) => String(r[0]).trim() === "소득자명");
  if (headerIdx === -1) throw new Error("엑셀에서 '소득자명' 헤더를 찾지 못했습니다");

  const out: LedgerRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[0] ?? "").trim();
    if (!name) continue; // 연간소득계/소액징수계 등 합계 행은 이름 칸이 비어있음
    out.push({
      name,
      resident: String(r[2] ?? "").trim(),
      gwisok: ym(r[4]),
      jigub: ym(r[5]),
      amount: num(r[6]),
      scholarship: num(r[8]),
      incomeTax: num(r[9]),
      localTax: num(r[10]),
      expense: num(r[11]) + num(r[13]),
      empIns: num(r[12]) + num(r[14]),
      accident: num(r[15]),
      net: num(r[16]),
    });
  }

  // 같은 사람(이름+주민번호)이 같은 귀속/지급월에 여러 건 지급된 경우 한 줄로 합산 (합계 대장)
  const merged = new Map<string, LedgerRow>();
  for (const r of out) {
    const key = `${r.name}|${r.resident}|${r.gwisok}|${r.jigub}`;
    const m = merged.get(key);
    if (m) {
      m.amount += r.amount;
      m.scholarship += r.scholarship;
      m.incomeTax += r.incomeTax;
      m.localTax += r.localTax;
      m.expense += r.expense;
      m.empIns += r.empIns;
      m.accident += r.accident;
      m.net += r.net;
    } else {
      merged.set(key, { ...r });
    }
  }
  return [...merged.values()];
}

const fmt = (n: number) => (n ? n.toLocaleString("ko-KR") : "");

export async function generateLedgerPdf(
  companyName: string,
  yearMonth: string, // "2026-08"
  rows: LedgerRow[]
): Promise<Uint8Array> {
  const [year, month] = yearMonth.split("-");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await fs.readFile(path.join(process.cwd(), "pdf-editor-app", "lib", "nanumgothic.ttf"));
  const font = await doc.embedFont(new Uint8Array(fontBytes), { subset: true });

  const W = 595, H = 842, M = 28;
  const GRAY = rgb(0.85, 0.85, 0.85);
  const LINE = rgb(0.35, 0.35, 0.35);
  const BLACK = rgb(0.1, 0.1, 0.1);

  // 컬럼 폭 (합계 = 539 = W - 2*M)
  const cols = [24, 42, 55, 55, 65, 70, 65, 58, 65, 40];
  const colX: number[] = [];
  let acc = M;
  for (const w of cols) { colX.push(acc); acc += w; }
  const tableRight = acc;

  const ROW_H = 15; // 한 사람 = 2줄 = 30
  const HEADER_H = 34;

  let page = doc.addPage([W, H]);
  let y = 0;

  const text = (s: string, x: number, ty: number, size = 8, center?: { w: number }) => {
    if (!s) return;
    let tx = x;
    if (center) tx = x + (center.w - font.widthOfTextAtSize(s, size)) / 2;
    page.drawText(s, { x: tx, y: ty, size, font, color: BLACK });
  };
  const textR = (s: string, xRight: number, ty: number, size = 8) => {
    if (!s) return;
    page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size) - 3, y: ty, size, font, color: BLACK });
  };
  const hline = (yy: number, x1 = M, x2 = tableRight) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: LINE });
  const vline = (x: number, y1: number, y2: number) =>
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.6, color: LINE });

  function drawHeader() {
    // 제목
    const title = `(${year}년${month}월) 사업소득지급대장(합계)`;
    const ts = 15;
    const tw = font.widthOfTextAtSize(title, ts);
    const tx = (W - tw) / 2;
    page.drawText(title, { x: tx, y: H - 60, size: ts, font, color: BLACK });
    page.drawLine({ start: { x: tx, y: H - 66 }, end: { x: tx + tw, y: H - 66 }, thickness: 1.6, color: BLACK });
    page.drawLine({ start: { x: tx, y: H - 69 }, end: { x: tx + tw, y: H - 69 }, thickness: 0.8, color: BLACK });

    text(`회사명:${companyName}`, M, H - 90, 8.5);

    // 표 헤더 (회색, 2줄)
    const top = H - 98;
    page.drawRectangle({ x: M, y: top - HEADER_H, width: tableRight - M, height: HEADER_H, color: GRAY });
    hline(top); hline(top - HEADER_H);
    const midY = top - HEADER_H / 2;
    hline(midY, colX[3], colX[4]); // 귀속/지급년월 구분선
    hline(midY, colX[5], tableRight - cols[9]); // 소득세~차인지급액 구분선
    for (let i = 0; i <= cols.length; i++) vline(i === cols.length ? tableRight : colX[i], top, top - HEADER_H);

    const upY = top - HEADER_H / 4 - 3, dnY = top - (HEADER_H * 3) / 4 - 3, fullY = top - HEADER_H / 2 - 3;
    text("NO", colX[0], fullY, 8, { w: cols[0] });
    text("코드", colX[1], fullY, 8, { w: cols[1] });
    text("성 명", colX[2], fullY, 8, { w: cols[2] });
    text("귀속년월", colX[3], upY, 8, { w: cols[3] });
    text("지급년월", colX[3], dnY, 8, { w: cols[3] });
    text("지급액", colX[4], fullY, 8, { w: cols[4] });
    text("소득세", colX[5], upY, 8, { w: cols[5] });
    text("지방소득세", colX[5], dnY, 8, { w: cols[5] });
    text("예술/특고인경비", colX[6], upY, 6.5, { w: cols[6] });
    text("고용보험료", colX[6], dnY, 7.5, { w: cols[6] });
    text("학자금상환액", colX[7], upY, 7, { w: cols[7] });
    text("산재보험료", colX[7], dnY, 7.5, { w: cols[7] });
    text("차인지급액", colX[8], dnY, 7.5, { w: cols[8] });
    text("영수인", colX[9], fullY, 8, { w: cols[9] });

    y = top - HEADER_H;
  }

  function drawPerson(no: number, r: LedgerRow, isTotal = false) {
    const top = y, bot = y - ROW_H * 2, mid = y - ROW_H;
    if (isTotal) page.drawRectangle({ x: M, y: bot, width: colX[4] - M, height: ROW_H * 2, color: GRAY });
    hline(bot);
    hline(mid, colX[5], tableRight - cols[9]); // 소득세~차인지급액 중간줄 (지급액 칸은 병합)
    if (!isTotal) hline(mid, colX[3], colX[4]); // 귀속/지급년월 중간줄

    const vset = isTotal ? [0, 4, 5, 6, 7, 8, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const i of vset) vline(colX[i], top, bot);
    vline(tableRight, top, bot);

    const upY = top - ROW_H / 2 - 3, dnY = top - ROW_H * 1.5 - 3, fullY = top - ROW_H - 3;
    if (isTotal) {
      text("총 계", colX[0], fullY, 8.5, { w: colX[4] - M });
    } else {
      text(String(no), colX[0], fullY, 8, { w: cols[0] });
      text(String(no).padStart(6, "0"), colX[1], fullY, 8, { w: cols[1] });
      text(r.name, colX[2], fullY, 8, { w: cols[2] });
      text(r.gwisok, colX[3], upY, 8, { w: cols[3] });
      text(r.jigub, colX[3], dnY, 8, { w: cols[3] });
    }
    textR(fmt(r.amount), colX[4] + cols[4], fullY);
    textR(fmt(r.incomeTax), colX[5] + cols[5], upY);
    textR(fmt(r.localTax), colX[5] + cols[5], dnY);
    textR(fmt(r.expense), colX[6] + cols[6], upY);
    textR(fmt(r.empIns), colX[6] + cols[6], dnY);
    textR(fmt(r.scholarship), colX[7] + cols[7], upY);
    textR(fmt(r.accident), colX[7] + cols[7], dnY);
    textR(fmt(r.net), colX[8] + cols[8], dnY);
    y = bot;
  }

  drawHeader();
  rows.forEach((r, i) => {
    if (y - ROW_H * 2 < 50) { // 페이지 넘김
      page = doc.addPage([W, H]);
      drawHeader();
    }
    drawPerson(i + 1, r);
  });

  const total: LedgerRow = rows.reduce(
    (t, r) => ({
      ...t,
      amount: t.amount + r.amount, incomeTax: t.incomeTax + r.incomeTax, localTax: t.localTax + r.localTax,
      expense: t.expense + r.expense, empIns: t.empIns + r.empIns, scholarship: t.scholarship + r.scholarship,
      accident: t.accident + r.accident, net: t.net + r.net,
    }),
    { name: "", gwisok: "", jigub: "", amount: 0, incomeTax: 0, localTax: 0, expense: 0, empIns: 0, scholarship: 0, accident: 0, net: 0 }
  );
  if (y - ROW_H * 2 < 50) { page = doc.addPage([W, H]); drawHeader(); }
  drawPerson(0, total, true);

  return doc.save();
}
