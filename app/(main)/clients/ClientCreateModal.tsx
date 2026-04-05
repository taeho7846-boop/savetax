"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientInModal, getCreateClientData } from "@/app/actions/clients";
import { EditClientForm } from "@/app/(main)/clients/[id]/edit/EditClientForm";

type CreateData = Awaited<ReturnType<typeof getCreateClientData>>;

const emptyClient = {
  name: "",
  bizNumber: null,
  ceoName: null,
  residentNumber: null,
  phone: null,
  address: null,
  clientType: "individual",
  taxationType: null,
  hometaxId: null,
  hometaxPw: null,
  monthlyFee: null,
  freeMonths: null,
  firstWithdrawalMonth: null,
  bankName: null,
  bankAccount: null,
  openDate: null,
  halfYearTax: false,
  affiliation: null,
  notes: null,
  myboxLink: null,
  assignedUserId: null,
};

export function ClientCreateButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors shrink-0"}
      >
        + 고객사 등록
      </button>
      {open && <ClientCreateModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ClientCreateModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<CreateData | null>(null);
  const router = useRouter();

  useEffect(() => {
    getCreateClientData().then(setData);
  }, []);

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
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">고객사 등록</h2>
            {data && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const form = document.querySelector<HTMLFormElement>('[data-modal-form]');
                    form?.requestSubmit();
                  }}
                  className="bg-[#1a2e4a] text-white text-sm px-4 py-1.5 rounded-lg hover:bg-[#243d61] transition-colors"
                >
                  등록
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="border border-gray-300 text-gray-700 text-sm px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
              </>
            )}
          </div>
        </div>

        {/* 바디 */}
        <div className="flex-1 px-6 py-5">
          {!data ? (
            <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
          ) : (
            <EditClientForm
              action={createClientInModal}
              client={emptyClient}
              users={data.users}
              currentTaxTypes={[]}
              currentLaborTypes={[]}
              currentUserRole={data.currentUserRole}
              affiliationOptions={data.affiliationOptions}
              onSuccess={handleSuccess}
              hideButtons
            />
          )}
        </div>
      </div>
    </div>
  );
}
