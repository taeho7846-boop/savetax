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
      <div className="mb-6">
        <h1 className="text-[24px] font-bold text-[#191F28] tracking-tight">신규수임 관리</h1>
        <p className="text-xs text-[#8B95A1] mt-0.5">
          수임 프로세스 전체 현황 — 해피콜 · 서류수집 · 홈택스수임 · 위하고 · EDI
        </p>
      </div>

      <CommissionBoard
        commissions={commissions}
        completed={completed}
        availableClients={availableClients}
      />
    </div>
  );
}
