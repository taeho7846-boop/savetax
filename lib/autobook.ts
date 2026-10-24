// AI자동기장 서버 전용 — 실행기 인증·직원 유무 자동 판단·기록. 화면과 같이 쓰는 값은 lib/autobook-shared.ts
import crypto from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export * from "@/lib/autobook-shared";

// 직원 유무: 설정이 auto면 최근 6개월 근로소득(급여) 인원이 있는지로 판단
export async function staffAutoMap(clientIds: number[], refYM: string): Promise<Map<number, boolean>> {
  const [y, m] = refYM.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - 6, 1));
  const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = await prisma.payrollMonth.findMany({
    where: { clientId: { in: clientIds }, incomeType: "salary", yearMonth: { gte: from, lte: refYM }, headcount: { gt: 0 } },
    select: { clientId: true },
  });
  const has = new Set(rows.map(r => r.clientId));
  return new Map(clientIds.map(id => [id, has.has(id)]));
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
