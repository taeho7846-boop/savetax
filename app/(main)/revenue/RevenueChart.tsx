"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ClientData {
  name: string;
  monthlyFee: number | null;
  freeMonths: number | null;
  firstWithdrawalMonth: string | null;
  assignedUserId: number | null;
  assignedUser: { name: string } | null;
}

function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RevenueChart({
  clients,
  currentUserId,
}: {
  clients: ClientData[];
  currentUserId: number;
}) {
  // 24개월치 데이터 생성 (현재월 기준 -6 ~ +17)
  const now = new Date();
  const startYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months: string[] = [];
  for (let i = -6; i <= 17; i++) {
    months.push(addMonths(startYM, i));
  }

  // 본사 귀속 기간: 최초출금월부터 17개월 (무료기간 포함하여 총 17개월 본사)
  // 본인 귀속: 18개월차부터
  const chartData = months.map((ym) => {
    let hqRevenue = 0;   // 본사 귀속
    let myRevenue = 0;   // 본인 귀속

    for (const c of clients) {
      if (!c.firstWithdrawalMonth || !c.monthlyFee) continue;

      const fee = c.monthlyFee;
      const freeM = c.freeMonths ?? 0;

      // 수임 시작월 = 최초출금월에서 무료기간만큼 앞
      const startMonth = addMonths(c.firstWithdrawalMonth, -freeM);

      // 이 월이 수임 시작 이전이면 스킵
      if (ym < startMonth) continue;

      // 수임 시작으로부터 몇 개월차인지
      const [sy, sm] = startMonth.split("-").map(Number);
      const [cy, cm] = ym.split("-").map(Number);
      const monthIdx = (cy - sy) * 12 + (cm - sm); // 0-based

      if (monthIdx < freeM) {
        // 무료 기간 — 매출 없음
        continue;
      } else if (monthIdx < 17) {
        // 유료 + 본사 귀속 (무료 후 ~ 17개월차 미만)
        hqRevenue += fee;
      } else {
        // 18개월차부터 본인 귀속
        myRevenue += fee;
      }
    }

    return {
      month: ym.slice(2), // "26-04" 형식
      본사귀속: hqRevenue,
      본인귀속: myRevenue,
      합계: hqRevenue + myRevenue,
    };
  });

  // 현재 총 요약
  const currentMonth = startYM;
  const currentData = chartData.find((d) => d.month === currentMonth.slice(2));

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">이번 달 총 기장료</div>
          <div className="text-2xl font-bold text-[#1a2e4a] mt-1">
            {(currentData?.합계 ?? 0).toLocaleString()}원
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">본사 귀속</div>
          <div className="text-2xl font-bold text-blue-500 mt-1">
            {(currentData?.본사귀속 ?? 0).toLocaleString()}원
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">본인 귀속</div>
          <div className="text-2xl font-bold text-emerald-500 mt-1">
            {(currentData?.본인귀속 ?? 0).toLocaleString()}원
          </div>
        </div>
      </div>

      {/* 그래프 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-4">월별 수익추이 (본사 귀속 vs 본인 귀속)</h2>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
            />
            <Tooltip
              formatter={(value: unknown) => `${Number(value).toLocaleString()}원`}
              labelFormatter={(label) => `20${label}`}
            />
            <Legend />
            <Bar dataKey="본사귀속" stackId="a" fill="#60a5fa" radius={[0, 0, 0, 0]} />
            <Bar dataKey="본인귀속" stackId="a" fill="#34d399" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 데이터 수 안내 */}
      <div className="text-xs text-gray-400 text-right">
        세이브택스 소속 거래처 {clients.length}건 기준 (최초출금월 + 기장료 설정된 거래처만 반영)
      </div>
    </div>
  );
}
