import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist(예정고지 납부서 PDF 파싱)는 번들하지 않고 Node에서 그대로 로드
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
