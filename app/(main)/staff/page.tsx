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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">{staffList.length}명 활성 사용자</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">직원 관리</h1>
        </div>
      </div>
      <StaffTable staffList={staffList} currentUserId={session.id} />
    </div>
  );
}
