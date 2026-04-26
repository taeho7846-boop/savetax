import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDistributionData, getExcludedData } from "@/app/actions/distribution";
import { DistributionBoard } from "./DistributionBoard";

export default async function DistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const tab = params.tab || "individual";

  if (tab === "excluded") {
    const data = await getExcludedData();
    return (
      <div className="flex flex-col h-full">
        <div className="mb-5">
          <div className="text-[12.5px] text-[#86868b] font-medium">신규 거래처 배분</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">Savetax 배분</h1>
        </div>
        <DistributionBoard
          tab={tab}
          accountants={data.accountants}
          distributions={data.distributions}
          counts={{}}
          passUserIds={[]}
        />
      </div>
    );
  }

  const data = await getDistributionData(tab);

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-[24px] font-bold text-[#191F28] tracking-tight mb-6">세이브택스 배분</h1>
      <DistributionBoard
        tab={tab}
        accountants={data.accountants}
        distributions={data.distributions}
        counts={data.counts}
        passUserIds={data.passUserIds}
      />
    </div>
  );
}
