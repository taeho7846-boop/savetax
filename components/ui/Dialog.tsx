"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 사이트 공용 알림 — 브라우저 기본 alert / confirm / prompt 대체.
 *
 *   notify("저장됐어요")                       // 토스트 (하단 중앙, 자동 사라짐)
 *   notify("저장 실패", { type: "error" })
 *   if (!(await askConfirm("삭제할까요?"))) return;  // 확인 모달 (Enter=확인, Esc=취소)
 *   const v = await askPrompt("사유를 입력하세요");  // 입력 모달 (취소 시 null)
 *
 * <DialogHost />가 레이아웃에 한 번 마운트돼 있어야 한다. 없으면 브라우저 기본 창으로 자동 대체.
 */

export type ToastType = "info" | "success" | "error";
export type ToastOptions = { type?: ToastType; duration?: number };
export type ConfirmOptions = {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 빨간 확인 버튼 (삭제 등). 문자열 메시지에 '삭제/영구/되돌릴 수 없' 이 들어가면 자동 true */
  danger?: boolean;
};
export type PromptOptions = {
  title?: string;
  message?: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
};

type Toast = { id: number; message: ReactNode; type: ToastType; leaving?: boolean };
type ModalState =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

type Host = {
  toast: (message: ReactNode, opts?: ToastOptions) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
};

let host: Host | null = null;
let seq = 0;

const DANGER_RE = /삭제|영구|되돌릴 수 없|초기화|해지/;
const ERROR_RE = /실패|오류|에러|없습니다|없어요|불가|수 없|않습니다|않았|필요합니다|선택하세요|입력하세요|초과|잘못/;

function inferToastType(message: ReactNode): ToastType {
  if (typeof message !== "string") return "info";
  if (ERROR_RE.test(message)) return "error";
  if (/완료|됐어요|되었습니다|성공|저장|추가|변경|발송|등록|복원|이동/.test(message)) return "success";
  return "info";
}

/** alert 대체. 타입을 안 주면 문구로 성공/오류를 추정한다. */
export function notify(message: ReactNode, opts?: ToastOptions) {
  const type = opts?.type ?? inferToastType(message);
  if (host) host.toast(message, { ...opts, type });
  else if (typeof window !== "undefined" && typeof message === "string") window.alert(message);
}

/** confirm 대체. 문자열 또는 옵션 객체. */
export function askConfirm(input: string | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions =
    typeof input === "string" ? { message: input, danger: DANGER_RE.test(input) } : input;
  if (host) return host.confirm(opts);
  if (typeof window !== "undefined") {
    const text = typeof opts.message === "string" ? opts.message : opts.title ?? "";
    return Promise.resolve(window.confirm(text));
  }
  return Promise.resolve(false);
}

/** prompt 대체. 취소하면 null. */
export function askPrompt(input: string | PromptOptions, defaultValue?: string): Promise<string | null> {
  const opts: PromptOptions = typeof input === "string" ? { message: input, defaultValue } : input;
  if (host) return host.prompt(opts);
  if (typeof window !== "undefined") {
    const text = typeof opts.message === "string" ? opts.message : opts.title ?? "";
    return Promise.resolve(window.prompt(text, opts.defaultValue ?? ""));
  }
  return Promise.resolve(null);
}

/* ───────────────────────── Host ───────────────────────── */

export function DialogHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    function dismiss(id: number) {
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 220);
    }
    host = {
      toast(message, opts) {
        const id = ++seq;
        const type = opts?.type ?? "info";
        setToasts((list) => [...list.slice(-3), { id, message, type }]);
        const duration = opts?.duration ?? (type === "error" ? 4200 : 2600);
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      },
      confirm(opts) {
        return new Promise<boolean>((resolve) => setModal({ kind: "confirm", opts, resolve }));
      },
      prompt(opts) {
        return new Promise<string | null>((resolve) => setModal({ kind: "prompt", opts, resolve }));
      },
    };
    return () => {
      host = null;
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  function closeModal(result: boolean | string | null) {
    if (!modal) return;
    if (modal.kind === "confirm") modal.resolve(Boolean(result));
    else modal.resolve(typeof result === "string" ? result : null);
    setModal(null);
  }

  return (
    <>
      {/* 토스트 — 하단 중앙, 독바 위 */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[108px] z-[300] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto glass-strong flex max-w-[520px] items-start gap-2.5 rounded-2xl px-4 py-3 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.25)] transition-all duration-200 ${
              t.leaving ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <ToastIcon type={t.type} />
            <div className="whitespace-pre-wrap break-words text-[13px] font-semibold leading-snug text-[#191F28]">{t.message}</div>
          </div>
        ))}
      </div>

      {modal && (
        <ModalCard
          key={modal.kind}
          modal={modal}
          onClose={closeModal}
        />
      )}
    </>
  );
}

function ToastIcon({ type }: { type: ToastType }) {
  const cls =
    type === "success"
      ? "bg-[#E7F7EE] text-[#15803D]"
      : type === "error"
        ? "bg-[#FEF2F2] text-[#E02E2E]"
        : "bg-[#E8F3FF] text-[#3182F6]";
  return (
    <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${cls}`}>
      {type === "success" ? "✓" : type === "error" ? "!" : "i"}
    </span>
  );
}

function ModalCard({ modal, onClose }: { modal: ModalState; onClose: (r: boolean | string | null) => void }) {
  const isPrompt = modal.kind === "prompt";
  const opts = modal.opts;
  const [value, setValue] = useState(isPrompt ? (modal.opts as PromptOptions).defaultValue ?? "" : "");
  const primaryRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const danger = !isPrompt && (modal.opts as ConfirmOptions).danger;

  useEffect(() => {
    (isPrompt ? inputRef.current : primaryRef.current)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(isPrompt ? null : false);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onClose(isPrompt ? value : true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isPrompt, onClose, value]);

  const title = opts.title ?? (isPrompt ? "입력" : danger ? "확인이 필요해요" : "확인");
  const message = opts.message;

  return (
    <div
      className="fixed inset-0 z-[290] flex items-center justify-center bg-[#191F28]/25 p-4 backdrop-blur-[3px]"
      onMouseDown={() => onClose(isPrompt ? null : false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="glass-strong w-full max-w-[400px] rounded-[28px] p-6 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] animate-[dialog-in_.18s_cubic-bezier(.2,.8,.2,1)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[15px] font-bold ${
              danger ? "bg-[#FEF2F2] text-[#E02E2E]" : "bg-[#E8F3FF] text-[#3182F6]"
            }`}
          >
            {isPrompt ? "✎" : danger ? "!" : "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold tracking-tight text-[#191F28]">{title}</div>
            {message && (
              <div className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-[#4E5968]">{message}</div>
            )}
          </div>
        </div>

        {isPrompt && (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={(opts as PromptOptions).placeholder}
            className="mt-4 h-11 w-full rounded-xl border border-[#E5E8EB] bg-white px-3.5 text-[13.5px] text-[#191F28] outline-none transition focus:border-[#3182F6] focus:ring-4 focus:ring-[#3182F6]/15"
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(isPrompt ? null : false)}
            className="h-10 rounded-xl bg-[#F2F4F6] px-4 text-[13px] font-bold text-[#4E5968] transition hover:bg-[#E5E8EB]"
          >
            {opts.cancelText ?? "취소"}
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={() => onClose(isPrompt ? value : true)}
            className={`h-10 rounded-xl px-5 text-[13px] font-bold text-white shadow-md transition ${
              danger
                ? "bg-[#E02E2E] shadow-[#E02E2E]/25 hover:bg-[#C81E1E]"
                : "bg-[#3182F6] shadow-[#3182F6]/25 hover:bg-[#1B64DA]"
            }`}
          >
            {opts.confirmText ?? "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
