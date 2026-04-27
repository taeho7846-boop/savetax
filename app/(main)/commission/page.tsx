import {
  getCommissions,
  getCompletedCommissions,
  getClientsNotInCommission,
} from "@/app/actions/commission";
import CommissionBoard from "./CommissionBoard";

export default async function CommissionPage() {
  const [commissions, completed, availableClients] = await Promise.all([
    getCommissions(),
    getCompletedCommissions(),
    getClientsNotInCommission(),
  ]);

  return (
    <div>
      <div className="mb-5">
        <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">ONBOARDING</div>
        <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight mt-1">
          신규수임 관리
        </h1>
        <p className="text-[12px] text-[#6B7684] mt-1">해피콜 · 서류수집 · 홈택스수임 · 위하고 · EDI</p>
      </div>

      <CommissionBoard
        commissions={commissions}
        completed={completed}
        availableClients={availableClients}
      />
    </div>
  );
}
