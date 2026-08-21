import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildReceivablesWorkbook, type ReceivablesExportBody } from "@/lib/receivables-excel";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = (await req.json()) as ReceivablesExportBody;
  if (!Array.isArray(body?.months) || !Array.isArray(body?.rows)) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const buf = await buildReceivablesWorkbook(body);
  const year = body.year;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="receivables_${year}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${year}년_채권관리.xlsx`)}`,
    },
  });
}
