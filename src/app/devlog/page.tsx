// app/devlog/page.tsx
import { posts, type DevlogPost } from "@/data/devlog";

export const metadata = {
  title: "Novedades · MEP Match",
  description: "Cambios y avances del proyecto.",
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export default function DevlogPage() {
  const sorted = [...posts].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <main className="min-h-dvh px-4 pb-20 fade-in">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-6">Novedades</h1>

        <div className="space-y-4">
          {sorted.map((p: DevlogPost) => (
            <article
              key={p.slug}
              className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg sm:text-xl font-semibold">{p.title}</h2>
                <time className="text-xs sm:text-sm text-white/70">{formatDate(p.date)}</time>
              </div>
              <div className="mt-2 text-sm sm:text-base text-white/85">
                {p.summary
                    .split(/\r?\n\r?\n/)
                    .map((para, i) => (
                    <p key={i} className={i ? "mt-3" : ""}>{para}</p>
                    ))}
                </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
