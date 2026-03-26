"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getClientById, updateClientInModal, deleteClient } from "@/app/actions/clients";
import { EditClientForm } from "@/app/(main)/clients/[id]/edit/EditClientForm";

type ClientData = Awaited<ReturnType<typeof getClientById>>;

export function ClientEditModal({
  clientId,
  onClose,
}: {
  clientId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<ClientData | null>(null);
  const router = useRouter();

  useEffect(() => {
    getClientById(clientId).then(setData);
  }, [clientId]);

  // ESC 키로 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSuccess() {
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">고객사 수정</h2>
          <div className="flex items-center gap-3">
            {data?.client && (
              <form
                action={deleteClient.bind(null, data.client.id)}
                onSubmit={(e) => {
                  if (!confirm(`'${data.client!.name}'을(를) 삭제하시겠습니까?`))
                    e.preventDefault();
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  삭제
                </button>
              </form>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* 바디 */}
        <div className="flex-1 px-6 py-5">
          {!data ? (
            <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
          ) : !data.client ? (
            <div className="text-center py-16 text-gray-400 text-sm">고객사를 찾을 수 없습니다</div>
          ) : (
            <EditClientForm
              action={updateClientInModal.bind(null, data.client.id)}
              client={data.client}
              users={data.users}
              currentTaxTypes={data.client.taxTypes?.split(",").map((t) => t.trim()) ?? []}
              currentLaborTypes={data.client.laborTypes?.split(",").map((t) => t.trim()) ?? []}
              onSuccess={handleSuccess}
            />
          )}
        </div>
      </div>
    </div>
  );
}
