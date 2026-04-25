"use client";

export function DeleteClientButton({ action, name }: { action: () => Promise<void>; name: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`'${name}'을(를) 삭제하시겠습니까?`)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="text-sm text-[#E02E2E] hover:text-[#B91C1C] border border-[#FECACA] hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
      >
        고객사 삭제
      </button>
    </form>
  );
}
