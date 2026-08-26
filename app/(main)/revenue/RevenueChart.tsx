"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ClientData {
  name: string;
  monthlyFee: number | null;
  freeMonths: number | null;
  firstWithdrawalMonth: string | null;
  affiliation: string | null;
  contractStatus: string;
  terminationMonth: string | null;
  assignedUserId: number | null;
  assignedUser: { name: string } | null;
}

function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RevenueChart({ clients }: { clients: ClientData[] }) {
  // 2026-01부터 36개월치
  const now = new Date();
  const startYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months: string[] = [];
  const fromYM = "2026-01";
  for (let i = 0; i < 36; i++) {
    months.push(addMonths(fromYM, i));
  }

  // 세이브택스: 무료기간 → 본사 귀속 17개월 → 18개월차부터 본인 귀속
  // 세무회계태호 등 기타: 최초출금월부터 바로 본인 귀속
  const chartData = months.map((ym) => {
    let hqRevenue = 0;   // 본사 귀속
    let myRevenue = 0;   // 본인 귀속

    for (const c of clients) {
      if (!c.firstWithdrawalMonth || !c.monthlyFee) continue;

      // 해지 거래처는 해지월(마지막 청구월)까지만 매출 반영 — 미래로 계속 잡히지 않게
      if (c.contractStatus !== "active" && ym > (c.terminationMonth ?? startYM)) continue;

      const fee = c.monthlyFee;
      const freeM = c.freeMonths ?? 0;
      const isSavetax = c.affiliation === "세이브택스";

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
      } else if (!isSavetax) {
        // 세이브택스 외(세무회계태호 등): 바로 본인 귀속
        myRevenue += fee;
      } else if (monthIdx < 17) {
        // 세이브택스: 유료 + 본사 귀속
        hqRevenue += fee;
      } else {
        // 세이브택스: 18개월차부터 본인 귀속
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
        <div className="bg-white rounded-[14px] p-5 border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="text-[13px] text-[#6B7684] font-[500]">이번 달 총 기장료</div>
          <div className="text-[28px] font-bold text-[#191F28] mt-2 tracking-tight">
            {(currentData?.합계 ?? 0).toLocaleString()}<span className="text-[18px] ml-0.5 text-[#4E5968]">원</span>
          </div>
        </div>
        <div className="bg-white rounded-[14px] p-5 border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="text-[13px] text-[#6B7684] font-[500]">본사 귀속</div>
          <div className="text-[28px] font-bold text-[#3182F6] mt-2 tracking-tight">
            {(currentData?.본사귀속 ?? 0).toLocaleString()}<span className="text-[18px] ml-0.5 text-[#6FABF9]">원</span>
          </div>
        </div>
        <div className="bg-white rounded-[14px] p-5 border border-[#F2F4F6] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="text-[13px] text-[#6B7684] font-[500]">본인 귀속</div>
          <div className="text-[28px] font-bold text-[#16A865] mt-2 tracking-tight">
            {(currentData?.본인귀속 ?? 0).toLocaleString()}<span className="text-[18px] ml-0.5 text-[#4ADE80]">원</span>
          </div>
        </div>
      </div>

      {/* 그래프 */}
      <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] p-5">
        <h2 className="text-sm font-medium text-[#333D4B] mb-4">월별 수익추이 (본사 귀속 vs 본인 귀속)</h2>
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

      {/* 이번 달 본인 귀속 거래처 상세 */}
      {(() => {
        const now = startYM;
        const details: { name: string; affiliation: string; fee: number; status: string; startMonth: string; monthIdx: number }[] = [];

        for (const c of clients) {
          if (!c.firstWithdrawalMonth || !c.monthlyFee) continue;
          // 해지월이 지난 거래처는 이번 달 귀속 표에서 제외
          if (c.contractStatus !== "active" && now > (c.terminationMonth ?? now)) continue;
          const fee = c.monthlyFee;
          const freeM = c.freeMonths ?? 0;
          const isSavetax = c.affiliation === "세이브택스";
          const start = addMonths(c.firstWithdrawalMonth, -freeM);
          if (now < start) continue;

          const [sy, sm] = start.split("-").map(Number);
          const [cy, cm] = now.split("-").map(Number);
          const monthIdx = (cy - sy) * 12 + (cm - sm);

          let status = "";
          if (monthIdx < freeM) {
            status = "무료";
          } else if (!isSavetax) {
            status = "본인 귀속";
          } else if (monthIdx < 17) {
            status = "본사 귀속";
          } else {
            status = "본인 귀속";
          }

          details.push({
            name: c.name,
            affiliation: c.affiliation || "-",
            fee,
            status,
            startMonth: start,
            monthIdx: monthIdx + 1,
          });
        }

        details.sort((a, b) => a.status.localeCompare(b.status) || a.affiliation.localeCompare(b.affiliation));

        const myTotal = details.filter(d => d.status === "본인 귀속").reduce((s, d) => s + d.fee, 0);
        const hqTotal = details.filter(d => d.status === "본사 귀속").reduce((s, d) => s + d.fee, 0);

        return (
          <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#F2F4F6]">
              <h2 className="font-medium text-[#333D4B]">이번 달 거래처별 귀속 현황</h2>
            </div>
            <div className="overflow-y-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="bg-[#F9FAFB] border-b border-[#F2F4F6] sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-[#4E5968] font-medium">거래처명</th>
                    <th className="text-center px-4 py-2 text-[#4E5968] font-medium">소속</th>
                    <th className="text-center px-4 py-2 text-[#4E5968] font-medium">월 기장료</th>
                    <th className="text-center px-4 py-2 text-[#4E5968] font-medium">수임 개월</th>
                    <th className="text-center px-4 py-2 text-[#4E5968] font-medium">귀속</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2F4F6]">
                  {details.map((d, i) => (
                    <tr key={i} className="hover:bg-[#F9FAFB]">
                      <td className="px-4 py-2 text-[#191F28]">{d.name}</td>
                      <td className="px-4 py-2 text-center text-xs">
                        {d.affiliation === "세이브택스" ? (
                          <span className="text-[#3182F6] font-medium">세이브택스</span>
                        ) : (
                          <span className="text-[#4E5968]">{d.affiliation}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-[#333D4B]">{d.fee.toLocaleString()}원</td>
                      <td className="px-4 py-2 text-center text-[#6B7684]">{d.monthIdx}개월차</td>
                      <td className="px-4 py-2 text-center">
                        {d.status === "본인 귀속" ? (
                          <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-0.5 rounded-full">본인 귀속</span>
                        ) : d.status === "본사 귀속" ? (
                          <span className="text-[#3182F6] font-medium text-xs bg-[#F5F9FF] px-2 py-0.5 rounded-full">본사 귀속</span>
                        ) : (
                          <span className="text-[#8B95A1] text-xs bg-[#F9FAFB] px-2 py-0.5 rounded-full">무료</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#F9FAFB] border-t border-[#E5E8EB]">
                  <tr>
                    <td className="px-4 py-2 font-medium text-[#333D4B]">합계</td>
                    <td></td>
                    <td className="px-4 py-2 text-center font-medium text-[#333D4B]">{(myTotal + hqTotal).toLocaleString()}원</td>
                    <td></td>
                    <td className="px-4 py-2 text-center text-xs">
                      <span className="text-emerald-600 font-medium">본인 {myTotal.toLocaleString()}원</span>
                      {" / "}
                      <span className="text-[#3182F6] font-medium">본사 {hqTotal.toLocaleString()}원</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

      {/* 데이터 수 안내 */}
      <div className="text-xs text-[#8B95A1] text-right pb-4">
        거래처 {clients.length}건 기준 (최초출금월 + 기장료 설정된 거래처만 반영)
      </div>
    </div>
  );
}
