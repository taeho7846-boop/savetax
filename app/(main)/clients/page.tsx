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
      <div className="flex items-start justify-between mb-6 gap-4">
        <h1 className="text-[24px] font-bold text-[#191F28] tracking-tight shrink-0">고객사 관리</h1>

        <div className="flex items-center gap-4 flex-wrap justify-end">
          {/* 인건비 분류 범례 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-[#8B95A1] mr-0.5">인건비 분류</span>
            {Object.entries(LABOR_TYPE_STYLES).map(([key, s]) => (
              <span
                key={key}
                className={`inline-flex items-center justify-center border ${s.border} ${s.text} ${s.bg} rounded-md px-1.5 py-0.5 text-xs font-medium`}
              >
                {key}
              </span>
            ))}
          </div>

          <a
            href="/api/clients/alimtalk-excel"
            className="bg-[#FEF3C7] text-[#92400e] text-[13px] font-bold px-4 py-2 rounded-[10px] hover:bg-[#FDE68A] transition-colors"
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

      {/* 전체/개인/법인 — Toss pill 탭 */}
      <div className="inline-flex gap-0.5 mb-4 p-1 bg-[#F2F4F6] rounded-[12px]">
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
              className={`px-4 py-1.5 text-[13px] rounded-[10px] transition-all ${
                active
                  ? "bg-white text-[#191F28] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  : "text-[#6B7684] hover:text-[#191F28] font-[500]"
              }`}
            >
              {tab.label} <span className={`ml-1 text-[11px] ${active ? "text-[#6B7684]" : "text-[#8B95A1]"}`}>{tab.count}</span>
            </a>
          );
        })}
      </div>

      {/* 검색/필터 */}
      <form className="flex gap-3 mb-5">
        <input type="hidden" name="type" value={clientType} />
        <input
          name="q"
          defaultValue={q}
          placeholder="고객사명, 대표자명, 사업자번호 검색"
          autoComplete="off"
          className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm text-[#191F28] flex-1 focus:outline-none focus:border-[#3182F6]"
        />
        <button
          type="submit"
          className="bg-[#3182F6] text-white text-[13px] font-bold px-5 py-2 rounded-[10px] hover:bg-[#1B64DA] transition-colors"
        >
          검색
        </button>
      </form>

      <ClientsTable clients={clients} readonly={isReadonly} showAssignedUser={isReadonly || isManager} />
    </div>
  );
}
