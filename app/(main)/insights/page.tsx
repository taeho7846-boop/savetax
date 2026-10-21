import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getClientInsights } from "@/lib/insights";
import { kstToday } from "@/lib/bookkeeping";
import { InsightsTable } from "./InsightsTable";

/**
 * 거래처 인사이트 — 내 범위 거래처 전체를 한 표로. 1차: 성실신고확인대상 달성률.
 * 데이터는 lib/insights.getClientInsights (세모리포트 월별 매출·매입 + 급여대장 인건비, 지난달까지 누적).
 */
export default async function InsightsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getClientInsights(session, kstToday());
  return (
    <div className="mx-auto max-w-[1900px] py-5">
      <InsightsTable data={data} canEdit={session.role !== "readonly"} />
    </div>
  );
}
