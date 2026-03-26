import { prisma } from "@/lib/prisma";
import { ClientsTable } from "./ClientsTable";
import { ClientCreateButton } from "./ClientCreateModal";

const LABOR_TYPE_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "근로소득": { border: "border-red-400",   text: "text-red-600",   bg: "bg-red-50"   },
  "사업소득": { border: "border-blue-400",  text: "text-blue-600",  bg: "bg-blue-50"  },
  "일용직":   { border: "border-green-500", text: "text-green-700", bg: "bg-green-50" },
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q || "";
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
      ...(q && {
        OR: [
          { name: { contains: q } },
          { ceoName: { contains: q } },
          { bizNumber: { contains: q } },
        ],
      }),
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold text-gray-900 shrink-0">고객사 관리</h1>

        <div className="flex items-center gap-4 flex-wrap justify-end">
          {/* 인건비 분류 범례 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-gray-400 mr-0.5">인건비 분류</span>
            {Object.entries(LABOR_TYPE_STYLES).map(([key, s]) => (
              <span
                key={key}
                className={`inline-flex items-center justify-center border ${s.border} ${s.text} ${s.bg} rounded-md px-1.5 py-0.5 text-xs font-medium`}
              >
                {key}
              </span>
            ))}
          </div>

          <ClientCreateButton />
        </div>
      </div>

      {/* 검색/필터 */}
      <form className="flex gap-3 mb-5">
        <input
          name="q"
          defaultValue={q}
          placeholder="고객사명, 대표자명, 사업자번호 검색"
          autoComplete="off"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
        />
        <button
          type="submit"
          className="bg-gray-100 border border-gray-300 text-gray-800 text-sm px-4 py-2 rounded-lg hover:bg-gray-200"
        >
          검색
        </button>
      </form>

      <ClientsTable clients={clients} />
    </div>
  );
}
