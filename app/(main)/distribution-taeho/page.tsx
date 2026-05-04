import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTaehoDistributionData, getTaehoExcludedData, getUnassignedFromSavetax } from "@/app/actions/distribution-taeho";
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
      <div>
        <div className="mb-5">
          <div className="text-[12.5px] text-[#86868b] font-medium">세무회계태호 별도 사무소</div>
          <h1 className="text-[26px] font-bold tracking-tight"><span className="bg-gradient-to-r from-[#A855F7] to-[#6D28D9] bg-clip-text text-transparent">세무회계태호 배분</span></h1>
        </div>
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

  const [data, unassigned] = await Promise.all([
    getTaehoDistributionData(tab),
    getUnassignedFromSavetax(tab),
  ]);

  return (
    <div>
      <h1 className="text-[24px] font-bold text-[#191F28] tracking-tight mb-6">세무회계태호 배분</h1>
      <TaehoDistributionBoard
        tab={tab}
        accountants={data.accountants}
        distributions={data.distributions}
        counts={data.counts}
        passUserIds={data.passUserIds}
        unassignedFromSavetax={unassigned}
      />
    </div>
  );
}
