import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientScopeWhere } from "@/lib/client-scope";
import { parseSemoExcel, compareSemo } from "@/lib/semo-report";

/**
 * 세모리포트 '고객관리목록' 엑셀 업로드 → 기장대리 거래처와 대조 결과 반환.
 * 읽기 전용(아무것도 변경하지 않음). 상태 변경은 setSemoReportStatus 서버 액션.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

  let semoRows;
  try {
    semoRows = parseSemoExcel(await file.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "엑셀 파일을 읽을 수 없습니다" }, { status: 400 });
  }

  // 기장대리 범위의 거래처 전체 (계약중 + 해지)
  const scope = await getClientScopeWhere(session);
  const clients = await prisma.client.findMany({
    where: scope,
    select: {
      id: true, name: true, bizNumber: true, ceoName: true, clientType: true,
      contractStatus: true, semoReportStatus: true,
      assignedUser: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const result = compareSemo(clients, semoRows);
  return NextResponse.json({ fileName: file.name, ...result });
}
