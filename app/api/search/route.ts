import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
    let assignedFilter: any = { assignedUserId: session.id };
    if (isManager) {
      const employees = await prisma.user.findMany({
        where: { managerId: session.id, isActive: true },
        select: { id: true },
      });
      const userIds = [session.id, ...employees.map((e) => e.id)];
      assignedFilter = { assignedUserId: { in: userIds } };
    }

    // 거래처 검색
    const clients = await prisma.client.findMany({
      where: {
        isDeleted: false,
        ...assignedFilter,
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
      },
      orderBy: { name: "asc" },
      take: 20,
    });

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
