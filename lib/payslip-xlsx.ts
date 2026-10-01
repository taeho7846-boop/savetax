// 급여명세서 엑셀 생성 — 위하고 급여자료입력 F9 인쇄 미리보기의 '엑셀 저장' 결과와 같은 배치로 만든다
// (직원 1명당 50행 블록, 위멤버스 '일반근로자 임금명세서' 불러오기 + parsePayslipXlsx 가 읽는 양식)
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import type { PayslipEmployee } from "./payslip-doc";

const BLOCK_ROWS = 50; // 직원 블록 1개의 행 수
const ITEM_ROWS = 25;  // 지급/공제 내역 칸 수 (15~39행)
const NUM_FMT = "#,##0";
const COL_WIDTHS = [9, 18, 10, 18, 12, 21];
// 블록 내 행 높이 (원본 엑셀과 동일, 1행부터)
const ROW_HEIGHTS = [
  17.25, 11.25, 19.5, 3.25, 17.6, 17.6, 10.35, 19.85, 19.85, 3, 9, 2.4, 17.25, 0.55,
  ...Array(ITEM_ROWS).fill(13.5),
  18, 16.5, 16.05, 14.8, 16.9, 0.45, 14.25, 1.5, 30.75,
];

const GRAY: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD3D3D3" } };
const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FF595959" } };
const BOX: Partial<ExcelJS.Borders> = { top: THIN, bottom: THIN, left: THIN, right: THIN };

// 위하고 급여자료입력 '엑셀 내려받기(Ctrl+G)' 파일 → 사원 목록
// 1행: 사원코드|사원명|부서|직급|직종|수당(병합)…|공제(병합)…|차인지급액, 2행: 수당/공제 항목명, 마지막 행: 합계
// 생년월일·통상시급·근로시간은 이 파일에 없어 빈 값으로 둔다. 지급액이 없는 사원은 제외(위하고 인쇄본과 동일)
export function parseWehagoSalaryGrid(buf: Buffer, payDate = ""): PayslipEmployee[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const s = (v: unknown) => String(v ?? "").trim();
  const flat = (v: unknown) => s(v).replace(/\s/g, "");
  const num = (v: unknown): number => {
    if (typeof v === "number") return v;
    const n = parseFloat(s(v).replace(/[^0-9.-]/g, ""));
    return isNaN(n) ? 0 : n;
  };

  const h = rows.findIndex((r) => flat(r[0]) === "사원코드");
  if (h < 0 || !rows[h + 1]) throw new Error("급여자료입력 엑셀 양식이 아닙니다 ('사원코드' 머리글 없음)");
  const head = rows[h].map(flat);
  const sub = rows[h + 1].map(s);
  const col = (name: string) => head.indexOf(name);
  const payStart = col("수당"), dedStart = col("공제"), netCol = col("차인지급액");
  if (payStart < 0 || dedStart < 0 || netCol < 0) throw new Error("급여자료입력 엑셀 양식이 아닙니다 (수당/공제/차인지급액 열 없음)");
  const payTotalCol = dedStart - 1; // 지급액계
  const dedTotalCol = netCol - 1;   // 공제액계

  const employees: PayslipEmployee[] = [];
  for (let i = h + 2; i < rows.length; i++) {
    const r = rows[i];
    if (flat(r[0]) === "합계") break;
    const name = s(r[col("사원명")]);
    if (!name) continue;
    const pick = (from: number, to: number) => {
      const out: { label: string; amount: number }[] = [];
      for (let c = from; c < to; c++) if (sub[c] && num(r[c]) !== 0) out.push({ label: sub[c], amount: num(r[c]) });
      return out;
    };
    const paymentTotal = num(r[payTotalCol]);
    if (paymentTotal === 0) continue;
    const rank = s(r[col("직급")]);
    employees.push({
      code: s(r[0]), name, birth: "",
      dept: s(r[col("부서")]), rank: rank === "직급없음" ? "" : rank, hobong: "",
      payDate,
      overtimeH: "", nightH: "", holidayH: "", hourlyWage: "",
      payments: pick(payStart, payTotalCol),
      deductions: pick(dedStart, dedTotalCol),
      paymentTotal,
      deductionTotal: num(r[dedTotalCol]),
      net: num(r[netCol]),
    });
  }
  return employees;
}

export async function buildPayslipXlsx(input: {
  companyName: string;
  year: string;   // "2026"
  month: string;  // "03"
  employees: PayslipEmployee[];
}): Promise<Buffer> {
  const { companyName, year, month, employees } = input;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  employees.forEach((emp, idx) => {
    const o = idx * BLOCK_ROWS; // 블록 시작 오프셋
    const cell = (r: number, c: string) => ws.getCell(`${c}${o + r}`);
    const set = (r: number, c: string, v: string | number | null | undefined, opts?: { align?: "left" | "center" | "right"; fill?: boolean; box?: boolean; bold?: boolean; size?: number }) => {
      const cl = cell(r, c);
      if (v !== "" && v != null) cl.value = v;
      if (typeof v === "number") cl.numFmt = NUM_FMT;
      cl.font = { name: "굴림체", size: opts?.size ?? 9, bold: opts?.bold };
      cl.alignment = { horizontal: opts?.align ?? "left", vertical: "middle" };
      if (opts?.fill) cl.fill = GRAY;
      if (opts?.box) cl.border = BOX;
    };
    const merge = (r: number, from: string, to: string) => ws.mergeCells(`${from}${o + r}:${to}${o + r}`);

    ROW_HEIGHTS.forEach((h, i) => { ws.getRow(o + i + 1).height = h; });
    // 원본처럼 A~F 전 칸을 미리 만들어 둔다 (안 그러면 시트 범위가 D1부터로 기록돼 A~C열을 못 읽는 파서가 있음)
    for (let r = 1; r <= ROW_HEIGHTS.length; r++) {
      for (const c of ["A", "B", "C", "D", "E", "F"]) cell(r, c).font = { name: "굴림체", size: 9 };
    }

    // 제목
    set(1, "D", `${year}년 ${month}월분 급여명세서`, { align: "center", bold: true, size: 12 });

    // 회사명 / 지급일
    merge(3, "B", "C");
    set(3, "A", "회사명 :");
    set(3, "B", companyName);
    set(3, "E", "지급일 :", { align: "right" });
    set(3, "F", emp.payDate);

    // 사원 정보
    set(5, "A", "사원코드 :"); set(5, "B", emp.code);
    set(5, "C", "사 원 명 :"); set(5, "D", emp.name);
    set(5, "E", "생년월일 :"); set(5, "F", emp.birth);
    set(6, "A", "부    서 :"); set(6, "B", emp.dept);
    set(6, "C", "직    급 :"); set(6, "D", emp.rank);
    set(6, "E", "호    봉 :"); set(6, "F", emp.hobong);

    // 근로시간
    merge(8, "D", "E"); merge(9, "D", "E");
    set(8, "A", "연장근로시간", { align: "center", box: true });
    set(8, "B", "야간근로시간", { align: "center", box: true });
    set(8, "C", "휴일근로시간", { align: "center", box: true });
    set(8, "D", "통상시급(원)", { align: "center", box: true });
    const numOrText = (v: string) => (v !== "" && !isNaN(Number(v)) ? Number(v) : v);
    set(9, "A", numOrText(emp.overtimeH), { align: "center", box: true });
    set(9, "B", numOrText(emp.nightH), { align: "center", box: true });
    set(9, "C", numOrText(emp.holidayH), { align: "center", box: true });
    set(9, "D", numOrText(emp.hourlyWage), { align: "center", box: true });
    if (typeof cell(9, "D").value === "number") cell(9, "D").numFmt = "#,##0.##";

    set(11, "F", "(단위, 원)", { align: "right", size: 8 });

    // 지급/공제 표 헤더
    merge(13, "B", "C"); merge(13, "D", "E");
    set(13, "A", "지   급   내   역", { align: "center", fill: true, box: true });
    set(13, "B", "지   급   액", { align: "center", fill: true, box: true });
    set(13, "D", "공  제  내  역", { align: "center", fill: true, box: true });
    set(13, "F", "공  제  액", { align: "center", fill: true, box: true });

    // 지급/공제 내역 (15~39행)
    for (let i = 0; i < ITEM_ROWS; i++) {
      const r = 15 + i;
      merge(r, "B", "C"); merge(r, "D", "E");
      const p = emp.payments[i];
      const d = emp.deductions[i];
      set(r, "A", p?.label, { align: "center" });
      set(r, "B", p ? p.amount : null, { align: "right" });
      set(r, "D", d?.label, { align: "center" });
      set(r, "F", d ? d.amount : null, { align: "right" });
    }

    // 합계
    merge(40, "B", "C"); merge(40, "D", "E");
    set(40, "D", "공  제  액  계", { align: "center", fill: true, box: true });
    set(40, "F", emp.deductionTotal, { align: "right", fill: true, box: true });
    merge(41, "B", "C"); merge(41, "D", "E");
    set(41, "A", "지  급  액  계", { align: "center", fill: true, box: true });
    set(41, "B", emp.paymentTotal, { align: "right", fill: true, box: true });
    set(41, "D", "차 인 지 급 액", { align: "center", fill: true, box: true });
    set(41, "F", emp.net, { align: "right", fill: true, box: true });

    // 계산방법
    merge(42, "A", "F"); merge(43, "A", "F"); merge(44, "B", "E"); merge(46, "B", "E");
    set(42, "A", "(단위, 원)", { align: "right", size: 8 });
    set(43, "A", "계산방법", { align: "center", fill: true, box: true });
    set(44, "A", "구분", { align: "center", fill: true, box: true });
    set(44, "B", "산출식 또는 산출방법", { align: "center", fill: true, box: true });
    set(44, "F", "지급액", { align: "center", fill: true, box: true });

    set(48, "D", "귀하의 노고에 감사드립니다.", { align: "center" });
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
