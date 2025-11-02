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
        active ? "bg-white/90 text-black font-semibold" : "text-white/85 hover:bg-white/15"
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="max-w-5xl mx-auto px-4">
        <nav className="w-full flex justify-center py-3">
          <div className="inline-flex gap-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur px-2 py-1">
            <NavLink href="/">Inicio</NavLink>
            <NavLink href="/devlog">Novedades</NavLink>
          </div>
        </nav>
      </div>
    </header>
  );
}
