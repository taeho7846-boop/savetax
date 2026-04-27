import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    // 거래처 검색 — 모든 거래처 노출 (담당자 이름으로 구분)
    const rawClients = await prisma.client.findMany({
      where: {
        isDeleted: false,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { ceoName: { contains: q, mode: "insensitive" } },
                { bizNumber: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        ceoName: true,
        bizNumber: true,
        clientType: true,
        assignedUserId: true,
        assignedUser: {
          select: {
            id: true,
            name: true,
            role: true,
            manager: { select: { id: true, name: true, role: true } },
          },
        },
      },
      orderBy: { name: "asc" },
      take: 60,
    });

    // 본인 담당 거래처 먼저 노출 + 상위 30개
    const clients = [...rawClients]
      .sort((a, b) => {
        const aMine = a.assignedUserId === session.id ? 0 : 1;
        const bMine = b.assignedUserId === session.id ? 0 : 1;
        return aMine - bMine;
      })
      .slice(0, 30);

    // 북마크 검색 (공통 + 본인 개인)
    let bookmarks: any[] = [];
    try {
      bookmarks = await prisma.bookmark.findMany({
        where: {
          AND: [
            {
              OR: [
                { scope: "shared" },
                { scope: "personal", userId: session.id },
              ],
            },
            ...(q
              ? [
                  {
                    OR: [
                      { name: { contains: q, mode: "insensitive" as const } },
                      { keywords: { contains: q, mode: "insensitive" as const } },
                    ],
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          name: true,
          url: true,
          scope: true,
          category: true,
          usageCount: true,
        },
        orderBy: { usageCount: "desc" },
        take: 10,
      });
    } catch {
      // 북마크 테이블이 아직 없거나 에러 시 빈 배열
    }

    return NextResponse.json({ clients, bookmarks });
  } catch (err: any) {
    console.error("Search API error:", err);
    return NextResponse.json({ clients: [], bookmarks: [], error: err.message }, { status: 500 });
  }
}
