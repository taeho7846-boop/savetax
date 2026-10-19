/** 인건비(급여) 데이터 타입 — 서버 의존성 없음 (클라이언트 컴포넌트에서 import 가능). 수집·조회 로직은 lib/payroll.ts */

export type PayrollType = "salary" | "business" | "daily";
export const PAYROLL_TYPES: { key: PayrollType; label: string; short: string; color: string }[] = [
  { key: "salary", label: "근로소득", short: "근로", color: "#10B981" },
  { key: "business", label: "사업소득", short: "사업", color: "#3182F6" },
  { key: "daily", label: "일용직", short: "일용", color: "#F59E0B" },
];

export type PayrollEmployee = {
  name: string;
  gross: number;
  deductions: number;
  net: number;
  dept?: string;
  rank?: string;
  /** 근로: 지급 항목 내역 (기본급·수당 등) */
  items?: { label: string; amount: number }[];
  /** 사업: 소득세·지방세 */
  incomeTax?: number;
  localTax?: number;
};

export type PayrollTypeMonth = {
  incomeType: PayrollType;
  headcount: number;
  gross: number;
  deductions: number;
  net: number;
  employees: PayrollEmployee[];
  sourceFile: string | null;
  collectedAt: string;
};

export type PayrollMonthData = {
  yearMonth: string;
  total: { headcount: number; gross: number; net: number };
  types: PayrollTypeMonth[];
};

export type CollectResult = {
  yearMonth: string;
  types: { incomeType: PayrollType; status: "saved" | "missing" | "empty" | "error"; headcount?: number; gross?: number; message?: string }[];
};

/** 원천세 신고 진행·납부세액 (월별) — 인건비 상세 모달이 급여와 나란히 보여준다 */
export type PayrollFilingMonth = {
  yearMonth: string;
  steps: string[];
  doneSteps: string[];
  status: "none" | "progress" | "filed" | "done";
  statusLabel: string;
  statusColor: string;
  incomeAmount: number | null;
  localAmount: number | null;
  reportType: string | null;
  receiptNo: string | null;
  filingStatus: string | null;
  submittedAt: string | null;
  isCurrent: boolean;
};

/** 위하고 급여 화면 주소 재료 (확장으로 자료 내려받기용) */
export type PayrollWehago = {
  ready: boolean;
  reason: string | null;
  cno: string | null;
  cdCom: string | null;
  companyId: string;
  taxNum: string;
  colors: Record<string, string>;
};
