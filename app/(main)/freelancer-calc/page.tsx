import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FreelancerCalcBoard } from "./FreelancerCalcBoard";

export default async function FreelancerCalcPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col h-full">
      <FreelancerCalcBoard />
    </div>
  );
}
