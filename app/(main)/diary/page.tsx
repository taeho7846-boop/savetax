import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSchedulesInRange } from "@/app/actions/schedule";
import { getDiaryTasks, getDiaryMemos, getDiaryMembers } from "@/app/actions/diary";
import { getTaxEventsForMonth } from "@/lib/tax-calendar";
import { todaySeoul, canManageOfficeSchedule } from "@/lib/team";
import { visibleRange, type DiaryView as ViewMode } from "@/lib/diary-dates";
import { DiaryView } from "./DiaryView";

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; d?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const today = todaySeoul();
  const view: ViewMode = params.view === "week" ? "week" : "month"; // 월간이 기본
  const anchor = params.d && /^\d{4}-\d{2}-\d{2}$/.test(params.d) ? params.d : today;
  const { from, to, days } = visibleRange(view, anchor);

  const [schedules, tasks, memos, members, canOffice] = await Promise.all([
    getSchedulesInRange(from, to),
    getDiaryTasks(from, to),
    getDiaryMemos(30),
    getDiaryMembers(),
    canManageOfficeSchedule(session.id, session.role),
  ]);

  // 범위에 걸친 달의 세무 일정 (core만 캘린더에 표시)
  const monthsInRange = [...new Set(days.map(d => d.slice(0, 7)))];
  const taxEvents = monthsInRange.flatMap(ym => {
    const [y, m] = ym.split("-").map(Number);
    return getTaxEventsForMonth(m)
      .filter(e => e.priority === "core")
      .map(e => ({ date: `${y}-${String(m).padStart(2, "0")}-${String(e.day).padStart(2, "0")}`, title: e.title, desc: e.desc }));
  });

  return (
    <div className="flex flex-col h-full">
      <DiaryView
        view={view}
        anchor={anchor}
        today={today}
        days={days}
        schedules={schedules}
        tasks={tasks}
        memos={memos}
        members={members}
        taxEvents={taxEvents}
        me={{ id: session.id, name: session.name, canOffice }}
      />
    </div>
  );
}
