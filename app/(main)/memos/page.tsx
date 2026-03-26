import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { MemoCreateButton } from "./MemoCreateModal";

export default async function MemosPage() {
  const memos = await prisma.memo.findMany({
    include: {
      author: true,
      client: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const typeLabel: Record<string, string> = {
    general: "일반",
    handover: "인수인계",
    caution: "주의",
  };

  const typeColor: Record<string, string> = {
    general: "bg-gray-100 text-gray-600",
    handover: "bg-blue-100 text-blue-600",
    caution: "bg-red-100 text-red-600",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">내부 메모</h1>
        <MemoCreateButton />
      </div>

      <div className="space-y-3">
        {memos.length === 0 ? (
          <div className="bg-white rounded-lg p-12 text-center text-gray-400 shadow-sm border border-gray-100">
            등록된 메모가 없습니다
          </div>
        ) : (
          memos.map((memo) => (
            <div
              key={memo.id}
              className="bg-white rounded-lg shadow-sm border border-gray-100 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-800">
                  {memo.author.name}
                </span>
                {memo.client && (
                  <Link
                    href={`/clients/${memo.clientId}`}
                    className="text-xs text-[#1a2e4a] hover:underline bg-blue-50 px-2 py-0.5 rounded"
                  >
                    {memo.client.name}
                  </Link>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded ${typeColor[memo.memoType]}`}
                >
                  {typeLabel[memo.memoType]}
                </span>
                <span className="text-xs text-gray-400 ml-auto">
                  {new Date(memo.createdAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {memo.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
