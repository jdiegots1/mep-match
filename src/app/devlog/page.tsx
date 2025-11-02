// app/devlog/page.tsx
import { posts } from "@/data/devlog";
import Link from "next/link";

export const metadata = {
  title: "Novedades · MEP Match",
  description: "Devlog con avances, cambios y notas del proyecto.",
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d;
  }
}

export default function DevlogPage() {
  const sorted = [...posts].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <main className="min-h-dvh px-4 pb-20">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2">Novedades</h1>
        <p className="text-white/80 mb-8">
          Cambios y avances del proyecto. Corto y al pie.
        </p>

        <div className="space-y-4">
          {sorted.map((p) => (
            <article
              key={p.slug}
              className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg sm:text-xl font-semibold">{p.title}</h2>
                <time className="text-xs sm:text-sm text-white/70">{formatDate(p.date)}</time>
              </div>
              <p className="mt-2 text-sm sm:text-base text-white/85">{p.summary}</p>
              {p.tags?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-black/25">
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Si más adelante quieres posts individuales, descomenta el Link y crea /devlog/[slug] */}
              {/* <div className="mt-3">
                <Link
                  href={`/devlog/${p.slug}`}
                  className="inline-flex items-center text-sm px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition"
                >
                  Leer más
                </Link>
              </div> */}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
