import ExcelJS from "exceljs";

type CellState = "paid" | "unpaid" | "na";

export type ExportRow = {
  name: string;
  group: "started" | "notStarted" | "terminated";
  terminationMonth: string | null;
  affiliation: string | null;
  cmsAffiliation: string | null;
  assignedUserName: string | null;
  monthlyFee: number | null;
  firstWithdrawalMonth: string | null;
  cells: CellState[]; // months 와 같은 길이
  cumulativeExpected: number;
  cumulativePaid: number;
  cumulativeUnpaid: number;
};

export type ReceivablesExportBody = {
  year: number;
  months: string[]; // ["2026-01", ... "2026-12"]
  rows: ExportRow[];
  filterSummary?: string; // 화면에 적용된 필터 설명 (없으면 "전체")
};

// 화면 표와 동일한 색상
const C = {
  ink: "FF191F28",
  sub: "FF6B7684",
  line: "FFE5E8EB",
  headBg: "FFF2F4F6",
  paidBg: "FFE7F7EE",
  paidFg: "FF15803D",
  unpaidBg: "FFFEF2F2",
  unpaidFg: "FFDC2626",
  naFg: "FFC4CCD4",
  termBg: "FFFFFBEB",
  termFg: "FFB45309",
  blue: "FF3182F6",
};

const FONT = "맑은 고딕";
const WON = '#,##0"원"';

function fill(color: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: C.line } },
    bottom: { style: "thin", color: { argb: C.line } },
    left: { style: "thin", color: { argb: C.line } },
    right: { style: "thin", color: { argb: C.line } },
  };
}

const GROUP_LABEL: Record<ExportRow["group"], string> = {
  started: "진행중",
  notStarted: "출금전",
  terminated: "해지",
};

/** 채권(월별) 화면 데이터를 서식 입힌 xlsx 버퍼로 변환 */
export async function buildReceivablesWorkbook(body: ReceivablesExportBody): Promise<ArrayBuffer> {
  const { year, months, rows } = body;

  const wb = new ExcelJS.Workbook();
  wb.creator = "세무회계 관리시스템";

  // ───────────────────────── 시트1: 채권(월별) ─────────────────────────
  const ws = wb.addWorksheet(`${year}년 채권`, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
  });

  const fixedCols = [
    { header: "고객사명", width: 26 },
    { header: "상태", width: 11 },
    { header: "소속", width: 14 },
    { header: "CMS", width: 14 },
    { header: "담당자", width: 10 },
    { header: "월 기장료", width: 13 },
  ];
  const monthCols = months.map((m) => ({ header: `${parseInt(m.split("-")[1])}월`, width: 6.5 }));
  const tailCols = [
    { header: "누적 청구", width: 14 },
    { header: "누적 수납", width: 14 },
    { header: "미수금액", width: 14 },
  ];
  const allCols = [...fixedCols, ...monthCols, ...tailCols];
  const lastCol = allCols.length;
  const monthStart = fixedCols.length + 1; // 월 컬럼 시작 인덱스(1-base)
  const tailStart = fixedCols.length + months.length; // 누적 컬럼 직전(0-base 오프셋)

  ws.columns = allCols.map((c) => ({ width: c.width }));

  // 1행: 제목
  const titleRow = ws.addRow([`${year}년 채권 관리 (월별)`]);
  ws.mergeCells(1, 1, 1, lastCol);
  titleRow.height = 30;
  titleRow.getCell(1).font = { name: FONT, size: 15, bold: true, color: { argb: C.ink } };
  titleRow.getCell(1).alignment = { vertical: "middle" };

  // 2행: 필터 · 건수 · 다운로드 시각
  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
  const subRow = ws.addRow([`필터: ${body.filterSummary || "전체"} · ${rows.length}곳 · 다운로드 ${stamp}`]);
  ws.mergeCells(2, 1, 2, lastCol);
  subRow.getCell(1).font = { name: FONT, size: 9, color: { argb: C.sub } };

  // 3행: 여백
  ws.addRow([]);

  // 4행: 헤더
  const HEADER_ROW_NO = 4;
  const headerRow = ws.addRow(allCols.map((c) => c.header));
  headerRow.height = 22;
  headerRow.eachCell((cell, col) => {
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: col === lastCol ? C.unpaidFg : C.ink } };
    cell.fill = fill(C.headBg);
    cell.alignment = { horizontal: col === 1 ? "left" : "center", vertical: "middle" };
    cell.border = thinBorder();
  });

  // 데이터
  for (const r of rows) {
    const statusLabel =
      r.group === "terminated"
        ? `해지${r.terminationMonth ? ` ~${r.terminationMonth.slice(5)}월` : ""}`
        : GROUP_LABEL[r.group];

    const values: (string | number | null)[] = [
      r.name,
      statusLabel,
      r.affiliation || "-",
      r.cmsAffiliation || "-",
      r.assignedUserName || "-",
      r.monthlyFee ?? null,
      ...r.cells.map((s) => (s === "paid" ? "○" : s === "unpaid" ? "✕" : "·")),
      r.cumulativeExpected,
      r.cumulativePaid,
      r.cumulativeUnpaid,
    ];
    const row = ws.addRow(values);
    row.height = 20;

    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thinBorder();
    });

    // 고객사명: 왼쪽 정렬
    row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

    // 상태
    const stCell = row.getCell(2);
    if (r.group === "terminated") {
      stCell.fill = fill(C.termBg);
      stCell.font = { name: FONT, size: 9, bold: true, color: { argb: C.termFg } };
    } else {
      stCell.font = { name: FONT, size: 9, color: { argb: C.sub } };
    }

    // 세이브택스 소속 강조
    if (r.affiliation === "세이브택스") {
      row.getCell(3).font = { name: FONT, size: 10, bold: true, color: { argb: C.blue } };
    }
    if (r.cmsAffiliation === "세이브택스") {
      row.getCell(4).font = { name: FONT, size: 10, bold: true, color: { argb: C.blue } };
    }

    // 월 기장료
    const feeCell = row.getCell(6);
    feeCell.numFmt = WON;
    feeCell.alignment = { horizontal: "right", vertical: "middle" };

    // 월별 셀 (○ 수납 / ✕ 미수 / · 해당없음)
    r.cells.forEach((state, i) => {
      const cell = row.getCell(monthStart + i);
      if (state === "paid") {
        cell.fill = fill(C.paidBg);
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.paidFg } };
      } else if (state === "unpaid") {
        cell.fill = fill(C.unpaidBg);
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.unpaidFg } };
      } else {
        cell.font = { name: FONT, size: 10, color: { argb: C.naFg } };
      }
    });

    // 누적 청구 / 누적 수납 / 미수금액
    for (let i = 1; i <= 3; i++) {
      const cell = row.getCell(tailStart + i);
      cell.numFmt = WON;
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
    row.getCell(tailStart + 2).font = { name: FONT, size: 10, color: { argb: C.paidFg } };
    row.getCell(tailStart + 3).font =
      r.cumulativeUnpaid > 0
        ? { name: FONT, size: 10, bold: true, color: { argb: C.unpaidFg } }
        : { name: FONT, size: 10, color: { argb: C.paidFg } };
  }

  // 합계 행
  if (rows.length > 0) {
    const sumValues: (string | number | null)[] = new Array(lastCol).fill(null);
    sumValues[0] = `합계 (${rows.length}곳)`;
    sumValues[5] = rows.reduce((s, r) => s + (r.monthlyFee ?? 0), 0);
    months.forEach((_, i) => {
      sumValues[fixedCols.length + i] = rows.filter((r) => r.cells[i] === "paid").length;
    });
    sumValues[tailStart] = rows.reduce((s, r) => s + r.cumulativeExpected, 0);
    sumValues[tailStart + 1] = rows.reduce((s, r) => s + r.cumulativePaid, 0);
    sumValues[tailStart + 2] = rows.reduce((s, r) => s + r.cumulativeUnpaid, 0);

    const sumRow = ws.addRow(sumValues);
    sumRow.height = 24;
    sumRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = fill(C.headBg);
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: col === lastCol ? C.unpaidFg : C.ink } };
      cell.alignment = { horizontal: col === 1 ? "left" : "center", vertical: "middle" };
      cell.border = thinBorder();
    });
    sumRow.getCell(6).numFmt = WON;
    sumRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
    for (let i = 1; i <= 3; i++) {
      sumRow.getCell(tailStart + i).numFmt = WON;
      sumRow.getCell(tailStart + i).alignment = { horizontal: "right", vertical: "middle" };
    }
  }

  // 자동 필터 + 인쇄 설정
  ws.autoFilter = {
    from: { row: HEADER_ROW_NO, column: 1 },
    to: { row: HEADER_ROW_NO + rows.length, column: lastCol },
  };
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // ───────────────────────── 시트2: 소속별 요약 ─────────────────────────
  const ws2 = wb.addWorksheet("소속별 요약");
  ws2.columns = [{ width: 20 }, { width: 11 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 11 }];

  const t2 = ws2.addRow([`${year}년 소속별 채권 요약`]);
  ws2.mergeCells(1, 1, 1, 6);
  t2.height = 28;
  t2.getCell(1).font = { name: FONT, size: 14, bold: true, color: { argb: C.ink } };
  ws2.addRow([]);

  const h2 = ws2.addRow(["소속", "거래처수", "누적 청구", "누적 수납", "미수금", "수납률"]);
  h2.height = 22;
  h2.eachCell((cell) => {
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
    cell.fill = fill(C.headBg);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
  });

  const groups = [
    { label: "세이브택스", match: (r: ExportRow) => r.affiliation === "세이브택스" },
    { label: "개인세무거래처", match: (r: ExportRow) => r.affiliation !== "세이브택스" },
  ];
  for (const g of groups) {
    const gr = rows.filter(g.match);
    const expected = gr.reduce((s, r) => s + r.cumulativeExpected, 0);
    const paid = gr.reduce((s, r) => s + r.cumulativePaid, 0);
    const unpaid = expected - paid;
    const row = ws2.addRow([g.label, gr.length, expected, paid, unpaid, expected > 0 ? paid / expected : 0]);
    row.height = 20;
    row.eachCell((cell) => {
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thinBorder();
    });
    row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    [3, 4, 5].forEach((i) => {
      row.getCell(i).numFmt = WON;
      row.getCell(i).alignment = { horizontal: "right", vertical: "middle" };
    });
    row.getCell(4).font = { name: FONT, size: 10, color: { argb: C.paidFg } };
    row.getCell(5).font = { name: FONT, size: 10, bold: true, color: { argb: unpaid > 0 ? C.unpaidFg : C.paidFg } };
    row.getCell(6).numFmt = "0.0%";
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
