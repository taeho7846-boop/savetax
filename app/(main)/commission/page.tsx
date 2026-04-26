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
        <div className="text-[12.5px] text-[#86868b] font-medium">수임 프로세스 전체 현황</div>
        <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">신규수임 관리</h1>
        <p className="text-[11.5px] text-[#8B95A1] mt-1">해피콜 · 서류수집 · 홈택스수임 · 위하고 · EDI</p>
      </div>

      <CommissionBoard
        commissions={commissions}
        completed={completed}
        availableClients={availableClients}
      />
    </div>
  );
}
