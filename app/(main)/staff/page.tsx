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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">직원 관리</h1>
      </div>
      <StaffTable staffList={staffList} currentUserId={session.id} />
    </div>
  );
}
