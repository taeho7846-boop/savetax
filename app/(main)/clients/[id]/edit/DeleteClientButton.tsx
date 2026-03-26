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
        className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
      >
        고객사 삭제
      </button>
    </form>
  );
}
