import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getStaffList } from "@/app/actions/staff";
import StaffTable from "./StaffTable";

export default async function StaffPage() {
  const session = await getSession();
  if (!session || (session.role !== "owner" && session.role !== "admin")) {
    redirect("/dashboard");
  }

  const staffList = await getStaffList();

  // 역할별 카운트 (stat 카드용) — 활성 계정만
  const activeStaff = staffList.filter(s => s.isActive);
  const roleCount = {
    owner: activeStaff.filter(s => s.role === "owner" || s.role === "admin").length,
    accountant: activeStaff.filter(s => s.role === "accountant").length,
    employee: activeStaff.filter(s => s.role === "employee").length,
    readonly: activeStaff.filter(s => s.role === "readonly").length,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium flex items-center gap-1.5">
            <span className="live-dot" />
            {activeStaff.length}명 활성 사용자
          </div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">직원 관리</h1>
        </div>
      </div>

      {/* 4 stat 카드 + 미니 바 차트 */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StaffStatCard label="대표/관리자" count={roleCount.owner} color="#3182F6" />
        <StaffStatCard label="세무사" count={roleCount.accountant} color="#10B981" />
        <StaffStatCard label="직원" count={roleCount.employee} color="#A855F7" />
        <StaffStatCard label="조회전용" count={roleCount.readonly} color="#8B95A1" />
      </div>

      <StaffTable staffList={staffList} currentUserId={session.id} />
    </div>
  );
}

function StaffStatCard({ label, count, color }: { label: string; count: number; color: string }) {
  // 인원 수만큼 막대 (최대 8개 표시)
  const bars = Math.min(count, 8);
  const heights = [100, 80, 60, 90, 70, 85, 65, 75]; // 시각적 다양성용
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-[11px] font-medium text-[#8B95A1] mb-1">{label}</div>
      <div className="flex items-end justify-between">
        <div className="text-[22px] font-bold leading-none tracking-tight">{count}</div>
        {count > 0 && (
          <div className="flex items-end gap-0.5 h-5">
            {Array.from({ length: bars }).map((_, i) => (
              <div key={i} className="w-1 rounded-sm" style={{ backgroundColor: color, height: `${heights[i % heights.length]}%` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
