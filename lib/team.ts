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
