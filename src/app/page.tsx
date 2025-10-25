"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Page() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-eu">
      <div className="text-center max-w-2xl px-6">
        {/* Isotipo / estrella */}
        <div className={`mx-auto mb-6 ${mounted ? "fade-in" : "opacity-0"}`}>
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-[#ffcc00] mx-auto grid place-items-center shadow-lg">
            <span className="text-[#ffcc00] text-2xl sm:text-3xl" aria-hidden>
              ★
            </span>
          </div>
        </div>

        {/* Título */}
        <h1
          className={`text-3xl sm:text-5xl font-extrabold tracking-tight ${mounted ? "fade-in fade-in-1" : "opacity-0"}`}
        >
          ¿A qué <span className="text-[#ffcc00]">eurodiputado</span> me parezco?
        </h1>

        {/* Subtítulo */}
        <p
          className={`mt-4 text-base sm:text-lg text-white/80 ${mounted ? "fade-in fade-in-2" : "opacity-0"}`}
        >
          Responde a votaciones reales del Parlamento Europeo y descubre con quién
          coincides más. Datos abiertos de HowTheyVote.eu.
        </p>

        {/* CTA */}
        <div className={`mt-8 ${mounted ? "fade-in fade-in-3" : "opacity-0"}`}>
          <button
            className="btn-eu text-base sm:text-lg"
            onClick={() => router.push("/quiz")}
            aria-label="Empezar el cuestionario"
          >
            Empezar
          </button>
        </div>
      </div>
    </main>
  );
}
