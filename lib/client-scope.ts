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

type SemoUserLike = { role: string; useSemoReport: boolean; manager?: { useSemoReport: boolean } | null } | null | undefined;

/** 담당자(사수) 기준 세무사가 세모리포트를 쓰는지 — 직원이면 소속 세무사 설정, 담당 미지정이면 사용으로 본다 */
export function accountantUsesSemo(user: SemoUserLike): boolean {
  if (!user) return true;
  if (user.role === "employee" && user.manager) return user.manager.useSemoReport;
  return user.useSemoReport;
}

/** 이 거래처에 세모리포트 단계가 적용되는지 — 세무사 미사용이면 전부 제외, 아니면 거래처별 '제외'(excluded) 확인 */
export function semoAppliesTo(client: { semoReportStatus?: string | null; assignedUser?: SemoUserLike }): boolean {
  if (!accountantUsesSemo(client.assignedUser)) return false;
  return client.semoReportStatus !== "excluded";
}

/** 로그인 사용자 기준 세모리포트 UI를 보여줄지 (본인 또는 소속 세무사가 사용 중인지) */
export async function semoEnabledForSession(session: { id: number; role: string }): Promise<boolean> {
  const me = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true, useSemoReport: true, manager: { select: { useSemoReport: true } } },
  });
  if (!me) return true;
  if (session.role === "owner" || session.role === "admin") return true; // 전체 관리자는 항상 노출(세무사별 설정은 거래처 단위로 반영)
  return accountantUsesSemo(me);
}

/** 거래처 id 목록 → 세모리포트 적용 여부 맵 (서버 액션에서 단계 보정용) */
export async function getSemoFlags(clientIds: number[]): Promise<Map<number, boolean>> {
  if (clientIds.length === 0) return new Map();
  const rows = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: {
      id: true, semoReportStatus: true,
      assignedUser: { select: { role: true, useSemoReport: true, manager: { select: { useSemoReport: true } } } },
    },
  });
  return new Map(rows.map(r => [r.id, semoAppliesTo(r)]));
}

export const SEMO_STATUS_LABELS: Record<string, string> = {
  use: "사용",
  none: "미반영",
  excluded: "제외",
};
