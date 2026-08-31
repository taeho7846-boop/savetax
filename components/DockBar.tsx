"use client";

import Link from "next/link";
import { type ReactNode } from "react";

type DockItem = {
  key: string;
  label: string;
  title: string;
  gradient: string;
  shadow: string;
  icon: ReactNode;
  href?: string;
  external?: boolean;
  popup?: { width: number; height: number };
  badge?: number;
};

const ITEMS: (DockItem | "divider")[] = [
  {
    key: "wehago",
    label: "위하고",
    title: "위하고 (더존)",
    gradient: "from-[#23262E] to-[#0F1115]",
    shadow: "shadow-black/30",
    icon: (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <circle cx={12} cy={12} r={6.5} stroke="#2F8AF5" strokeWidth={5.5} />
      </svg>
    ),
    href: "https://www.wehago.com",
    external: true,
  },
  {
    key: "wemembers",
    label: "위멤버스",
    title: "위멤버스",
    gradient: "from-[#23262E] to-[#0F1115]",
    shadow: "shadow-black/30",
    icon: (
      <span className="w-[26px] h-[26px] rounded-[6px] bg-[#2456F0] text-white font-bold text-[12px] flex items-center justify-center tracking-tight">
        We
      </span>
    ),
    href: "https://www.wemembers.net/login_0001_01.act",
    external: true,
  },
  {
    key: "pdf",
    label: "PDF 편집",
    title: "PDF 편집기 (순서·합치기·글자·도장·OCR)",
    gradient: "from-[#EF4444] to-[#B91C1C]",
    shadow: "shadow-[#EF4444]/30",
    icon: (
      <svg width={22} height={22} fill="none" stroke="white" strokeWidth={2.2} viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 15h6" />
        <path d="M9 11h2" />
      </svg>
    ),
    href: "/pdf-editor/index.html",
    external: true,
  },
  {
    key: "drive",
    label: "드라이브",
    title: "구글드라이브",
    gradient: "from-[#FBBF24] via-[#10B981] to-[#3182F6]",
    shadow: "shadow-[#10B981]/30",
    icon: (
      <svg width={22} height={22} fill="none" stroke="white" strokeWidth={2.4} viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
    href: "https://drive.google.com",
    external: true,
  },
  "divider",
  {
    key: "memos",
    label: "빠른메모",
    title: "빠른 메모",
    gradient: "from-[#FBBF24] to-[#F59E0B]",
    shadow: "shadow-[#F59E0B]/30",
    icon: (
      <svg width={22} height={22} fill="none" stroke="white" strokeWidth={2.4} viewBox="0 0 24 24">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    href: "/memos",
  },
  {
    key: "phone",
    label: "내 폰",
    title: "내 폰 (팝업)",
    gradient: "from-[#191F28] to-[#333333]",
    shadow: "shadow-black/30",
    icon: (
      <svg width={22} height={22} fill="none" stroke="white" strokeWidth={2.4} viewBox="0 0 24 24">
        <rect x={5} y={2} width={14} height={20} rx={2} />
        <path d="M11 18h2" />
      </svg>
    ),
    href: "/phone",
    popup: { width: 350, height: 740 },
  },
];

export default function DockBar() {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30">
      <div
        className="glass-strong rounded-[24px] px-3 py-2.5 flex items-end gap-1.5 shadow-2xl"
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(24px) saturate(200%)",
        }}
      >
        {ITEMS.map((item, i) =>
          item === "divider" ? (
            <div key={`d${i}`} className="w-px h-10 bg-[#D1D6DB] mx-1 self-center" />
          ) : (
            <DockButton key={item.key} item={item} />
          )
        )}
      </div>
    </div>
  );
}

function DockButton({ item }: { item: DockItem }) {
  const innerNode = (
    <div className="dock-icon group relative">
      <div
        className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg ${item.shadow} transition-all group-hover:scale-110 group-hover:-translate-y-1 relative`}
      >
        {item.icon}
        {item.badge ? (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#DC2626] text-white text-[9px] font-bold flex items-center justify-center border-2 border-white">
            {item.badge}
          </span>
        ) : null}
      </div>
      <div className="dock-label">{item.label}</div>
    </div>
  );
  if (!item.href) {
    return <button title={item.title}>{innerNode}</button>;
  }
  if (item.popup) {
    const { width: w, height: h } = item.popup;
    return (
      <button
        type="button"
        title={item.title}
        onClick={() => {
          const left = window.screen.availWidth - w - 40;
          const top = 80;
          window.open(
            item.href!,
            `savetax-${item.key}`,
            `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
          );
        }}
      >
        {innerNode}
      </button>
    );
  }
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" title={item.title}>
        {innerNode}
      </a>
    );
  }
  return (
    <Link href={item.href} title={item.title}>
      {innerNode}
    </Link>
  );
}
