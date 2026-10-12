import { prisma } from "./prisma";

export const MANAGER_ROLES = ["owner", "admin", "accountant"];

export function isManagerRole(role: string) {
  return MANAGER_ROLES.includes(role);
}

// 내 팀(본인 + 같은 팀 사람들)의 userId 목록
// - 관리자(대표/관리자/세무사): 본인 + 소속 직원
// - 직원: 본인 + 상위 관리자 + 같은 관리자 밑의 동료
export async function getTeamUserIds(sessionId: number, role: string): Promise<number[]> {
  const user = await prisma.user.findUnique({
    where: { id: sessionId },
    select: { managerId: true },
  });

  const userIds: number[] = [sessionId];

  if (isManagerRole(role)) {
    const employees = await prisma.user.findMany({
      where: { managerId: sessionId, isActive: true },
      select: { id: true },
    });
    userIds.push(...employees.map(e => e.id));
  }

  if (role === "employee" && user?.managerId) {
    const teammates = await prisma.user.findMany({
      where: {
        OR: [
          { id: user.managerId },
          { managerId: user.managerId, isActive: true },
        ],
      },
      select: { id: true },
    });
    userIds.push(...teammates.map(t => t.id));
  }

  return [...new Set(userIds)];
}

// 서울 기준 오늘 날짜 "YYYY-MM-DD"
export function todaySeoul(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

// 다이어리 공유 범위 = 같은 세무사 사무실
// - 사무실 = 직원관리의 "사업체명 2"(예: 세무회계태호). 직원은 본인 값이 없으면 소속 세무사의 사무실을 따른다
// - 같은 사무실명을 가진 활성 계정끼리 서로의 일정·할 일을 본다 (세무사 사무실마다 다이어리가 따로)
// - 사무실명이 없으면 기존 팀(관리자+소속 직원) 범위로만 공유
type OfficeUser = { id: number; bizName2: string | null; managerId: number | null; manager: { bizName2: string | null } | null };

function effectiveOffice(u: OfficeUser): string | null {
  const own = u.bizName2?.trim();
  if (own) return own;
  const mgr = u.manager?.bizName2?.trim();
  return mgr || null;
}

export async function getDiaryOffice(sessionId: number): Promise<string | null> {
  const me = await prisma.user.findUnique({
    where: { id: sessionId },
    select: { id: true, bizName2: true, managerId: true, manager: { select: { bizName2: true } } },
  });
  return me ? effectiveOffice(me) : null;
}

export async function getDiaryScope(sessionId: number, role: string): Promise<{ userIds: number[]; shared: boolean; office: string | null }> {
  const office = await getDiaryOffice(sessionId);
  if (office) {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { not: "readonly" } },
      select: { id: true, bizName2: true, managerId: true, manager: { select: { bizName2: true } } },
    });
    const ids = users.filter(u => effectiveOffice(u) === office).map(u => u.id);
    return { userIds: [...new Set([sessionId, ...ids])], shared: true, office };
  }
  return { userIds: await getTeamUserIds(sessionId, role), shared: false, office: null };
}

// 사무실 공통 일정 등록·수정 권한: 같은 사무실 멤버면 누구나 (사무실 일정은 그 사무실 안에서만 보임)
export async function canManageOfficeSchedule(_sessionId: number, _role: string): Promise<boolean> {
  return true;
}
