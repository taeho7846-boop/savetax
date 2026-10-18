// 미수금 현황 보고서 PDF — 채권관리에서 '미수 보고서 PDF' 버튼으로 출력 (회의자료용)
// A4 가로, 소속(세이브택스 / 개인세무거래처)별 섹션 + 소계 + 총계, 수기 메모용 '비고' 칸 포함
import { PDFDocument, rgb, PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

export type UnpaidReportRow = {
  name: string;
  affiliation: string | null;
  assignedUserName: string | null;
  monthlyFee: number;
  unpaidMonths: string[]; // "YYYY-MM" 오름차순
  unpaidAmount: number;
  terminated: boolean;
};

export type UnpaidReportInput = {
  asOf: string; // "YYYY-MM-DD"
  printedAt: string; // "YYYY-MM-DD HH:mm"
  author: string;
  title?: string;
  rows: UnpaidReportRow[];
};

const W = 842, H = 595, M = 28; // A4 가로
const INK = rgb(0.1, 0.12, 0.16);
const SUB = rgb(0.42, 0.46, 0.52);
const MUTE = rgb(0.6, 0.64, 0.68);
const LINE = rgb(0.82, 0.84, 0.87);
const LINE_DARK = rgb(0.55, 0.58, 0.62);
const HEAD_BG = rgb(0.95, 0.96, 0.97);
const ZEBRA = rgb(0.985, 0.985, 0.99);
const RED = rgb(0.86, 0.15, 0.15);
const BLUE = rgb(0.19, 0.51, 0.96);
const PURPLE = rgb(0.55, 0.36, 0.96);
const SUBTOTAL_BG = rgb(0.97, 0.97, 0.98);
const TOTAL_BG = rgb(0.93, 0.95, 0.98);

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** "2026-03","2026-04","2026-06" → "26.03~04, 06" 처럼 연속 구간은 묶어서 짧게 */
export function formatMonthRanges(months: string[]): string {
  if (months.length === 0) return "";
  const sorted = [...months].sort();
  const toIdx = (ym: string) => { const [y, m] = ym.split("-").map(Number); return y * 12 + (m - 1); };
  const label = (ym: string, withYear: boolean) => {
    const [y, m] = ym.split("-");
    return withYear ? `${y.slice(2)}.${m}` : m;
  };
  const ranges: { from: string; to: string }[] = [];
  let from = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (toIdx(sorted[i]) === toIdx(prev) + 1) { prev = sorted[i]; continue; }
    ranges.push({ from, to: prev });
    from = sorted[i]; prev = sorted[i];
  }
  ranges.push({ from, to: prev });
  let lastYear = "";
  return ranges.map(r => {
    const fy = r.from.slice(0, 4), ty = r.to.slice(0, 4);
    const a = label(r.from, fy !== lastYear);
    lastYear = fy;
    if (r.from === r.to) return a;
    const b = label(r.to, ty !== fy);
    lastYear = ty;
    return `${a}~${b}`;
  }).join(", ");
}

export async function buildUnpaidReportPdf(input: UnpaidReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await fs.readFile(path.join(process.cwd(), "pdf-editor-app", "lib", "nanumgothic.ttf"));
  const font = await doc.embedFont(new Uint8Array(fontBytes), { subset: true });
  doc.setTitle(input.title ?? "미수금 현황 보고");
  doc.setAuthor(input.author);

  // 컬럼: No | 거래처명 | 소속 | 담당 | 월 기장료 | 개월 | 미수 월 | 미수금액 | 비고(수기)  — 합 786 = W - 2M
  const cols = [
    { key: "no", label: "No", w: 24, align: "center" as const },
    { key: "name", label: "거래처명", w: 170, align: "left" as const },
    { key: "aff", label: "소속", w: 62, align: "center" as const },
    { key: "user", label: "담당", w: 50, align: "center" as const },
    { key: "fee", label: "월 기장료", w: 70, align: "right" as const },
    { key: "cnt", label: "개월", w: 40, align: "center" as const },
    { key: "months", label: "미수 월", w: 120, align: "left" as const },
    { key: "amt", label: "미수금액", w: 90, align: "right" as const },
    { key: "memo", label: "비고 (회의 메모)", w: 160, align: "left" as const },
  ];
  const colX: number[] = [];
  let acc = M;
  for (const c of cols) { colX.push(acc); acc += c.w; }
  const tableRight = acc; // = W - M (786 + 28)

  const ROW_H = 19;
  const HEAD_H = 20;
  const FOOT_Y = 22;

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const tw = (s: string, size: number) => font.widthOfTextAtSize(s, size);
  const fit = (s: string, maxW: number, size: number) => {
    if (tw(s, size) <= maxW) return s;
    let t = s;
    while (t.length > 1 && tw(t + "…", size) > maxW) t = t.slice(0, -1);
    return t + "…";
  };
  const text = (s: string, x: number, ty: number, size: number, opts?: { color?: ReturnType<typeof rgb>; align?: "left" | "center" | "right"; w?: number; font?: PDFFont }) => {
    if (!s) return;
    const f = opts?.font ?? font;
    let tx = x;
    if (opts?.align === "center" && opts.w != null) tx = x + (opts.w - f.widthOfTextAtSize(s, size)) / 2;
    else if (opts?.align === "right" && opts.w != null) tx = x + opts.w - f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: tx, y: ty, size, font: f, color: opts?.color ?? INK });
  };
  const cell = (ci: number, s: string, ty: number, size = 8.5, color = INK) => {
    const c = cols[ci];
    const pad = 5;
    const str = fit(s, c.w - pad * 2, size);
    text(str, colX[ci] + pad, ty, size, { color, align: c.align, w: c.w - pad * 2 });
  };
  const hline = (yy: number, color = LINE, thickness = 0.5, x1 = M, x2 = tableRight) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });
  const rect = (x: number, yy: number, w: number, h: number, color: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, color });

  // ---- 페이지 헤더 (첫 페이지는 큰 타이틀+요약, 이후 페이지는 작은 타이틀) ----
  const drawPageTop = (first: boolean) => {
    page = doc.addPage([W, H]);
    pages.push(page);
    if (first) {
      text(input.title ?? "미수금 현황 보고", M, H - 52, 20);
      text("RECEIVABLES REPORT", M, H - 34, 7.5, { color: MUTE });
      const meta = [`기준일 ${input.asOf}`, `출력 ${input.printedAt}`, `작성 ${input.author}`];
      let mx = tableRight;
      for (const m of [...meta].reverse()) {
        const w = tw(m, 8.5);
        text(m, mx - w, H - 44, 8.5, { color: SUB });
        mx -= w + 14;
      }
      hline(H - 62, INK, 1.2);
      y = H - 62 - 12;
    } else {
      text(input.title ?? "미수금 현황 보고", M, H - 30, 11);
      text(`기준일 ${input.asOf}`, tableRight - tw(`기준일 ${input.asOf}`, 8), H - 29, 8, { color: SUB });
      hline(H - 38, INK, 0.8);
      y = H - 38 - 10;
    }
  };

  const drawSummary = () => {
    const rows = input.rows;
    const total = rows.reduce((s, r) => s + r.unpaidAmount, 0);
    const save = rows.filter(r => r.affiliation === "세이브택스");
    const personal = rows.filter(r => r.affiliation !== "세이브택스");
    const boxes = [
      { label: "미수 거래처", value: `${rows.length}곳`, sub: `전체 미수 개월 ${rows.reduce((s, r) => s + r.unpaidMonths.length, 0)}건`, accent: INK },
      { label: "총 미수금", value: won(total), sub: rows.length ? `평균 ${won(Math.round(total / rows.length))} / 곳` : "", accent: RED },
      { label: "세이브택스", value: won(save.reduce((s, r) => s + r.unpaidAmount, 0)), sub: `${save.length}곳`, accent: BLUE },
      { label: "개인세무거래처", value: won(personal.reduce((s, r) => s + r.unpaidAmount, 0)), sub: `${personal.length}곳`, accent: PURPLE },
    ];
    const gap = 10;
    const bw = (tableRight - M - gap * (boxes.length - 1)) / boxes.length;
    const bh = 50;
    const by = y - bh;
    boxes.forEach((b, i) => {
      const bx = M + i * (bw + gap);
      rect(bx, by, bw, bh, HEAD_BG);
      rect(bx, by, 3, bh, b.accent);
      text(b.label, bx + 12, by + bh - 15, 7.5, { color: SUB });
      text(b.value, bx + 12, by + 15, 14, { color: b.accent === INK ? INK : b.accent });
      if (b.sub) text(b.sub, bx + bw - 10 - tw(b.sub, 7.5), by + 15, 7.5, { color: MUTE });
    });
    y = by - 14;
  };

  const drawTableHead = () => {
    rect(M, y - HEAD_H, tableRight - M, HEAD_H, HEAD_BG);
    hline(y, LINE_DARK, 0.8);
    cols.forEach((c, i) => {
      text(c.label, colX[i] + 5, y - 14, 8, { color: SUB, align: c.align === "left" ? "left" : c.align, w: c.w - 10 });
    });
    hline(y - HEAD_H, LINE_DARK, 0.8);
    y -= HEAD_H;
  };

  const ensureSpace = (need: number) => {
    if (y - need < FOOT_Y + 14) {
      drawPageTop(false);
      drawTableHead();
    }
  };

  const drawSectionHead = (label: string, count: number, amount: number, accent: ReturnType<typeof rgb>) => {
    ensureSpace(ROW_H + 6);
    const h = 18;
    rect(M, y - h, 3, h, accent);
    text(label, M + 10, y - 13, 9.5, { color: INK });
    const right = `${count}곳 · ${won(amount)}`;
    text(right, tableRight - 6 - tw(right, 8.5), y - 13, 8.5, { color: accent });
    hline(y - h, LINE, 0.5);
    y -= h;
  };

  const drawRow = (no: number, r: UnpaidReportRow, zebra: boolean) => {
    ensureSpace(ROW_H);
    if (zebra) rect(M, y - ROW_H, tableRight - M, ROW_H, ZEBRA);
    const ty = y - 13;
    cell(0, String(no), ty, 8, SUB);
    cell(1, r.terminated ? `${r.name} (해지)` : r.name, ty, 9, INK);
    cell(2, r.affiliation ?? "-", ty, 8, r.affiliation === "세이브택스" ? BLUE : SUB);
    cell(3, r.assignedUserName ?? "-", ty, 8, SUB);
    cell(4, won(r.monthlyFee), ty, 8.5);
    cell(5, `${r.unpaidMonths.length}`, ty, 8.5);
    cell(6, formatMonthRanges(r.unpaidMonths), ty, 8, SUB);
    cell(7, won(r.unpaidAmount), ty, 9.5, RED);
    // 비고 칸은 비워둔다 (수기 메모용)
    hline(y - ROW_H, LINE, 0.4);
    // 세로 구분선: 비고 칸 앞
    page.drawLine({ start: { x: colX[8], y }, end: { x: colX[8], y: y - ROW_H }, thickness: 0.4, color: LINE });
    y -= ROW_H;
  };

  const drawTotalRow = (label: string, rows: UnpaidReportRow[], strong: boolean) => {
    ensureSpace(ROW_H + 2);
    const h = ROW_H + 2;
    rect(M, y - h, tableRight - M, h, strong ? TOTAL_BG : SUBTOTAL_BG);
    const ty = y - 14;
    text(label, colX[1] + 5, ty, strong ? 9.5 : 8.5, { color: INK });
    const fee = rows.reduce((s, r) => s + r.monthlyFee, 0);
    const cnt = rows.reduce((s, r) => s + r.unpaidMonths.length, 0);
    const amt = rows.reduce((s, r) => s + r.unpaidAmount, 0);
    cell(4, won(fee), ty, 8.5, SUB);
    cell(5, `${cnt}`, ty, 8.5, SUB);
    cell(7, won(amt), ty, strong ? 10.5 : 9.5, RED);
    hline(y - h, strong ? INK : LINE_DARK, strong ? 1 : 0.6);
    y -= h;
  };

  // ---- 본문 ----
  drawPageTop(true);
  drawSummary();
  drawTableHead();

  const sections: { label: string; accent: ReturnType<typeof rgb>; rows: UnpaidReportRow[] }[] = [
    { label: "세이브택스", accent: BLUE, rows: input.rows.filter(r => r.affiliation === "세이브택스") },
    { label: "개인세무거래처", accent: PURPLE, rows: input.rows.filter(r => r.affiliation !== "세이브택스") },
  ].filter(s => s.rows.length > 0);

  if (input.rows.length === 0) {
    ensureSpace(40);
    text("미수 거래처가 없습니다.", M, y - 26, 10, { color: MUTE, align: "center", w: tableRight - M });
    y -= 40;
  }

  let no = 1;
  for (const sec of sections) {
    const sorted = [...sec.rows].sort((a, b) => b.unpaidAmount - a.unpaidAmount || b.unpaidMonths.length - a.unpaidMonths.length);
    drawSectionHead(sec.label, sorted.length, sorted.reduce((s, r) => s + r.unpaidAmount, 0), sec.accent);
    sorted.forEach((r, i) => drawRow(no++, r, i % 2 === 1));
    if (sections.length > 1) drawTotalRow(`${sec.label} 소계`, sorted, false);
  }
  if (input.rows.length > 0) drawTotalRow("총계", input.rows, true);

  // ---- 푸터 (페이지 번호) ----
  pages.forEach((p, i) => {
    page = p;
    const s = `${i + 1} / ${pages.length}`;
    text(s, (W - tw(s, 8)) / 2, FOOT_Y - 8, 8, { color: MUTE });
    text(`출력 ${input.printedAt}`, M, FOOT_Y - 8, 7, { color: MUTE });
    const note = "미수 = 출금일이 지난 달 중 수납 처리되지 않은 달 (청구 제외 달 제외)";
    text(note, tableRight - tw(note, 7), FOOT_Y - 8, 7, { color: MUTE });
  });

  return doc.save();
}
