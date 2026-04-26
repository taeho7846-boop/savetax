import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientsTable } from "./ClientsTable";
import { ClientCreateButton } from "./ClientCreateModal";
import { BulkUploadButton, BulkUpdateButton } from "./BulkUploadModal";
import { TrashBinButton } from "./TrashBin";

const LABOR_TYPE_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "1인사업자": { border: "border-[#A3CAFD]", text: "text-[#3182F6]", bg: "bg-[#F5F9FF]" },
  "근로소득": { border: "border-[#FECACA]", text: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
  "사업소득": { border: "border-[#A3CAFD]", text: "text-[#3182F6]", bg: "bg-[#F5F9FF]" },
  "일용직":   { border: "border-[#BBF7D0]", text: "text-[#15803D]", bg: "bg-[#F1FBF4]" },
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const q = params.q || "";
  const clientType = params.type || "all"; // "all" | "individual" | "corporate"
  const isReadonly = session.role === "readonly";
  const isManager = session.role === "accountant" || session.role === "admin";

  // 세무사/관리자: 본인 + 소속 직원의 거래처
  let assignedFilter: any = { assignedUserId: session.id };
  if (isReadonly) {
    assignedFilter = { affiliation: "세이브택스" };
  } else if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map(e => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      ...(clientType !== "all" && { clientType }),
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
      ...(q && {
        AND: {
          OR: [
            { name: { contains: q } },
            { ceoName: { contains: q } },
            { bizNumber: { contains: q } },
          ],
        },
      }),
    },
    include: (isReadonly || isManager) ? { assignedUser: { select: { name: true } } } : undefined,
    orderBy: { name: "asc" },
  });

  const baseWhere = {
    isDeleted: false,
    ...assignedFilter,
    OR: [
      { taxTypes: null },
      { NOT: { taxTypes: { contains: "신고대리" } } },
    ],
  };

  const [totalCount, individualCount, corporateCount, trashCount] = await Promise.all([
    prisma.client.count({ where: baseWhere }),
    prisma.client.count({ where: { ...baseWhere, clientType: "individual" } }),
    prisma.client.count({ where: { ...baseWhere, clientType: "corporate" } }),
    isReadonly ? Promise.resolve(0) : prisma.client.count({
      where: { isDeleted: true, assignedUserId: session.id },
    }),
  ]);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">고객사 관리</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">거래처 {totalCount.toLocaleString()}곳</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <a
            href="/api/clients/alimtalk-excel"
            className="glass px-4 h-10 rounded-2xl text-[13px] font-bold text-[#92400e] hover:bg-[#FEF3C7] transition-colors flex items-center"
          >
            알림톡
          </a>
          {!isReadonly && (
            <>
              <TrashBinButton count={trashCount} />
              <BulkUpdateButton />
              <BulkUploadButton />
              <ClientCreateButton />
            </>
          )}
        </div>
      </div>

      {/* 검색 + 탭 + 범례 — 하나의 글래스 카드로 */}
      <div className="glass rounded-3xl p-4 mb-4">
        {/* 검색 */}
        <form className="flex gap-2 mb-3">
          <input type="hidden" name="type" value={clientType} />
          <div className="flex-1 bg-white/80 rounded-2xl flex items-center gap-2 px-4 h-11">
            <svg width="16" height="16" fill="none" stroke="#6B7684" strokeWidth="2.2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              name="q"
              defaultValue={q}
              placeholder="고객사명, 대표자명, 사업자번호 검색"
              autoComplete="off"
              className="flex-1 bg-transparent outline-none text-[14px] text-[#191F28] placeholder:text-[#8B95A1]"
            />
          </div>
          <button
            type="submit"
            className="bg-[#3182F6] text-white text-[13px] font-bold px-5 h-11 rounded-2xl hover:bg-[#1B64DA] transition-colors shadow-md shadow-[#3182F6]/20"
          >
            검색
          </button>
        </form>

        {/* 전체/개인/법인 + 인건비 범례 */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "all", label: "전체", count: totalCount },
            { key: "individual", label: "개인", count: individualCount },
            { key: "corporate", label: "법인", count: corporateCount },
          ].map(tab => {
            const active = clientType === tab.key;
            return (
              <a
                key={tab.key}
                href={`/clients?type=${tab.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition ${
                  active
                    ? "bg-[#3182F6] text-white shadow-md shadow-[#3182F6]/20"
                    : "bg-white/70 text-[#6B7684] hover:text-[#191F28] hover:bg-white"
                }`}
              >
                {tab.label} {tab.count.toLocaleString()}
              </a>
            );
          })}
          <div className="w-px h-6 bg-[#E5E8EB] mx-1" />
          <span className="text-[11px] font-medium text-[#8B95A1] mr-0.5">인건비</span>
          {Object.entries(LABOR_TYPE_STYLES).map(([key, s]) => (
            <span
              key={key}
              className={`inline-flex items-center justify-center border ${s.border} ${s.text} ${s.bg} rounded-md px-1.5 py-0.5 text-[11px] font-medium`}
            >
              {key}
            </span>
          ))}
        </div>
      </div>

      <ClientsTable clients={clients} readonly={isReadonly} showAssignedUser={isReadonly || isManager} />
    </div>
  );
}
