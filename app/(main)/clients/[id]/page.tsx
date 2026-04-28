import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { STATUS_LABELS, STATUS_COLORS, TASK_TYPE_LABELS } from "@/lib/constants";
import { getSession } from "@/lib/auth";
import { deleteClient } from "@/app/actions/clients";
import { ClientDeleteButton } from "./ClientDeleteButton";
import { MemoContent } from "./MemoContent";
import { TaskEditableSection } from "./TaskEditableSection";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeTab = sp.tab || "info";
  const session = await getSession();
  const currentUserId = session?.id ?? null;

  const client = await prisma.client.findUnique({
    where: { id: parseInt(id), isDeleted: false },
    include: {
      assignedUser: true,
      tasks: {
        where: { isDeleted: false },
        include: { assignedUser: true },
        orderBy: { createdAt: "desc" },
      },
      memos: {
        include: { author: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) notFound();

  const deleteWithId = deleteClient.bind(null, client.id);

  // 히스토리: 업무+메모를 createdAt으로 정렬
  const history = [
    ...client.tasks.map(t => ({ type: "task" as const, id: t.id, title: t.title, date: t.createdAt, status: t.status, taskType: t.taskType, dueDate: t.dueDate, user: t.assignedUser?.name, notes: t.notes, createdByUserId: t.createdByUserId })),
    ...client.memos.map(m => ({ type: "memo" as const, id: m.id, title: m.title || m.content.slice(0, 50), date: m.createdAt, memoType: m.memoType, user: m.author.name, content: m.content })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const MEMO_TYPE_LABELS: Record<string, string> = { general: "일반", handover: "인수인계", caution: "주의" };
  const MEMO_TYPE_COLORS: Record<string, string> = { general: "bg-[#F2F4F6] text-[#4E5968]", handover: "bg-[#E8F3FF] text-[#3182F6]", caution: "bg-[#FEF2F2] text-[#DC2626]" };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/clients" className="text-[#8B95A1] hover:text-[#4E5968] text-sm">
            ← 고객사 목록
          </Link>
          <h1 className="text-[24px] font-bold text-[#191F28] tracking-tight">{client.name}</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              client.contractStatus === "active"
                ? "bg-[#E7F7EE] text-[#15803D]"
                : "bg-[#F2F4F6] text-[#6B7684]"
            }`}
          >
            {client.contractStatus === "active" ? "계약중" : "계약종료"}
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/clients/${client.id}/edit`}
            className="border border-[#D1D6DB] text-[#4E5968] text-sm px-4 py-2 rounded-lg hover:bg-[#F9FAFB]"
          >
            수정
          </Link>
          <ClientDeleteButton action={deleteWithId} />
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-[#E5E8EB]">
        <Link
          href={`/clients/${client.id}?tab=info`}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "info"
              ? "border-[#3182F6] text-[#191F28]"
              : "border-transparent text-[#8B95A1] hover:text-[#4E5968]"
          }`}
        >
          정보
        </Link>
        <Link
          href={`/clients/${client.id}?tab=history`}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "history"
              ? "border-[#3182F6] text-[#191F28]"
              : "border-transparent text-[#8B95A1] hover:text-[#4E5968]"
          }`}
        >
          히스토리
          <span className="ml-1 text-xs text-[#8B95A1]">({history.length})</span>
        </Link>
      </div>

      {activeTab === "info" ? (
        <div className="grid grid-cols-3 gap-6">
          {/* 기본 정보 */}
          <div className="col-span-1 space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] p-5">
              <h2 className="font-medium text-[#333D4B] mb-4">기본 정보</h2>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-[#8B95A1] text-xs">구분</dt><dd className="text-[#191F28] mt-0.5">{client.clientType === "corporate" ? "법인" : "개인"}</dd></div>
                <div><dt className="text-[#8B95A1] text-xs">대표자</dt><dd className="text-[#191F28] mt-0.5">{client.ceoName || "-"}</dd></div>
                <div><dt className="text-[#8B95A1] text-xs">사업자번호</dt><dd className="text-[#191F28] mt-0.5">{client.bizNumber || "-"}</dd></div>
                <div><dt className="text-[#8B95A1] text-xs">연락처</dt><dd className="text-[#191F28] mt-0.5">{client.phone || "-"}</dd></div>
                <div><dt className="text-[#8B95A1] text-xs">이메일</dt><dd className="text-[#191F28] mt-0.5">{client.email || "-"}</dd></div>
                <div><dt className="text-[#8B95A1] text-xs">업종</dt><dd className="text-[#191F28] mt-0.5">{client.bizType || "-"}</dd></div>
                <div><dt className="text-[#8B95A1] text-xs">주소</dt><dd className="text-[#191F28] mt-0.5">{client.address || "-"}</dd></div>
                <div><dt className="text-[#8B95A1] text-xs">신고 유형</dt><dd className="text-[#191F28] mt-0.5">{client.taxTypes || "-"}</dd></div>
                <div><dt className="text-[#8B95A1] text-xs">담당자</dt><dd className="text-[#191F28] mt-0.5">{client.assignedUser?.name || "미배정"}</dd></div>
                {client.myboxLink && (
                  <div>
                    <dt className="text-[#8B95A1] text-xs">마이박스</dt>
                    <dd className="mt-0.5">
                      <a href={client.myboxLink} target="_blank" rel="noopener noreferrer" className="text-[#3182F6] hover:underline text-sm flex items-center gap-1">
                        📁 자료 폴더 열기
                      </a>
                    </dd>
                  </div>
                )}
                {client.notes && (
                  <div><dt className="text-[#8B95A1] text-xs">특이사항</dt><dd className="text-[#191F28] mt-0.5 whitespace-pre-wrap">{client.notes}</dd></div>
                )}
              </dl>
            </div>
          </div>

          {/* 업무 + 메모 */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6]">
              <div className="px-5 py-3 border-b border-[#F2F4F6]">
                <h2 className="font-medium text-[#333D4B]">업무 목록</h2>
              </div>
              <div className="divide-y divide-[#F2F4F6]">
                {client.tasks.length === 0 ? (
                  <div className="px-5 py-8 text-center text-[#8B95A1] text-sm">등록된 업무가 없습니다</div>
                ) : (
                  client.tasks.map((task) => (
                    <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#191F28]">{task.title}</div>
                        <div className="text-xs text-[#8B95A1] mt-0.5">
                          {task.taskType ? TASK_TYPE_LABELS[task.taskType] || task.taskType : ""}
                          {task.assignedUser ? ` · ${task.assignedUser.name}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                        <div className="text-xs text-[#8B95A1] mt-0.5">{task.dueDate ? new Date(task.dueDate).toLocaleDateString("ko-KR") : "마감일 없음"}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6]">
              <div className="px-5 py-3 border-b border-[#F2F4F6]">
                <h2 className="font-medium text-[#333D4B]">내부 메모</h2>
              </div>
              <div className="divide-y divide-[#F2F4F6]">
                {client.memos.length === 0 ? (
                  <div className="px-5 py-8 text-center text-[#8B95A1] text-sm">등록된 메모가 없습니다</div>
                ) : (
                  client.memos.map((memo) => (
                    <div key={memo.id} className="px-5 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-[#333D4B]">{memo.author.name}</span>
                        <span className="text-xs text-[#8B95A1]">{new Date(memo.createdAt).toLocaleDateString("ko-KR")}</span>
                        {memo.memoType !== "general" && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${memo.memoType === "handover" ? "bg-[#E8F3FF] text-[#3182F6]" : "bg-[#FEF2F2] text-[#DC2626]"}`}>
                            {memo.memoType === "handover" ? "인수인계" : "주의"}
                          </span>
                        )}
                      </div>
                      {memo.title && <div className="text-sm font-medium text-[#191F28] mb-0.5">{memo.title}</div>}
                      <p className="text-sm text-[#333D4B] whitespace-pre-wrap">{memo.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 히스토리 탭 */
        <div className="max-w-3xl">
          {history.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] py-12 text-center text-[#8B95A1]">기록이 없습니다</div>
          ) : (
            <div className="relative pl-6 border-l-2 border-[#E5E8EB] space-y-4">
              {history.map((item) => (
                <div key={`${item.type}-${item.id}`} className="relative">
                  {/* 타임라인 도트 */}
                  <div className={`absolute -left-[25px] w-3 h-3 rounded-full border-2 border-white ${item.type === "task" ? "bg-[#3182F6]" : "bg-[#F59E0B]"}`} />

                  <div className="bg-white rounded-lg shadow-sm border border-[#F2F4F6] px-5 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${item.type === "task" ? "bg-[#E8F3FF] text-[#1B64DA]" : "bg-[#FEF3C7] text-[#B45309]"}`}>
                        {item.type === "task" ? "업무" : "메모"}
                      </span>
                      {item.type === "task" && "status" in item && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                      )}
                      {item.type === "memo" && "memoType" in item && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${MEMO_TYPE_COLORS[item.memoType as string] ?? MEMO_TYPE_COLORS.general}`}>
                          {MEMO_TYPE_LABELS[item.memoType as string] ?? item.memoType}
                        </span>
                      )}
                      <span className="text-xs text-[#8B95A1] ml-auto">
                        {new Date(item.date).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-[#191F28]">{item.title}</div>
                    {item.type === "task" && (
                      <TaskEditableSection
                        taskId={item.id}
                        notes={item.notes ?? null}
                        dueDate={item.dueDate ? new Date(item.dueDate).toISOString() : null}
                        canEdit={currentUserId !== null && item.createdByUserId === currentUserId}
                      />
                    )}
                    {item.type === "memo" && "content" in item && (
                      <MemoContent content={item.content} />
                    )}
                    {item.user && <div className="text-[10px] text-[#8B95A1] mt-1">{item.user}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
