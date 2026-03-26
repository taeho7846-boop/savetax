import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClientCreateButton } from "@/app/(main)/clients/ClientCreateModal";

export default async function TaxAgencyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const q = params.q ?? "";

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      assignedUserId: session.id,
      taxTypes: { contains: "신고대리" },
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">신고대리</h1>
        <ClientCreateButton />
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

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-gray-700 font-medium w-40">고객사명</th>
              <th className="text-center px-4 py-3 text-gray-700 font-medium">사업자번호</th>
              <th className="text-center px-4 py-3 text-gray-700 font-medium">연락처</th>
              <th className="text-center px-4 py-3 text-gray-700 font-medium">대표자</th>
              <th className="text-center px-4 py-3 text-gray-700 font-medium">주민등록번호</th>
              <th className="text-center px-4 py-3 text-gray-700 font-medium">홈택스 ID</th>
              <th className="text-center px-4 py-3 text-gray-700 font-medium">홈택스 PW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-500">
                  신고대리 고객사가 없습니다
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/clients/${client.id}/edit`}
                      className="text-[#1a2e4a] font-medium hover:underline"
                    >
                      {client.name}
                    </Link>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {client.clientType === "corporate" ? "법인" : "개인"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-800">{client.bizNumber || <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-center text-gray-800">{client.phone || <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-center text-gray-800">{client.ceoName || <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-center text-gray-800">{client.residentNumber || <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-center text-gray-800">{client.hometaxId || <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3 text-center text-gray-800">{client.hometaxPw || <span className="text-gray-400">-</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
