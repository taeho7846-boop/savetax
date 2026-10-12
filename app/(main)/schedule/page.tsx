import { redirect } from "next/navigation";

// 스케쥴 페이지는 다이어리로 통합됨
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const params = await searchParams;
  if (params.ym && /^\d{4}-\d{2}$/.test(params.ym)) {
    redirect(`/diary?view=month&d=${params.ym}-01`);
  }
  redirect("/diary");
}
