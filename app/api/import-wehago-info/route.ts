import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/import-wehago-info — CSV 데이터를 DB에 반영 (로컬 스크립트용)
export async function POST(req: NextRequest) {
  const { data } = await req.json() as {
    data: { id: number; bizNumber: string; cno: string; cdCom: string }[];
  };

  let updated = 0;
  for (const row of data) {
    // id가 있으면 id로 업데이트
    if (row.id && row.id > 0) {
      try {
        await prisma.client.update({
          where: { id: row.id },
          data: { wehagoCno: row.cno, wehagoCdCom: row.cdCom },
        });
        updated++;
        continue;
      } catch {}
    }

    // id가 없으면 사업자번호로 매칭
    if (row.bizNumber) {
      const clients = await prisma.client.findMany({
        where: { isDeleted: false },
        select: { id: true, bizNumber: true },
      });
      for (const client of clients) {
        const dbBiz = client.bizNumber?.replace(/[^0-9]/g, "") ?? "";
        const rowBiz = row.bizNumber.replace(/[^0-9]/g, "");
        if (dbBiz && dbBiz === rowBiz) {
          await prisma.client.update({
            where: { id: client.id },
            data: { wehagoCno: row.cno, wehagoCdCom: row.cdCom },
          });
          updated++;
          break;
        }
      }
    }
  }

  return NextResponse.json({ success: true, updated });
}
