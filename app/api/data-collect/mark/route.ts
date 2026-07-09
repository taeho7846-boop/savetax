import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { verifyCollectToken } from "@/lib/collect-token";
import { revalidatePath } from "next/cache";

// 크롬 확장이 홈택스 자료 수집 완료 후 호출 (세션 쿠키 또는 collectToken 인증)
export async function POST(req: NextRequest) {
  const { token, clientId, docType, taxYear, params, status } = await req.json();

  if (!clientId || !docType || !taxYear) {
    return NextResponse.json({ ok: false, error: "clientId, docType, taxYear 필요" }, { status: 400 });
  }

  // status: "collected"(기본, 파일 수집됨) | "empty"(조회했으나 신고/발급 내역 없음)
  const newStatus = status === "empty" ? "empty" : "collected";

  const session = await getSession();
  if (!session && !verifyCollectToken(token, Number(clientId))) {
    return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 });
  }

  const where = {
    clientId_docType_taxYear: {
      clientId: Number(clientId),
      docType: String(docType),
      taxYear: String(taxYear),
    },
  };

  // 기존 params(_files 포함)를 보존하며 병합
  const existing = await prisma.dataCollection.findUnique({ where });
  let merged: Record<string, unknown> = {};
  if (existing?.params) {
    try { merged = JSON.parse(existing.params); } catch {}
  }
  if (params && typeof params === "object") merged = { ...merged, ...params };
  // 일괄 수집 완료 판정용 마커 — upload 라우트는 절대 쓰지 않고 mark(수집 종료)에서만 갱신한다.
  // (파일당 status=collected로 올라오는 upload와 구분되는, 서류 단위 "진짜 완료" 신호)
  merged._markAt = new Date().toISOString();

  await prisma.dataCollection.upsert({
    where,
    create: {
      clientId: Number(clientId),
      docType: String(docType),
      taxYear: String(taxYear),
      status: newStatus,
      params: Object.keys(merged).length ? JSON.stringify(merged) : null,
    },
    update: {
      status: newStatus,
      ...(Object.keys(merged).length ? { params: JSON.stringify(merged) } : {}),
    },
  });

  revalidatePath("/data-collect");
  return NextResponse.json({ ok: true });
}
