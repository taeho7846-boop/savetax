"use client";

import { useState } from "react";
import { ClientEditModal } from "@/app/(main)/clients/ClientEditModal";

interface CmsClient {
  id: number;
  name: string;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
}

interface Props {
  prevClients: CmsClient[];
  currentClients: CmsClient[];
  nextClients: CmsClient[];
  prevYM: string;
  currentYM: string;
  nextYM: string;
}

function fmtYM(ym: string) {
  const [, m] = ym.split("-");
  return `${parseInt(m)}월`;
}

function ClientRow({
  client,
  onEdit,
}: {
  client: CmsClient;
  onEdit: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-white border border-[#E5E8EB] rounded-[6px] px-4 py-3 hover:border-[rgba(245,158,11,0.25)] hover:bg-[rgba(245,158,11,0.06)] transition-colors">
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onEdit(client.id)}
          className="text-sm font-bold text-[#191F28] hover:underline text-left"
        >
          {client.name}
        </button>
        <div className="text-xs text-[#8B95A1] mt-0.5">
          {client.phone ?? "연락처 없음"}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-[500] ${
          client.bankName ? "bg-[#ecfdf5] text-[#065f46]" : "bg-[#fef2f2] text-[#dc2626]"
        }`}>
          {client.bankName ?? "은행 미등록"}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-[500] ${
          client.bankAccount ? "bg-[#ecfdf5] text-[#065f46]" : "bg-[#fef2f2] text-[#dc2626]"
        }`}>
          {client.bankAccount ? "계좌 등록됨" : "계좌 미등록"}
        </span>
      </div>
    </div>
  );
}

interface GroupProps {
  label: string;
  ym: string;
  clients: CmsClient[];
  urgency: "high" | "medium" | "low";
  onEdit: (id: number) => void;
}

const URGENCY_STYLES = {
  high:   { section: "border-[#fca5a5] bg-[rgba(239,68,68,0.06)]",    badge: "bg-[#fef2f2] text-[#dc2626]",    dot: "bg-[#f87171]"    },
  medium: { section: "border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.06)]", badge: "bg-[#fffbeb] text-[#92400e]", dot: "bg-[#fcd34d]" },
  low:    { section: "border-[#bfdbfe] bg-[rgba(59,130,246,0.06)]",  badge: "bg-[#eff6ff] text-[#1e40af]",  dot: "bg-[#93c5fd]"   },
};

function ClientGroup({ label, ym, clients, urgency, onEdit }: GroupProps) {
  if (clients.length === 0) return null;
  const s = URGENCY_STYLES[urgency];
  return (
    <div className={`border rounded-[14px] p-4 mb-4 ${s.section}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        <span className="text-sm font-bold text-[#4E5968]">{label}</span>
        <span className="text-xs text-[#8B95A1]">{label === "과거" ? "(당월 이전 최초출금)" : `(${fmtYM(ym)} 최초출금)`}</span>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
          {clients.length}건
        </span>
      </div>
      <div className="space-y-2">
        {clients.map((c) => (
          <ClientRow key={c.id} client={c} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

export function CmsPendingCard({
  prevClients,
  currentClients,
  nextClients,
  prevYM,
  currentYM,
  nextYM,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const total = prevClients.length + currentClients.length + nextClients.length;

  function handleEdit(id: number) {
    setOpen(false);
    setEditingId(id);
  }

  return (
    <>
      {/* 카드 */}
      <button
        onClick={() => setOpen(true)}
        className="bg-white rounded-[6px] p-4 border border-[rgba(245,158,11,0.25)] text-left w-full hover:border-[rgba(245,158,11,0.45)] transition-all"
      >
        <div className="flex items-start justify-between">
          <div className="text-sm text-[#92400e] font-[500]">CMS 등록요망</div>
          {total > 0 && (
            <span className="bg-[#fffbeb] text-[#92400e] text-xs font-bold px-2 py-0.5 rounded-full">
              조치 필요
            </span>
          )}
        </div>
        <div className={`text-3xl font-bold mt-1 ${total > 0 ? "text-[#d97706]" : "text-[#8B95A1]"}`}>
          {total}
        </div>
        {total > 0 ? (
          <div className="flex gap-2 mt-2 flex-wrap">
            {prevClients.length > 0 && (
              <span className="text-xs bg-[#fef2f2] text-[#dc2626] px-1.5 py-0.5 rounded font-[500]">
                과거 {prevClients.length}
              </span>
            )}
            {currentClients.length > 0 && (
              <span className="text-xs bg-[#fffbeb] text-[#92400e] px-1.5 py-0.5 rounded font-[500]">
                당월 {currentClients.length}
              </span>
            )}
            {nextClients.length > 0 && (
              <span className="text-xs bg-[#eff6ff] text-[#1e40af] px-1.5 py-0.5 rounded font-[500]">
                다음달 {nextClients.length}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-[#8B95A1] mt-1">계좌 미등록 없음</div>
        )}
      </button>

      {/* 드로어 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto border-l border-[#E5E8EB] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E8EB] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-[#191F28]">CMS 등록요망</h2>
                <p className="text-xs text-[#8B95A1] mt-0.5">
                  출금계좌 미등록 고객사 — 연락 후 정보 입력 필요
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[#8B95A1] hover:text-[#4E5968] text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 px-6 py-5">
              {total === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-[#4E5968] font-[500]">모두 등록 완료</p>
                  <p className="text-xs text-[#8B95A1] mt-1">미등록 고객사가 없습니다</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[#92400e] bg-[#fffbeb] border border-[rgba(245,158,11,0.25)] rounded-[6px] px-4 py-3 mb-5">
                    고객사명을 클릭하면 바로 정보를 수정할 수 있습니다.
                  </p>
                  <ClientGroup
                    label="과거"
                    ym={prevYM}
                    clients={prevClients}
                    urgency="high"
                    onEdit={handleEdit}
                  />
                  <ClientGroup
                    label="당월"
                    ym={currentYM}
                    clients={currentClients}
                    urgency="medium"
                    onEdit={handleEdit}
                  />
                  <ClientGroup
                    label="다음달"
                    ym={nextYM}
                    clients={nextClients}
                    urgency="low"
                    onEdit={handleEdit}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {editingId && (
        <ClientEditModal clientId={editingId} onClose={() => setEditingId(null)} />
      )}
    </>
  );
}
