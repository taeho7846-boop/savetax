"use client";

import Link from "next/link";

export function ClientLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  function handleClick() {
    const main = document.querySelector("main");
    if (main) sessionStorage.setItem("clientsScrollTop", String(main.scrollTop));
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
