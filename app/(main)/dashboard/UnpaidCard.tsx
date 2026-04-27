import Link from "next/link";

type UnpaidClient = {
  id: number;
  name: string;
  phone: string | null;
  monthlyFee: number;
  affiliation: string | null;
  unpaidMonths: string[];
  totalUnpaid: number;
  postponedUntil: string | null;
  postponeNote: string | null;
  cmsStatus: string;
};

export function UnpaidCard({ clients }: { clients: UnpaidClient[] }) {
  const active = clients.filter((c) => !c.postponedUntil);
  const totalAmount = active.reduce((s, c) => s + c.totalUnpaid, 0);
  const display = active.slice(0, 14);
  const remaining = active.length - display.length;

  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[18px] font-bold tracking-tight text-[#191F28]">미수납</h2>
          {active.length > 0 && (
            <span className="text-[12px] text-[#6B7684] bg-white/60 px-2 py-0.5 rounded-full font-medium">
              {active.length}건
            </span>
          )}
          {totalAmount > 0 && (
            <span className="text-[13px] text-[#DC2626] font-bold tabular-nums">
              {totalAmount.toLocaleString()}원
            </span>
          )}
        </div>
        <Link href="/receivables" className="text-[13px] text-[#3182F6] font-semibold hover:text-[#1B64DA]">
          자세히 →
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-[14px] text-[#4E5968] font-[500]">미수납 거래처가 없습니다</div>
          <div className="text-[12px] text-[#8B95A1] mt-1">깔끔하네요</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {display.map((client) => (
              <Link
                key={client.id}
                href="/receivables"
                className="bg-white/60 hover:bg-white/80 rounded-2xl p-3 transition-colors block"
              >
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <div className="text-[13px] font-semibold text-[#191F28] truncate">
                    {client.name}
                  </div>
                  {client.cmsStatus === "none" && (
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] shrink-0">
                      CMS
                    </span>
                  )}
                </div>
                <div className="text-[14px] font-bold text-[#D97706] tabular-nums">
                  {client.totalUnpaid.toLocaleString()}원
                </div>
                <div className="text-[10.5px] text-[#6B7684] mt-0.5 truncate">
                  {client.unpaidMonths.map((m) => `${parseInt(m.split("-")[1])}월`).join(", ")}
                </div>
              </Link>
            ))}
          </div>
          {remaining > 0 && (
            <Link
              href="/receivables"
              className="block mt-3 text-center text-[12px] text-[#6B7684] hover:text-[#3182F6] font-[500]"
            >
              +{remaining}건 더 보기 →
            </Link>
          )}
        </>
      )}
    </section>
  );
}
