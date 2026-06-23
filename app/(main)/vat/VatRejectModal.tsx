"use client";

import { useEffect, useState } from "react";
import { rejectVatReport, getVatRejections } from "@/app/actions/vat";

type Rejection = {
  id: number;
  sequence: number;
  reason: string;
  rejectedAt: string;
  resolvedAt: string | null;
  rejectedByName: string | null;
};

export function VatRejectModal({
  clientId,
  clientName,
  period,
  onClose,
  onRejected,
}: {
  clientId: number;
  clientName: string;
  period: string;
  onClose: () => void;
  onRejected?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Rejection[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getVatRejections(clientId, period).then((rows) => setHistory(rows as Rejection[]));
  }, [clientId, period]);

  const nextSequence = history.length + 1;

  async function submit() {
    const r = reason.trim();
    if (!r) return;
    setSubmitting(true);
    try {
      await rejectVatReport(clientId, period, r);
      onRejected?.();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "반려 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[#0F172A]/35 backdrop-blur-md" />
      <div
        className="relative w-full max-w-[520px] max-h-[80vh] flex flex-col overflow-hidden rounded-[28px]"
        style={{
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          boxShadow: "0 24px 60px -16px rgba(15,23,42,0.35), 0 8px 24px -8px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.6) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-6 pb-4 border-b border-white/40">
          <div className="text-[11.5px] font-bold text-[#DC2626] uppercase tracking-[0.12em] mb-1.5">
            REJECT · {nextSequence}차 반려
          </div>
          <h2 className="text-[19px] font-bold text-[#191F28] tracking-tight">{clientName}</h2>
          <div className="text-[12px] text-[#6B7684] mt-0.5">
            반려 시 작성중 단계로 다시 돌아갑니다. 직원이 반려 사유를 보고 수정 후 재결재 요청합니다.
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          {/* 이전 반려 히스토리 */}
          {history.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider mb-2 px-1">
                이전 반려 히스토리 ({history.length}건)
              </div>
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-xl p-3"
                    style={{
                      background: "rgba(255,255,255,0.55)",
                      boxShadow: "0 0 0 1px rgba(229,232,235,0.6) inset",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#DC2626] font-bold">
                        {h.sequence}차
                      </span>
                      <span className="text-[11px] text-[#6B7684]">
                        {new Date(h.rejectedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                      {h.rejectedByName && <span className="text-[11px] text-[#6B7684]">· {h.rejectedByName}</span>}
                      {h.resolvedAt && (
                        <span className="ml-auto text-[10.5px] text-[#059669] font-bold">✓ 재결재 처리됨</span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-[#191F28] whitespace-pre-wrap">{h.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 반려 사유 입력 */}
          <div>
            <div className="text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider mb-2 px-1">
              {nextSequence}차 반려 사유
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예) 매출 누락 / 매입 자료 확인 / 예정고지 반영 누락 / 공제 항목 재확인..."
              rows={5}
              className="w-full px-4 py-3 rounded-2xl text-[13.5px] text-[#191F28] placeholder-[#B0B8C1] resize-none focus:outline-none"
              style={{
                background: "rgba(255,255,255,0.7)",
                boxShadow: "0 0 0 1px rgba(229,232,235,0.8) inset",
              }}
              autoFocus
            />
          </div>
        </div>

        <div className="px-7 py-4 border-t border-white/40 bg-white/30 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-2xl text-[#6B7684] hover:bg-white text-[13px] font-medium"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={!reason.trim() || submitting}
            className="px-5 py-2 rounded-2xl bg-[#DC2626] text-white text-[13px] font-bold hover:bg-[#B91C1C] disabled:opacity-50"
            style={{ boxShadow: "0 8px 20px -6px rgba(220,38,38,0.4)" }}
          >
            {submitting ? "처리 중..." : `${nextSequence}차 반려`}
          </button>
        </div>
      </div>
    </div>
  );
}
