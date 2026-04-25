"use client";

import { useTransition } from "react";
import { deleteTask } from "@/app/actions/tasks";

export function TaskDeleteButton({ taskId }: { taskId: number }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("이 업무를 삭제하시겠습니까?")) return;
    startTransition(async () => {
      await deleteTask(taskId);
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-[#E02E2E] hover:text-[#B91C1C] hover:underline disabled:opacity-50"
    >
      삭제
    </button>
  );
}
