import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PhoneClientViewer } from "@/app/(main)/dashboard/PhoneClientViewer";
import { DriveBasePathSync } from "@/components/DriveBasePathSync";
import { PhoneEditModalHost } from "./PhoneEditModalHost";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Savetax Phone",
  description: "고객사 빠른 보조",
  manifest: "/phone-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Savetax Phone",
  },
};

export const viewport: Viewport = {
  themeColor: "#3182F6",
  width: "device-width",
  initialScale: 1,
};

export default async function PhonePopupPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [rawClients, settings] = await Promise.all([
    prisma.client.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        bizNumber: true,
        ceoName: true,
        phone: true,
        laborTypes: true,
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
    }),
    prisma.settings.findUnique({ where: { userId: session.id }, select: { driveBasePath: true } }),
  ]);

  // 본인 담당 거래처 먼저 정렬
  const myClients = [...rawClients].sort((a, b) => {
    const aMine = a.assignedUserId === session.id ? 0 : 1;
    const bMine = b.assignedUserId === session.id ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-0">
      <PhoneClientViewer clients={myClients} />
      <DriveBasePathSync value={settings?.driveBasePath ?? null} />
      {/* 편집 모달 — 열리면 팝업 창이 폴드처럼 펼쳐지고, 닫으면 다시 접힘 */}
      <PhoneEditModalHost />
    </div>
  );
}
