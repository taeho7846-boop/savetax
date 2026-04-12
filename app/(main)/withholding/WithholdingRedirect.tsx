"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function WithholdingRedirect({ fallback }: { fallback: string }) {
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("withholding_ym");
    router.replace(`/withholding?ym=${saved || fallback}`);
  }, [router, fallback]);

  return null;
}
