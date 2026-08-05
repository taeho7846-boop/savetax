import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClientsTable } from "./ClientsTable";
import { ClientCreateButton } from "./ClientCreateModal";
import { BulkUploadButton, BulkUpdateButton } from "./BulkUploadModal";
import { TransferButton } from "./TransferModal";
import { TrashBinButton } from "./TrashBin";
import { TerminatedBinButton } from "./TerminatedBin";
import { MissingInfoCards } from "./MissingInfoCards";

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
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";

  // 직원: 본인이 사수(담당)이거나 부사수(서브)인 거래처
  // 세무사/관리자: 본인 + 소속 직원의 거래처
  let assignedFilter: any = { OR: [{ assignedUserId: session.id }, { subAssignedUserId: session.id }] };
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

  // 기장대리 목록 공통 조건: 신고대리 전용 거래처 제외
  const notReportOnly = { OR: [{ taxTypes: null }, { NOT: { taxTypes: { contains: "신고대리" } } }] };

  // 목록 공통 필터 (검색/탭 포함). 계약상태(active/해지)는 아래에서 분리 적용
  const listWhere: any = {
    isDeleted: false,
    ...(clientType !== "all" && { clientType }),
    AND: [
      assignedFilter,
      notReportOnly,
      ...(q ? [{
        OR: [
          { name: { contains: q } },
          { ceoName: { contains: q } },
          { bizNumber: { contains: q } },
        ],
      }] : []),
    ],
  };
  const includeAssigned = (isReadonly || isManager) ? { assignedUser: { select: { name: true } } } : undefined;

  // 메인 목록·집계는 활성(계약중)만. 해지(계약종료)는 우측 상단 '해지거래처' 버튼에서 조회.
  const clients = await prisma.client.findMany({
    where: { ...listWhere, contractStatus: "active" },
    include: includeAssigned,
    orderBy: { name: "asc" },
  });

  // KPI/카운트는 활성 거래처만 집계 (해지 제외)
  const baseWhere = {
    isDeleted: false,
    contractStatus: "active",
    AND: [assignedFilter, notReportOnly],
  };
  // 해지거래처 버튼 배지용 카운트 (검색/탭과 무관하게 전체)
  const terminatedWhere = {
    isDeleted: false,
    contractStatus: { not: "active" },
    AND: [assignedFilter, notReportOnly],
  };

  const [totalCount, individualCount, corporateCount, trashCount, terminatedCount] = await Promise.all([
    prisma.client.count({ where: baseWhere }),
    prisma.client.count({ where: { ...baseWhere, clientType: "individual" } }),
    prisma.client.count({ where: { ...baseWhere, clientType: "corporate" } }),
    isReadonly ? Promise.resolve(0) : prisma.client.count({
      where: { isDeleted: true, assignedUserId: session.id },
    }),
    isReadonly ? Promise.resolve(0) : prisma.client.count({ where: terminatedWhere }),
  ]);

  // KPI 계산
  const monthlyFeeSum = clients.reduce((s, c) => s + (c.monthlyFee ?? 0), 0);
  // CMS 등록 상태: "done" = 등록 / "pending" = 등록요청중 / 그 외 = 미등록
  // 카드/모달엔 (등록요청중 + 미등록) 모두 노출
  const noCmsClients = clients.filter(c => c.cmsStatus !== "done");
  const noDocsClients = clients.filter(c => !c.hometaxId || !c.hometaxPw);
  const noCmsCount = noCmsClients.length;
  const noDocsCount = noDocsClients.length;
  const cmsPendingCount = noCmsClients.filter(c => c.cmsStatus === "pending").length;
  const cmsNoneCount = noCmsCount - cmsPendingCount;

  // 급한 순서대로 정렬: 최초출금월 빠른 순(과거→미래), 미설정은 맨 아래
  // 같은 월이면 미등록(none)이 등록요청중(pending)보다 위
  const statusOrder = (s: string) => (s === "pending" ? 1 : 0);
  const noCmsList = noCmsClients
    .map(c => ({
      id: c.id,
      name: c.name,
      ceoName: c.ceoName,
      clientType: c.clientType,
      cmsStatus: (c.cmsStatus === "pending" ? "pending" : "none") as "pending" | "none",
      firstWithdrawalMonth: c.firstWithdrawalMonth ?? null,
    }))
    .sort((a, b) => {
      const aKey = a.firstWithdrawalMonth || "9999-99";
      const bKey = b.firstWithdrawalMonth || "9999-99";
      const cmp = aKey.localeCompare(bKey);
      if (cmp !== 0) return cmp;
      return statusOrder(a.cmsStatus) - statusOrder(b.cmsStatus);
    });
  const noDocsList = noDocsClients.map(c => ({ id: c.id, name: c.name, ceoName: c.ceoName, clientType: c.clientType }));

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <div className="text-[11px] text-[#8B95A1] font-bold tracking-widest uppercase">CLIENTS</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight mt-1 flex items-baseline gap-2">
            거래처
            <span className="text-[#3182F6]">{totalCount.toLocaleString()}</span>
            <span className="text-[16px] text-[#6B7684] font-medium">곳</span>
          </h1>
          <div className="text-[12px] text-[#6B7684] mt-1">개인 {individualCount.toLocaleString()} · 법인 {corporateCount.toLocaleString()}</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <a
            href="/api/clients/alimtalk-excel"
            className="glass px-4 h-10 rounded-2xl text-[13px] font-bold text-[#92400e] hover:bg-[#FEF3C7] transition-colors flex items-center stat-card"
          >
            📨 알림톡
          </a>
          {!isReadonly && (
            <>
              <TerminatedBinButton count={terminatedCount} />
              <TrashBinButton count={trashCount} />
              {(session.role === "owner" || session.role === "admin") && <TransferButton />}
              <BulkUpdateButton />
              <BulkUploadButton />
              <ClientCreateButton />
            </>
          )}
        </div>
      </div>

      {/* KPI 4-up */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="stat-card glass rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute left-0 top-5 bottom-5 w-1 bg-[#3182F6] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] tracking-wide uppercase pl-2">전체 거래처</div>
          <div className="text-[26px] font-extrabold text-[#191F28] mt-1.5 leading-none pl-2">{totalCount.toLocaleString()}</div>
          <div className="text-[11px] text-[#8B95A1] mt-1.5 pl-2">개인 {individualCount} · 법인 {corporateCount}</div>
        </div>
        <div className="stat-card glass rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute left-0 top-5 bottom-5 w-1 bg-[#15803D] rounded-r" />
          <div className="text-[11px] font-bold text-[#8B95A1] tracking-wide uppercase pl-2">월 기장료 합계</div>
          <div className="text-[26px] font-extrabold text-[#191F28] mt-1.5 leading-none pl-2 tabular-nums">
            {monthlyFeeSum.toLocaleString()}<span className="text-[14px] text-[#6B7684] font-bold ml-1">원</span>
          </div>
          <div className="text-[11px] text-[#8B95A1] mt-1.5 pl-2">
            평균 {totalCount > 0 ? Math.round(monthlyFeeSum / totalCount).toLocaleString() : 0}원 / 곳
          </div>
        </div>
        <MissingInfoCards
          totalCount={totalCount}
          noCmsCount={noCmsCount}
          noDocsCount={noDocsCount}
          cmsPendingCount={cmsPendingCount}
          cmsNoneCount={cmsNoneCount}
          noCmsList={noCmsList}
          noDocsList={noDocsList}
        />
      </div>

      {/* 검색 + 탭 + 범례 — 하나의 글래스 카드로 */}
      <div className="glass rounded-3xl p-4 mb-4">
        {/* 검색 */}
        <form className="flex gap-2 mb-3">
          <input type="hidden" name="type" value={clientType} />
          <div className="flex-1 bg-white/80 rounded-2xl flex items-center gap-3 px-4 h-12">
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
            className="bg-[#3182F6] text-white text-[13px] font-bold px-6 h-12 rounded-2xl hover:bg-[#1B64DA] transition-colors"
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
