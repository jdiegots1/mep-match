"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";

export default function Page() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-eu">
      <div className="text-center max-w-2xl px-6">
        <div className={`mx-auto mb-8 sm:mb-10 ${mounted ? "fade-in" : "opacity-0"}`}>
          <Image
            src="/logo.png"
            alt="Logo de MEP Match"
            width={4134}
            height={2362}
            priority
            sizes="(min-width:1280px) 20rem, (min-width:1024px) 18rem, (min-width:640px) 14rem, 10rem"
            className="mx-auto h-auto w-40 sm:w-56 md:w-72 lg:w-80 object-contain"
          />
        </div>

        <h1
          className={`text-2xl sm:text-4xl font-extrabold tracking-tight ${
            mounted ? "fade-in fade-in-1" : "opacity-0"
          } mb-6 sm:mb-8`}
        >
          ¿Con qué <span className="text-[#ffcc00]">eurodiputados</span> te alineas más?
        </h1>

        <div
          aria-hidden
          className={`mx-auto h-[2px] rounded-full bg-white/40 transition-[width,opacity] duration-700 ease-out mb-8 sm:mb-10 ${
            mounted ? "w-64 sm:w-96 md:w-[36rem] opacity-100" : "w-0 opacity-0"
          }`}
        />

        <p
          className={`text-sm sm:text-base text-white/80 leading-relaxed ${
            mounted ? "fade-in fade-in-2" : "opacity-0"
          } mt-6 sm:mt-8`}
        >
          Responde a votaciones reales del Parlamento Europeo y descubre con quién coincides más.
        </p>

        <div className={`mt-10 sm:mt-12 ${mounted ? "fade-in fade-in-3" : "opacity-0"}`}>
          <button
            className="btn-eu text-base sm:text-lg cursor-pointer"
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
