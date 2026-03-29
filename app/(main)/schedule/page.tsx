import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSchedules } from "@/app/actions/schedule";
import { ScheduleCalendar } from "./ScheduleCalendar";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const yearMonth = params.ym || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const schedules = await getSchedules(yearMonth);

  return (
    <div className="flex flex-col h-full">
      <ScheduleCalendar
        schedules={schedules}
        yearMonth={yearMonth}
        currentUserId={session.id}
      />
    </div>
  );
}
