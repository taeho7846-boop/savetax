"use client";

import { useEffect } from "react";

export function ScrollRestorer() {
  useEffect(() => {
    const saved = sessionStorage.getItem("clientsScrollTop");
    if (!saved) return;
    sessionStorage.removeItem("clientsScrollTop");
    requestAnimationFrame(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = parseInt(saved);
    });
  }, []);

  return null;
}
