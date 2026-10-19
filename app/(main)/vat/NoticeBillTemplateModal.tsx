"use client";

import { useState } from "react";
import { setNoticeBillTemplate } from "@/app/actions/vat";
import { notify } from "@/components/ui/Dialog";
import {
  buildNoticeBillMessage,
  noticeBillMiddle,
  DEFAULT_NOTICE_BILL_TEMPLATE,
  NOTICE_BILL_PLACEHOLDERS,
  type NoticeBillTemplate,
} from "@/lib/vat-notice-bill";

/**
 * 예정고지 납부서 안내문 편집 — 상단(자유) · 중단(납부기한·납부금액 고정) · 하단(자유).
 * 사무실 공통 문구라 대표/관리자/세무사만 저장할 수 있다.
 */
export function NoticeBillTemplateModal({
  period,
  initial,
  canEdit,
  onClose,
  onSaved,
}: {
  period: string;
  initial: NoticeBillTemplate;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (tpl: NoticeBillTemplate) => void;
}) {
  const [top, setTop] = useState(initial.top);
  const [bottom, setBottom] = useState(initial.bottom);
  const [saving, setSaving] = useState(false);

  const sampleBill = { amount: 1234000, dueDate: `${period.slice(0, 4)}-${period.split("-")[1] === "1" ? "04" : "10"}-25` };
  const preview = buildNoticeBillMessage({ period, bill: sampleBill, clientName: "거래처명", ceoName: "홍길동" }, { top, bottom });

  async function save() {
    setSaving(true);
    try {
      await setNoticeBillTemplate(top, bottom);
      onSaved({ top, bottom });
      notify("안내문을 저장했습니다.", { type: "success" });
      onClose();
    } catch (e) {
      notify(e instanceof Error && e.message === "FORBIDDEN" ? "안내문은 대표·관리자만 수정할 수 있습니다." : "저장에 실패했습니다.", { type: "error" });
    } finally {
      setSaving(false);
    }
  }

  const areaStyle = { background: "rgba(255,255,255,0.7)", boxShadow: "0 0 0 1px rgba(229,232,235,0.8) inset" };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[6vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[#0F172A]/35 backdrop-blur-md" />
      <div
        className="relative w-full max-w-[960px] max-h-[86vh] flex flex-col overflow-hidden rounded-[28px]"
        style={{
          background: "rgba(255,255,255,0.86)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          boxShadow: "0 24px 60px -16px rgba(15,23,42,0.35), 0 8px 24px -8px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.6) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-6 pb-4 border-b border-white/40 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11.5px] font-bold text-[#6D28D9] uppercase tracking-[0.12em] mb-1.5">예정고지 납부서 안내문</div>
            <h2 className="text-[19px] font-bold text-[#191F28] tracking-tight">대표님께 보낼 문구 편집</h2>
            <div className="text-[12px] text-[#6B7684] mt-0.5">
              상단·하단은 자유롭게, 중단의 납부기한·납부금액은 납부서에서 읽은 값이 자동으로 들어갑니다. 사무실 공통으로 저장됩니다.
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-xl text-[#8B95A1] hover:text-[#191F28] hover:bg-white/60 flex items-center justify-center text-lg">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 편집 */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider mb-2 px-1">상단</div>
              <textarea
                value={top}
                onChange={(e) => setTop(e.target.value)}
                rows={11}
                disabled={!canEdit}
                className="w-full px-4 py-3 rounded-2xl text-[13.5px] text-[#191F28] placeholder-[#B0B8C1] resize-y focus:outline-none disabled:opacity-60 leading-relaxed"
                style={areaStyle}
              />
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider mb-2 px-1">중단 · 고정</div>
              <div className="px-4 py-3 rounded-2xl text-[13.5px] text-[#4E5968] whitespace-pre-wrap bg-[#F2F4F6] leading-relaxed" title="납부서 PDF에서 읽은 납부기한·납부금액이 거래처마다 자동으로 채워집니다">
                {noticeBillMiddle(sampleBill)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider mb-2 px-1">하단 <span className="normal-case tracking-normal text-[#B0B8C1]">(비워도 됨)</span></div>
              <textarea
                value={bottom}
                onChange={(e) => setBottom(e.target.value)}
                rows={4}
                disabled={!canEdit}
                placeholder="예) 납부 완료 후 알려주시면 감사하겠습니다."
                className="w-full px-4 py-3 rounded-2xl text-[13.5px] text-[#191F28] placeholder-[#B0B8C1] resize-y focus:outline-none disabled:opacity-60 leading-relaxed"
                style={areaStyle}
              />
            </div>
            <div className="rounded-2xl bg-white/60 px-4 py-3" style={{ boxShadow: "0 0 0 1px rgba(229,232,235,0.6) inset" }}>
              <div className="text-[11px] font-bold text-[#8B95A1] mb-1.5">자동 치환 문구 <span className="font-medium text-[#B0B8C1]">— 상단·하단에 그대로 적으면 바뀝니다</span></div>
              <div className="flex flex-wrap gap-1.5">
                {NOTICE_BILL_PLACEHOLDERS.map((p) => (
                  <span key={p.key} className="inline-flex items-center gap-1 rounded-md bg-[#F5E8FF] text-[#6D28D9] px-1.5 py-0.5 text-[11px] font-bold" title={p.desc}>
                    {p.key} <span className="font-medium text-[#8B95A1]">{p.desc}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 미리보기 */}
          <div className="flex flex-col">
            <div className="text-[11px] font-bold text-[#8B95A1] uppercase tracking-wider mb-2 px-1">미리보기 <span className="normal-case tracking-normal text-[#B0B8C1]">(예시 금액)</span></div>
            <div className="flex-1 rounded-2xl bg-[#FEF9C3]/60 px-5 py-4 text-[13.5px] text-[#191F28] whitespace-pre-wrap leading-relaxed" style={{ boxShadow: "0 0 0 1px rgba(253,224,71,0.5) inset" }}>
              {preview}
            </div>
          </div>
        </div>

        <div className="px-7 py-4 border-t border-white/40 flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => { setTop(DEFAULT_NOTICE_BILL_TEMPLATE.top); setBottom(DEFAULT_NOTICE_BILL_TEMPLATE.bottom); }}
              className="text-[12px] font-bold text-[#8B95A1] hover:text-[#4E5968] px-2"
            >
              기본 문구로 되돌리기
            </button>
          )}
          {!canEdit && <span className="text-[12px] text-[#8B95A1] px-2">문구 수정은 대표·관리자만 할 수 있어요</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="px-4 h-10 rounded-xl text-[13px] font-bold glass-strong text-[#6B7684] hover:text-[#191F28]">닫기</button>
            {canEdit && (
              <button
                onClick={save}
                disabled={saving}
                className="px-5 h-10 rounded-xl text-[13px] font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
