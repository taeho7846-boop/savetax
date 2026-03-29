import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function IncomeTaxPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">종합소득세</h1>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 text-sm">준비 중입니다</p>
      </div>
    </div>
  );
}
