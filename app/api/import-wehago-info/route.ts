import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/import-wehago-info — 수집 데이터를 DB에 반영 (사업자번호 매칭)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const data = Array.isArray(body) ? body : body.data;

  if (!data || !Array.isArray(data)) {
    return NextResponse.json({ error: "data 배열이 필요합니다" }, { status: 400 });
  }

  const allClients = await prisma.client.findMany({
    where: { isDeleted: false },
    select: { id: true, bizNumber: true },
  });

  let updated = 0;
  for (const row of data) {
    if (!row.bizNumber || !row.cno) continue;

    const updateData: any = { wehagoCno: row.cno, wehagoCdCom: row.cdCom };
    if (row.colors) {
      updateData.wehagoColors = typeof row.colors === "string" ? row.colors : JSON.stringify(row.colors);
    }

    const rowBiz = row.bizNumber.replace(/[^0-9]/g, "");
    const match = allClients.find((c: any) => c.bizNumber?.replace(/[^0-9]/g, "") === rowBiz);
    if (match) {
      await prisma.client.update({ where: { id: match.id }, data: updateData });
      updated++;
    }
  }

  return NextResponse.json({ success: true, updated });
}
