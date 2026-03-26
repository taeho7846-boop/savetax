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
    <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-4 py-3 hover:border-amber-200 hover:bg-amber-50/30 transition-colors">
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onEdit(client.id)}
          className="text-sm font-semibold text-[#1a2e4a] hover:underline text-left"
        >
          {client.name}
        </button>
        <div className="text-xs text-gray-400 mt-0.5">
          {client.phone ?? "연락처 없음"}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          client.bankName ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
        }`}>
          {client.bankName ?? "은행 미등록"}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          client.bankAccount ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
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
  high:   { section: "border-red-200 bg-red-50/40",    badge: "bg-red-100 text-red-700",    dot: "bg-red-400"    },
  medium: { section: "border-amber-200 bg-amber-50/40", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
  low:    { section: "border-blue-100 bg-blue-50/30",  badge: "bg-blue-100 text-blue-700",  dot: "bg-blue-300"   },
};

function ClientGroup({ label, ym, clients, urgency, onEdit }: GroupProps) {
  if (clients.length === 0) return null;
  const s = URGENCY_STYLES[urgency];
  return (
    <div className={`border rounded-xl p-4 mb-4 ${s.section}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">({fmtYM(ym)} 최초출금)</span>
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
        className="bg-white rounded-lg p-4 shadow-sm border border-amber-200 text-left w-full hover:border-amber-400 hover:shadow-md transition-all"
      >
        <div className="flex items-start justify-between">
          <div className="text-sm text-amber-700 font-medium">CMS 등록요망</div>
          {total > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
              조치 필요
            </span>
          )}
        </div>
        <div className={`text-3xl font-bold mt-1 ${total > 0 ? "text-amber-500" : "text-gray-300"}`}>
          {total}
        </div>
        {total > 0 ? (
          <div className="flex gap-2 mt-2 flex-wrap">
            {prevClients.length > 0 && (
              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                지난달 {prevClients.length}
              </span>
            )}
            {currentClients.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                당월 {currentClients.length}
              </span>
            )}
            {nextClients.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                다음달 {nextClients.length}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-400 mt-1">계좌 미등록 없음</div>
        )}
      </button>

      {/* 드로어 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">CMS 등록요망</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  출금계좌 미등록 고객사 — 연락 후 정보 입력 필요
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 px-6 py-5">
              {total === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-gray-600 font-medium">모두 등록 완료</p>
                  <p className="text-xs text-gray-400 mt-1">미등록 고객사가 없습니다</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5">
                    고객사명을 클릭하면 바로 정보를 수정할 수 있습니다.
                  </p>
                  <ClientGroup
                    label="지난달"
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
