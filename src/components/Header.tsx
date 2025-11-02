// components/Header.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = useMemo(() => (href === "/" ? pathname === "/" : pathname.startsWith(href)), [pathname, href]);

  return (
    <Link
      href={href}
      className={[
        "px-3 py-1.5 rounded-lg text-sm sm:text-base transition",
        // botón transparente
        "bg-transparent text-white/90 hover:text-white hover:drop-shadow",
        // estado activo: subrayado y color marca
        active ? "text-[var(--eu-yellow)] underline underline-offset-4 decoration-2" : ""
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  const pathname = usePathname();

  // NO mostrar en /quiz ni subrutas
  if (pathname.startsWith("/quiz")) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav className="max-w-5xl mx-auto px-4 py-3 flex justify-center gap-2">
        <NavLink href="/">Inicio</NavLink>
        <NavLink href="/devlog">Novedades</NavLink>
      </nav>
    </header>
  );
}
