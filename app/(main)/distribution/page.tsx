import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DistributionTabs } from "./DistributionTabs";

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const tab = params.tab || "corporate";

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-xl font-bold text-gray-800 mb-6">세이브택스 배분</h1>
      <DistributionTabs tab={tab} />
    </div>
  );
}
