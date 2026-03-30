"use client";

import { useTransition } from "react";

export function ClientDeleteButton({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="border border-red-200 text-red-500 text-sm px-4 py-2 rounded-lg hover:bg-red-50"
      onClick={() => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        startTransition(() => action());
      }}
    >
      {pending ? "삭제중..." : "삭제"}
    </button>
  );
}
