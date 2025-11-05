// components/Header.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/devlog", label: "Novedades" }
] as const;

export default function Header() {
  const pathname = usePathname();

  const navRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState<{ width: number; left: number } | null>(null);

  const activeHref = useMemo(() => {
    const link = NAV_LINKS.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));
    return link?.href ?? null;
  }, [pathname]);

  const updateIndicator = useCallback(() => {
    const navEl = navRef.current;
    if (!navEl || !activeHref) {
      setIndicator(null);
      return;
    }

    const linkEl = linkRefs.current[activeHref];
    if (!linkEl) {
      setIndicator(null);
      return;
    }

    const navRect = navEl.getBoundingClientRect();
    const linkRect = linkEl.getBoundingClientRect();
    setIndicator({
      width: linkRect.width,
      left: linkRect.left - navRect.left
    });
  }, [activeHref]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const handleResize = () => updateIndicator();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateIndicator]);

  // NO mostrar en /quiz ni subrutas
  if (pathname.startsWith("/quiz")) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
       <nav
        ref={navRef}
        className="relative mx-auto flex max-w-5xl justify-center gap-1.5 rounded-full bg-black/20 px-4 py-3 backdrop-blur"
      >
        {indicator && (
          <span
            aria-hidden
            className="absolute inset-y-1 rounded-full bg-white/15 shadow-[0_8px_30px_rgb(2_12_41_/_0.25)] transition-[transform,width] duration-500 ease-out"
            style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
          />
        )}
        {NAV_LINKS.map(({ href, label }) => {
          const active = href === activeHref;
          return (
            <Link
              key={href}
              href={href}
              ref={(el) => {
                linkRefs.current[href] = el;
              }}
              className="relative z-10 px-4 py-2 text-sm font-medium text-white/80 transition-colors duration-300 hover:text-white sm:text-base"
              aria-current={active ? "page" : undefined}
            >
              <span className={active ? "text-[var(--eu-yellow)] drop-shadow" : ""}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
