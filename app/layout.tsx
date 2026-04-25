import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Savetax — 세무 업무 관리",
  description: "세무 업무 관리 내부 직원 전용 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col bg-[#f2f4f6] text-[#191F28]">
        {children}
      </body>
    </html>
  );
}
