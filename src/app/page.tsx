"use client";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();

  return (
    <main className="min-h-dvh flex items-center justify-center">
      <div className="text-center max-w-2xl px-6">
        <div className="mx-auto mb-6 fade-in">
          <div className="w-14 h-14 rounded-full border-4 border-[#ffcc00] mx-auto grid place-items-center">
            <span className="text-[#ffcc00] text-xl">★</span>
          </div>
        </div>

        <h1 className="fade-in fade-in-1 text-3xl sm:text-5xl font-extrabold tracking-tight">
          ¿A qué <span className="text-[#ffcc00]">eurodiputado</span> me parezco?
        </h1>

        <p className="fade-in fade-in-2 mt-4 text-base sm:text-lg text-white/80">
          Responde a votaciones reales del Parlamento Europeo y descubre con quién
          coincides más. Datos abiertos de HowTheyVote.eu.
        </p>

        <div className="fade-in fade-in-3 mt-8">
          <button
            className="btn-eu text-base sm:text-lg"
            onClick={() => router.push("/quiz")}
            aria-label="Empezar"
          >
            Empezar
          </button>
        </div>
      </div>
    </main>
  );
}
