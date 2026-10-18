import { prisma } from "@/lib/prisma";

type SessionLike = { id: number; role: string };

/**
 * 기장대리(거래처) 목록과 동일한 권한 범위 조건.
 * - readonly: 세이브택스 소속 전체
 * - 세무사/관리자/대표: 본인 + 소속 직원의 거래처
 * - 직원: 본인이 사수 또는 부사수인 거래처
 * 신고대리 전용 거래처는 항상 제외한다.
 */
export async function getClientScopeWhere(session: SessionLike) {
  const isReadonly = session.role === "readonly";
  const isManager = ["accountant", "admin", "owner"].includes(session.role);

  let assignedFilter: Record<string, unknown> = {
    OR: [{ assignedUserId: session.id }, { subAssignedUserId: session.id }],
  };
  if (isReadonly) {
    assignedFilter = { affiliation: "세이브택스" };
  } else if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map(e => e.id)] } };
  }

  const notReportOnly = { OR: [{ taxTypes: null }, { NOT: { taxTypes: { contains: "신고대리" } } }] };

  return { isDeleted: false, AND: [assignedFilter, notReportOnly] };
}

/** 사업자번호 → 숫자 10자리 (엑셀에서 숫자로 읽힌 값의 앞자리 0 복원 포함) */
export function normalizeBizNumber(raw: unknown): string {
  if (raw == null) return "";
  let s: string;
  if (typeof raw === "number") {
    s = Math.round(raw).toString();
  } else {
    s = String(raw);
  }
  const digits = s.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return digits.length < 10 ? digits.padStart(10, "0") : digits;
}

export const SEMO_STATUS_LABELS: Record<string, string> = {
  use: "사용",
  none: "미반영",
  excluded: "제외",
};
