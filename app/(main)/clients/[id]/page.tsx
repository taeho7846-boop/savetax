import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { STATUS_LABELS, STATUS_COLORS, TASK_TYPE_LABELS } from "@/lib/constants";
import { deleteClient } from "@/app/actions/clients";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id: parseInt(id), isDeleted: false },
    include: {
      assignedUser: true,
      tasks: {
        where: { isDeleted: false },
        include: { assignedUser: true },
        orderBy: { dueDate: "asc" },
      },
      memos: {
        include: { author: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) notFound();

  const deleteWithId = deleteClient.bind(null, client.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/clients" className="text-gray-400 hover:text-gray-600 text-sm">
            ← 고객사 목록
          </Link>
          <h1 className="text-xl font-bold text-gray-800">{client.name}</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              client.contractStatus === "active"
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {client.contractStatus === "active" ? "계약중" : "계약종료"}
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/clients/${client.id}/edit`}
            className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            수정
          </Link>
          <form action={deleteWithId}>
            <button
              type="submit"
              className="border border-red-200 text-red-500 text-sm px-4 py-2 rounded-lg hover:bg-red-50"
              onClick={(e) => {
                if (!confirm("정말 삭제하시겠습니까?")) e.preventDefault();
              }}
            >
              삭제
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 기본 정보 */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="font-medium text-gray-700 mb-4">기본 정보</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-400 text-xs">구분</dt>
                <dd className="text-gray-800 mt-0.5">
                  {client.clientType === "corporate" ? "법인" : "개인"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">대표자</dt>
                <dd className="text-gray-800 mt-0.5">{client.ceoName || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">사업자번호</dt>
                <dd className="text-gray-800 mt-0.5">{client.bizNumber || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">연락처</dt>
                <dd className="text-gray-800 mt-0.5">{client.phone || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">이메일</dt>
                <dd className="text-gray-800 mt-0.5">{client.email || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">업종</dt>
                <dd className="text-gray-800 mt-0.5">{client.bizType || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">주소</dt>
                <dd className="text-gray-800 mt-0.5">{client.address || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">신고 유형</dt>
                <dd className="text-gray-800 mt-0.5">{client.taxTypes || "-"}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">담당자</dt>
                <dd className="text-gray-800 mt-0.5">
                  {client.assignedUser?.name || "미배정"}
                </dd>
              </div>
              {client.notes && (
                <div>
                  <dt className="text-gray-400 text-xs">특이사항</dt>
                  <dd className="text-gray-800 mt-0.5 whitespace-pre-wrap">
                    {client.notes}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* 업무 목록 + 메모 */}
        <div className="col-span-2 space-y-4">
          {/* 업무 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-medium text-gray-700">업무 목록</h2>
              <Link
                href={`/tasks/new?clientId=${client.id}`}
                className="text-xs text-[#1a2e4a] border border-[#1a2e4a] px-3 py-1 rounded-lg hover:bg-[#1a2e4a] hover:text-white transition-colors"
              >
                + 업무 추가
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {client.tasks.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">
                  등록된 업무가 없습니다
                </div>
              ) : (
                client.tasks.map((task) => (
                  <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">
                        {task.title}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {task.taskType ? TASK_TYPE_LABELS[task.taskType] || task.taskType : ""}
                        {task.assignedUser ? ` · ${task.assignedUser.name}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}
                      >
                        {STATUS_LABELS[task.status]}
                      </span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString("ko-KR")
                          : "마감일 없음"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 메모 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-medium text-gray-700">내부 메모</h2>
              <Link
                href={`/memos/new?clientId=${client.id}`}
                className="text-xs text-[#1a2e4a] border border-[#1a2e4a] px-3 py-1 rounded-lg hover:bg-[#1a2e4a] hover:text-white transition-colors"
              >
                + 메모 추가
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {client.memos.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">
                  등록된 메모가 없습니다
                </div>
              ) : (
                client.memos.map((memo) => (
                  <div key={memo.id} className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        {memo.author.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(memo.createdAt).toLocaleDateString("ko-KR")}
                      </span>
                      {memo.memoType !== "general" && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            memo.memoType === "handover"
                              ? "bg-blue-100 text-blue-600"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {memo.memoType === "handover" ? "인수인계" : "주의"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {memo.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
