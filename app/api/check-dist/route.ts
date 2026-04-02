import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  // 김태호 ID
  const taeho = await prisma.user.findFirst({ where: { name: "김태호" } });
  if (!taeho) return NextResponse.json({ error: "김태호 없음" });

  // 세이브택스 개인 - 김태호
  const savetax = await prisma.distribution.findMany({
    where: { clientType: "individual", assignedUserId: taeho.id, isSkipped: false },
    select: { clientName: true },
    orderBy: { clientName: "asc" },
  });

  // 세무회계태호 개인 - 전체 (김태호+이휘언)
  const taehoAll = await prisma.distribution.findMany({
    where: { clientType: "taeho_individual", isSkipped: false },
    select: { clientName: true, assignedUser: { select: { name: true } } },
    orderBy: { clientName: "asc" },
  });

  const savetaxNames = new Set(savetax.map(d => d.clientName));
  const taehoNames = new Set(taehoAll.map(d => d.clientName));

  const onlyInSavetax = savetax.filter(d => !taehoNames.has(d.clientName)).map(d => d.clientName);
  const onlyInTaeho = taehoAll.filter(d => !savetaxNames.has(d.clientName)).map(d => `${d.clientName} (${d.assignedUser.name})`);

  return NextResponse.json({
    세이브택스_김태호_개인: savetax.length,
    세무회계태호_개인_전체: taehoAll.length,
    세이브택스에만_있음: onlyInSavetax,
    세무회계태호에만_있음: onlyInTaeho,
  }, { status: 200 });
}
