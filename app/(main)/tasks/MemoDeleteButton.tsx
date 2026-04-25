"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMemo } from "@/app/actions/memos";

export function MemoDeleteButton({ memoId }: { memoId: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    startTransition(async () => {
      await deleteMemo(memoId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-[#8B95A1] hover:text-[#E02E2E] transition-colors"
    >
      삭제
    </button>
  );
}
