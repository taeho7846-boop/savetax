import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PhoneClientViewer } from "@/app/(main)/dashboard/PhoneClientViewer";
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

  const myClients = await prisma.client.findMany({
    where: { isDeleted: false, assignedUserId: session.id },
    select: { id: true, name: true, bizNumber: true, ceoName: true, phone: true, laborTypes: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-0">
      <PhoneClientViewer clients={myClients} />
    </div>
  );
}
