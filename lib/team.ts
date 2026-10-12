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

// 다이어리 공유 범위
// - 직원관리에서 "다이어리 공유"를 켠 사람끼리는 팀 구분 없이 서로의 일정·할 일을 본다
// - 공유를 안 켠 사람은 기존 팀(관리자+소속 직원) 범위
export async function getDiaryScope(sessionId: number, role: string): Promise<{ userIds: number[]; shared: boolean }> {
  const me = await prisma.user.findUnique({ where: { id: sessionId }, select: { diaryShared: true } });
  if (me?.diaryShared) {
    const users = await prisma.user.findMany({
      where: { diaryShared: true, isActive: true },
      select: { id: true },
    });
    return { userIds: [...new Set([sessionId, ...users.map(u => u.id)])], shared: true };
  }
  return { userIds: await getTeamUserIds(sessionId, role), shared: false };
}

// 사무실 공통 일정 등록·수정 권한: 관리자 역할이거나 다이어리 공유 멤버
export async function canManageOfficeSchedule(sessionId: number, role: string): Promise<boolean> {
  if (isManagerRole(role)) return true;
  const me = await prisma.user.findUnique({ where: { id: sessionId }, select: { diaryShared: true } });
  return !!me?.diaryShared;
}
