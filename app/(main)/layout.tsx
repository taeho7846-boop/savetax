import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/app/actions/settings";
import { prisma } from "@/lib/prisma";
import TopNav from "@/components/TopNav";
import DockBar from "@/components/DockBar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DriveBasePathSync } from "@/components/DriveBasePathSync";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const settings = await getSettings();

  // 신규 배분 알림 카운트 (사용자별 필터)
  // - 김태호 등 일반: clientType이 taeho_로 시작하지 않는 것
  // - 이휘언: taeho_로 시작하는 것 (세무회계태호 배분)
  const distributions = await prisma.distribution.findMany({
    where: {
      assignedUserId: session.id,
      isSkipped: false,
      confirmedAt: null,
      clientName: { not: "-" },
      NOT: { clientType: { startsWith: "excluded_" } },
    },
    select: { clientType: true },
  });
  const isTaeho = (session.name || "") === "이휘언";
  const distributionCount = distributions.filter((d) =>
    isTaeho ? d.clientType?.startsWith("taeho_") : !d.clientType?.startsWith("taeho_")
  ).length;

  return (
    <div className="glass-canvas min-h-screen flex flex-col">
      <TopNav user={session} settings={settings} distributionCount={distributionCount} />
      <main className="flex-1 px-6 pb-[100px] overflow-y-auto text-[#4E5968]">{children}</main>
      <DockBar />
      <GlobalSearch />
      <DriveBasePathSync value={settings?.driveBasePath ?? null} />
    </div>
  );
}
