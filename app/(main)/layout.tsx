import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/app/actions/settings";
import { prisma } from "@/lib/prisma";
import TopNav from "@/components/TopNav";
import DockBar from "@/components/DockBar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DriveBasePathSync } from "@/components/DriveBasePathSync";
import { ChatBot } from "@/components/ChatBot";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const settings = await getSettings();

  // 알림 카운트 (사용자별 필터)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);
  const isReadonly = session.role === "readonly";
  const myClient = isReadonly ? {} : { assignedUserId: session.id };

  const [distributions, urgentCount, delayedCount] = await Promise.all([
    // 신규 배분: 김태호 등 일반은 taeho_ 제외, 이휘언은 taeho_만
    prisma.distribution.findMany({
      where: {
        assignedUserId: session.id,
        isSkipped: false,
        confirmedAt: null,
        clientName: { not: "-" },
        NOT: { clientType: { startsWith: "excluded_" } },
      },
      select: { clientType: true },
    }),
    // 마감 임박 (3일 이내)
    prisma.task.count({
      where: {
        isDeleted: false,
        status: { notIn: ["done", "hold"] },
        dueDate: { lte: threeDaysLater, gte: today },
        client: myClient,
      },
    }),
    // 지연 업무
    prisma.task.count({
      where: { isDeleted: false, status: "delayed", client: myClient },
    }),
  ]);

  const isTaeho = (session.name || "") === "이휘언";
  const distributionCount = distributions.filter((d) =>
    isTaeho ? d.clientType?.startsWith("taeho_") : !d.clientType?.startsWith("taeho_")
  ).length;

  const notifications = {
    distribution: distributionCount,
    urgent: urgentCount,
    delayed: delayedCount,
  };

  return (
    <div className="glass-canvas h-screen overflow-hidden flex flex-col">
      <TopNav user={session} settings={settings} notifications={notifications} />
      <main className="flex-1 px-6 pb-[100px] overflow-y-auto text-[#4E5968]">{children}</main>
      <DockBar />
      <GlobalSearch />
      <ChatBot />
      <DriveBasePathSync value={settings?.driveBasePath ?? null} />
    </div>
  );
}
