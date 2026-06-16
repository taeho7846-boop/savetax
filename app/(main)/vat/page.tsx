import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { VatTable } from "./VatTable";

const PERIOD_TYPES = [
  { key: "1-예정", label: "1기 예정", sub: "4월" },
  { key: "1-확정", label: "1기 확정", sub: "7월" },
  { key: "2-예정", label: "2기 예정", sub: "10월" },
  { key: "2-확정", label: "2기 확정", sub: "익년 1월" },
];

export default async function VatPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; period?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year) : now.getFullYear();
  const periodType = PERIOD_TYPES.some(p => p.key === params.period) ? params.period! : "1-확정";
  const period = `${year}-${periodType}`;
  const activeTab = params.tab === "single" ? "single" : "bookkeeping";

  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map(e => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  // 기장: 신고대리가 아닌 거래처 / 신고대리: 신고대리 거래처
  const taxTypeFilter =
    activeTab === "single"
      ? { taxTypes: { contains: "신고대리" } }
      : {
          OR: [
            { taxTypes: null },
            { NOT: { taxTypes: { contains: "신고대리" } } },
          ],
        };

  const rawClients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      contractStatus: "active",
      ...assignedFilter,
      ...taxTypeFilter,
      // 부가세 비대상 제외 (면세·프리랜서·폐업). 미지정(null)은 포함
      NOT: { taxationType: { in: ["면세", "프리랜서", "폐업"] } },
    },
    select: {
      id: true,
      name: true,
      ceoName: true,
      clientType: true,
      taxationType: true,
      assignedUser: isManager ? { select: { name: true } } : undefined,
      vatRecords: {
        where: { period },
        select: {
          stage: true,
          checklist: true,
          fee: true,
          excluded: true,
          memo: true,
        },
      },
    },
    orderBy: [{ ceoName: "asc" }, { name: "asc" }],
  });

  const clients = rawClients.map(({ assignedUser, vatRecords, ...c }) => ({
    ...c,
    assignedUserName: assignedUser?.name ?? null,
    record: vatRecords[0] ?? null,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">VAT</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight mt-1 flex items-baseline gap-2">
            부가가치세
            <span className="text-[18px] font-bold text-[#3182F6]">{year}년 {PERIOD_TYPES.find(p => p.key === periodType)?.label}</span>
          </h1>
          <div className="text-[12px] text-[#6B7684] mt-1">예정·확정 신고 진행관리 · 기장/신고대리 통합</div>
        </div>
      </div>

      {/* 연도 + 기간(1기예정~2기확정) */}
      <div className="glass rounded-3xl p-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 glass-strong rounded-2xl px-1 h-10">
          <Link href={`/vat?year=${year - 1}&period=${periodType}&tab=${activeTab}`} className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">◀</Link>
          <span className="text-[13px] font-bold text-[#191F28] min-w-[56px] text-center">{year}년</span>
          <Link href={`/vat?year=${year + 1}&period=${periodType}&tab=${activeTab}`} className="w-8 h-8 rounded-xl text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">▶</Link>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PERIOD_TYPES.map(p => (
            <Link
              key={p.key}
              href={`/vat?year=${year}&period=${p.key}&tab=${activeTab}`}
              className={`rounded-2xl px-4 py-2 text-[13px] font-bold transition flex items-center gap-1.5 ${
                periodType === p.key ? "text-white bg-[#3182F6]" : "glass-strong text-[#6B7684] hover:text-[#191F28]"
              }`}
            >
              {p.label}
              <span className={`text-[11px] font-medium ${periodType === p.key ? "text-white/70" : "text-[#B0B8C1]"}`}>{p.sub}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* 기장 / 신고대리 서브탭 */}
      <div className="flex gap-2 mb-4">
        <Link
          href={`/vat?year=${year}&period=${periodType}&tab=bookkeeping`}
          className={`rounded-2xl px-5 py-2.5 text-[13px] font-bold transition ${
            activeTab === "bookkeeping" ? "text-white bg-[#191F28]" : "glass-strong text-[#6B7684] hover:text-[#191F28]"
          }`}
        >
          기장
        </Link>
        <Link
          href={`/vat?year=${year}&period=${periodType}&tab=single`}
          className={`rounded-2xl px-5 py-2.5 text-[13px] font-bold transition ${
            activeTab === "single" ? "text-white bg-[#191F28]" : "glass-strong text-[#6B7684] hover:text-[#191F28]"
          }`}
        >
          신고대리
        </Link>
      </div>

      <VatTable
        clients={clients}
        period={period}
        activeTab={activeTab}
        showAssignedUser={isManager}
      />
    </div>
  );
}
