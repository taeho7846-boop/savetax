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
      className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
    >
      삭제
    </button>
  );
}
