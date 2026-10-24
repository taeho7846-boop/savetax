// AI자동기장 서버 전용 — 실행기 인증·직원 유무 자동 판단·기록. 화면과 같이 쓰는 값은 lib/autobook-shared.ts
import crypto from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export * from "@/lib/autobook-shared";

// 직원 유무는 거래한 달마다 그 달 근로소득(급여) 인원이 있는지로 자동 판단 (2026-10-24 대표님 확정, 직접 지정 없음)
// → 거래처별 급여가 있는 달 "YYYY-MM" 목록. 판단 엔진이 거래 날짜의 달이 목록에 있으면 811 복리후생비, 없으면 812 여비교통비
export async function staffMonthsMap(clientIds: number[], fromYM: string, toYM: string): Promise<Map<number, string[]>> {
  const rows = await prisma.payrollMonth.findMany({
    where: { clientId: { in: clientIds }, incomeType: "salary", yearMonth: { gte: fromYM, lte: toYM }, headcount: { gt: 0 } },
    select: { clientId: true, yearMonth: true },
    orderBy: { yearMonth: "asc" },
  });
  const m = new Map<number, string[]>(clientIds.map(id => [id, []]));
  for (const r of rows) m.get(r.clientId)?.push(r.yearMonth);
  return m;
}

// ── 실행기 인증: Authorization: Bearer <token>. DB엔 sha256만 저장 ──
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const newToken = () => "ab_" + crypto.randomBytes(24).toString("hex");

export async function agentFromRequest(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  const agent = await prisma.autobookAgent.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!agent) return null;
  const user = await prisma.user.findUnique({ where: { id: agent.userId, isActive: true }, select: { id: true, name: true, role: true } });
  return user ? { agent, user } : null;
}

export function pushLog(logJson: string, text: string, at = new Date()): string {
  let arr: { at: string; text: string }[] = [];
  try { arr = JSON.parse(logJson || "[]"); } catch { arr = []; }
  arr.push({ at: at.toISOString(), text });
  return JSON.stringify(arr.slice(-200));
}
