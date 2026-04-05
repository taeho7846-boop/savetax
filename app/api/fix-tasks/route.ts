import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  // 최원석 ID 조회
  const choi = await prisma.user.findFirst({ where: { name: "최원석" } });
  if (!choi) return NextResponse.json({ error: "최원석 사용자 없음" });

  // 돈짬, 프랩, 메가커피 → 최원석 소유로 변경
  const targetTitles = ["돈짬, 청춘 경정청구", "프랩 기한후신고 (12개월치)", "메가커피 기한후신고 (6개월치)"];

  const results = [];
  for (const title of targetTitles) {
    const task = await prisma.task.findFirst({ where: { title, isDeleted: false } });
    if (task) {
      await prisma.task.update({
        where: { id: task.id },
        data: { createdByUserId: choi.id, assignedUserId: choi.id },
      });
      results.push(`${title} → 최원석(${choi.id})으로 변경 완료`);
    } else {
      results.push(`${title} → 찾을 수 없음`);
    }
  }

  return NextResponse.json({ choiId: choi.id, results });
}
