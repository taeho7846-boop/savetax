import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTaehoDistributionData, getTaehoExcludedData } from "@/app/actions/distribution-taeho";
import { TaehoDistributionBoard } from "./TaehoDistributionBoard";

export default async function TaehoDistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const tab = params.tab || "individual";

  if (tab === "excluded") {
    const data = await getTaehoExcludedData();
    return (
      <div className="flex flex-col h-full">
        <h1 className="text-xl font-bold text-gray-800 mb-6">세무회계태호 배분</h1>
        <TaehoDistributionBoard
          tab={tab}
          accountants={data.accountants}
          distributions={data.distributions}
          counts={{}}
          passUserIds={[]}
        />
      </div>
    );
  }

  const data = await getTaehoDistributionData(tab);

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-xl font-bold text-gray-800 mb-6">세무회계태호 배분</h1>
      <TaehoDistributionBoard
        tab={tab}
        accountants={data.accountants}
        distributions={data.distributions}
        counts={data.counts}
        passUserIds={data.passUserIds}
      />
    </div>
  );
}
