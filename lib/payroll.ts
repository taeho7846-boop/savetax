import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { findFileByName, downloadFile } from "@/lib/google-drive";
import { parsePayslipXlsx } from "@/lib/payslip-doc";
import { parseWehagoSalaryGrid } from "@/lib/payslip-xlsx";
import { parseBusinessIncomeXlsx } from "@/lib/business-ledger";

/**
 * 거래처 인건비(급여) 데이터 — PayrollMonth 모델.
 *
 * 데이터 출처: 원천세 자동화(위멤버스 버튼)가 위하고에서 내려받아 구글드라이브에 올려 둔 월별 엑셀 3종
 *   - 근로: "{YYYY}년 {MM}월 급여명세서_{거래처}.xlsx"     → lib/payslip-doc.parsePayslipXlsx
 *   - 사업: "{YYYY}년 {MM}월 사업소득조회_{거래처}.xlsx"   → lib/business-ledger.parseBusinessIncomeXlsx
 *   - 일용: "{YYYY}년 {MM}월 일용직급여__{거래처}.xlsx"    → parseDailyWorkerXlsx (열 이름으로 추정, 서버 파서가 없던 양식)
 * 저장 시점: (1) 위멤버스 업로드 성공 직후 자동, (2) 프로필 > 인건비 상세 모달의 '드라이브에서 가져오기'(과거분 채우기)
 */

export type { PayrollType, PayrollEmployee, PayrollTypeMonth, PayrollMonthData, CollectResult } from "@/lib/payroll-types";
export { PAYROLL_TYPES } from "@/lib/payroll-types";
import type { PayrollType, PayrollEmployee, PayrollTypeMonth, PayrollMonthData, CollectResult } from "@/lib/payroll-types";

export function payrollFileName(type: PayrollType, clientName: string, yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  if (type === "salary") return `${y}년 ${m}월 급여명세서_${clientName}.xlsx`;
  if (type === "business") return `${y}년 ${m}월 사업소득조회_${clientName}.xlsx`;
  return `${y}년 ${m}월 일용직급여__${clientName}.xlsx`;
}

/* ───────── 일용직 파서 (열 이름 추정) ───────── */

const numOf = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const txt = (v: unknown) => String(v ?? "").trim();
const flat = (v: unknown) => txt(v).replace(/\s/g, "");

/**
 * 위하고 '일용직급여자료' 인쇄 미리보기 엑셀 → 사람별 합산.
 * 머리글 행에서 이름 열(성명/사원명/소득자명/이름)과 지급액 열(지급총액/지급액계/총지급액/지급액),
 * 실지급 열(차인지급액/실지급액)을 찾는다. 같은 사람이 여러 날 지급되면 합산.
 */
export function parseDailyWorkerXlsx(buf: Buffer): PayrollEmployee[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const out = new Map<string, PayrollEmployee>();
  const NAME = ["성명", "사원명", "소득자명", "이름", "근로자명"];
  const GROSS = ["지급총액", "지급액계", "총지급액", "총지급", "지급액", "급여액", "일당계", "지급합계"];
  const NET = ["차인지급액", "실지급액", "실수령액", "차감지급액"];
  const DED = ["공제액계", "공제합계", "공제총액", "공제액"];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    // 머리글 행: 이름 열과 지급액 열이 같이 있는 첫 행
    let h = -1, nameCol = -1, grossCol = -1, netCol = -1, dedCol = -1;
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const cells = rows[i].map(flat);
      const nc = cells.findIndex(c => NAME.includes(c));
      if (nc < 0) continue;
      const gc = cells.findIndex(c => GROSS.includes(c));
      if (gc < 0) continue;
      h = i; nameCol = nc; grossCol = gc;
      netCol = cells.findIndex(c => NET.includes(c));
      dedCol = cells.findIndex(c => DED.includes(c));
      break;
    }
    if (h < 0) continue;
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i];
      const name = txt(r[nameCol]);
      if (!name || /^(합계|총계|소계|계)$/.test(flat(name))) continue;
      const gross = numOf(r[grossCol]);
      if (gross === 0) continue;
      const net = netCol >= 0 ? numOf(r[netCol]) : gross;
      const ded = dedCol >= 0 ? numOf(r[dedCol]) : Math.max(0, gross - net);
      const cur = out.get(name) ?? { name, gross: 0, deductions: 0, net: 0 };
      cur.gross += gross; cur.deductions += ded; cur.net += net;
      out.set(name, cur);
    }
    if (out.size > 0) break;
  }
  return [...out.values()];
}

/* ───────── 파일 → 직원 목록 ───────── */

export function parsePayrollBuffer(type: PayrollType, buf: Buffer): PayrollEmployee[] {
  if (type === "salary") {
    // 드라이브의 급여명세서 엑셀은 보통 직원별 세로 블록(파싱: parsePayslipXlsx)이지만,
    // 위하고 급여자료입력 '엑셀 내려받기' 격자 양식이 그대로 올라간 경우도 있어 그 양식으로 한 번 더 시도한다
    let list: ReturnType<typeof parsePayslipXlsx>["employees"] = [];
    try { list = parsePayslipXlsx(buf).employees; } catch { list = []; }
    if (list.length === 0) {
      try { list = parseWehagoSalaryGrid(buf); } catch { /* 둘 다 아니면 빈 목록 */ }
    }
    return list.map(e => ({
      name: e.name, gross: e.paymentTotal, deductions: e.deductionTotal, net: e.net,
      dept: e.dept || undefined, rank: e.rank || undefined,
      items: e.payments.filter(p => p.amount !== 0),
    }));
  }
  if (type === "business") {
    // 같은 사람 여러 건은 parseBusinessIncomeXlsx 가 귀속/지급월별로 합쳐 주지만, 월 파일 안에서 다시 사람 단위로 합산
    const byName = new Map<string, PayrollEmployee>();
    for (const r of parseBusinessIncomeXlsx(buf)) {
      const key = `${r.name}|${r.resident ?? ""}`;
      const cur = byName.get(key) ?? { name: r.name, gross: 0, deductions: 0, net: 0, incomeTax: 0, localTax: 0 };
      cur.gross += r.amount;
      cur.incomeTax = (cur.incomeTax ?? 0) + r.incomeTax;
      cur.localTax = (cur.localTax ?? 0) + r.localTax;
      cur.net += r.net;
      cur.deductions += Math.max(0, r.amount - r.net);
      byName.set(key, cur);
    }
    return [...byName.values()];
  }
  return parseDailyWorkerXlsx(buf);
}

/* ───────── 드라이브에서 한 달 수집 ───────── */

/** 드라이브에 있는 3종 파일을 읽어 PayrollMonth 에 저장. 파일이 없는 유형은 건너뛴다(기존 데이터 유지). */
export async function collectPayrollMonth(client: { id: number; name: string }, yearMonth: string, types: PayrollType[] = ["salary", "business", "daily"]): Promise<CollectResult> {
  const result: CollectResult = { yearMonth, types: [] };
  for (const type of types) {
    const fileName = payrollFileName(type, client.name, yearMonth);
    try {
      const file = await findFileByName(fileName);
      if (!file) { result.types.push({ incomeType: type, status: "missing", message: fileName }); continue; }
      const buf = await downloadFile(file.id);
      const employees = parsePayrollBuffer(type, buf);
      if (employees.length === 0) { result.types.push({ incomeType: type, status: "empty", message: "파일은 있지만 지급 내역이 없음" }); continue; }
      const sum = employees.reduce((a, e) => ({ gross: a.gross + e.gross, ded: a.ded + e.deductions, net: a.net + e.net }), { gross: 0, ded: 0, net: 0 });
      const data = {
        headcount: employees.length, gross: BigInt(Math.round(sum.gross)), deductions: BigInt(Math.round(sum.ded)), net: BigInt(Math.round(sum.net)),
        employees: JSON.stringify(employees), sourceFile: file.name, collectedAt: new Date(),
      };
      await prisma.payrollMonth.upsert({
        where: { clientId_yearMonth_incomeType: { clientId: client.id, yearMonth, incomeType: type } },
        create: { clientId: client.id, yearMonth, incomeType: type, ...data },
        update: data,
      });
      result.types.push({ incomeType: type, status: "saved", headcount: employees.length, gross: sum.gross });
    } catch (e) {
      result.types.push({ incomeType: type, status: "error", message: `${fileName}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return result;
}

/* ───────── 조회 ───────── */

export async function getPayrollMonths(clientId: number): Promise<PayrollMonthData[]> {
  const rows = await prisma.payrollMonth.findMany({
    where: { clientId },
    orderBy: [{ yearMonth: "asc" }, { incomeType: "asc" }],
    select: { yearMonth: true, incomeType: true, headcount: true, gross: true, deductions: true, net: true, employees: true, sourceFile: true, collectedAt: true },
  });
  const byYm = new Map<string, PayrollMonthData>();
  for (const r of rows) {
    let m = byYm.get(r.yearMonth);
    if (!m) { m = { yearMonth: r.yearMonth, total: { headcount: 0, gross: 0, net: 0 }, types: [] }; byYm.set(r.yearMonth, m); }
    let employees: PayrollEmployee[] = [];
    try { employees = JSON.parse(r.employees) as PayrollEmployee[]; } catch { employees = []; }
    const t: PayrollTypeMonth = {
      incomeType: r.incomeType as PayrollType, headcount: r.headcount, gross: Number(r.gross), deductions: Number(r.deductions), net: Number(r.net),
      employees, sourceFile: r.sourceFile, collectedAt: r.collectedAt.toISOString(),
    };
    m.types.push(t);
    m.total.headcount += t.headcount; m.total.gross += t.gross; m.total.net += t.net;
  }
  return [...byYm.values()];
}
