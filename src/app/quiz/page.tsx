"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Matrix } from "@/lib/similarity";
import { scoreMembers } from "@/lib/similarity";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaCarouselType } from "embla-carousel";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";

/* ====================== Tipos ====================== */
type Member = {
  id: string;
  name: string;
  country: string | null;
  group?: string | null;
  image?: string | null;
  photo?: string | null;
};

type QuestionInput = {
  id?: string;
  voteId?: string | number;
  q?: string;
  question?: string;
  title?: string;
  queSeVota?: string;
  aFavor?: string | string[];
  enContra?: string | string[];
  url?: string | null;
};
type Question = {
  id: string;
  q: string;
  queSeVota?: string;
  aFavor?: string[];
  enContra?: string[];
  url?: string | null;
};

type Mode = "coverage" | "raw";

/* ====================== Utils ====================== */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ====================== Página ====================== */
export default function QuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode>("coverage");

  // ==== Embla: viewport y slide width en PX (NO vw)
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [slideW, setSlideW] = useState(0); // anchura exacta de cada slide en px

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "center",
    containScroll: "trimSnaps",
    inViewThreshold: 0.6,
    skipSnaps: false,
    startIndex: 0,
  });

  // Pasar ref del viewport a Embla y guardarlo para medir
  const setViewport = useCallback(
    (el: HTMLDivElement | null) => {
      viewportRef.current = el;
      emblaRef(el as any);
    },
    [emblaRef]
  );

  // Recalcular anchura de slide usando el ancho REAL del viewport (clientWidth)
  const recalcSlideWidth = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    // Queremos el mismo diseño que tenías: 86% del viewport con tope 48rem.
    // Pero lo calculamos en PX sobre clientWidth, no sobre 'vw'.
    const MAX = 768; // 48rem
    const target = Math.min(vp.clientWidth * 0.86, MAX);
    setSlideW(Math.round(target));
  }, []);

  useEffect(() => {
    recalcSlideWidth();
    const onResize = () => recalcSlideWidth();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recalcSlideWidth]);

  // Vuelve a inicializar Embla cuando cambia slideW para que recalcule snaps
  useEffect(() => {
    if (!emblaApi || !slideW) return;
    emblaApi.reInit();
    // Coloca al inicio sin animación en el siguiente frame
    requestAnimationFrame(() => emblaApi.scrollTo(0, true));
  }, [emblaApi, slideW]);

  const [index, setIndex] = useState(0);
  const total = questions.length;

  // UI / resultados
  const [entered, setEntered] = useState(false);
  const [done, setDone] = useState(false);
  const [returnIndex, setReturnIndex] = useState(0);

  // Cargar data
  useEffect(() => {
    let alive = true;
    (async () => {
      const [qRaw, m, mat] = await Promise.all([
        fetch("/data/questions.es.json").then((r) => r.json()).catch(() => []),
        fetch("/data/members.enriched.json").then((r) => r.json()).catch(() => []),
        fetch("/data/matrix.json").then((r) => r.json()).catch(() => ({})),
      ]);
      if (!alive) return;

      const normalized: Question[] = (qRaw as QuestionInput[])
        .map((x) => {
          const idReal = String(x.voteId ?? x.id ?? "").trim();
          const qText = (x.question ?? x.q ?? x.title ?? "").toString().trim();
          if (!idReal || !qText) return null;
          const aFav = Array.isArray(x.aFavor)
            ? x.aFavor
            : typeof x.aFavor === "string" && x.aFavor.trim()
            ? [x.aFavor]
            : [];
          const enC = Array.isArray(x.enContra)
            ? x.enContra
            : typeof x.enContra === "string" && x.enContra.trim()
            ? [x.enContra]
            : [];
          return {
            id: idReal,
            q: qText,
            queSeVota: x.queSeVota,
            aFavor: aFav,
            enContra: enC,
            url: x.url ?? null,
          } as Question;
        })
        .filter(Boolean) as Question[];

      const filtered = normalized.filter((q) => !!(mat as Matrix)[q.id]);
      const picked = shuffle(filtered).slice(0, 10);

      setQuestions(picked);
      setMembers(m);
      setMatrix(mat);
      setChoices({});
      setIndex(0);
      setDone(false);

      // asegura cálculos de layout antes de animar
      requestAnimationFrame(() => {
        recalcSlideWidth();
        setEntered(true);
      });
    })();

    return () => {
      alive = false;
    };
  }, [recalcSlideWidth]);

  // Sincronizar índice con Embla
  const onSelect = useCallback((api: EmblaCarouselType) => {
    setIndex(api.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", () => onSelect(emblaApi));
    emblaApi.on("reInit", () => onSelect(emblaApi));
    // Centrar 1ª slide al montar
    emblaApi.scrollTo(0, true);
    setTimeout(() => emblaApi.scrollTo(0, true), 0);
  }, [emblaApi, onSelect]);

  // Navegación determinista
  const goTo = useCallback(
    (next: number, jump = false) => {
      if (!emblaApi) {
        setIndex(Math.max(0, Math.min(next, total - 1)));
        return;
      }
      const clamped = Math.max(0, Math.min(next, total - 1));
      emblaApi.scrollTo(clamped, jump);
    },
    [emblaApi, total]
  );

  const progressPct = useMemo(() => {
    if (!total) return 0;
    const answered = Object.keys(choices).filter((k) => choices[k] !== undefined).length;
    return Math.round((Math.min(answered, total) / total) * 100);
  }, [choices, total]);

  // Guardar voto y avanzar
  const vote = (qId: string, val: number) => {
    setChoices((prev) => ({ ...prev, [qId]: val }));
    const nextIndex = index + 1;
    if (nextIndex < total) {
      goTo(nextIndex);
    } else {
      setReturnIndex(index);
      setDone(true);
    }
  };

  // Resultados
  const filteredChoices = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [voteId, val] of Object.entries(choices)) {
      if (matrix[voteId]) out[voteId] = val;
    }
    return out;
  }, [choices, matrix]);

  const top = useMemo(() => {
    if (!done) return [];
    if (Object.keys(filteredChoices).length < 5) return [];
    return scoreMembers(filteredChoices, matrix, {
      coveragePenalty: mode === "coverage",
      minOverlap: 5,
    }).slice(0, 10);
  }, [done, filteredChoices, matrix, mode]);

  // Helpers MEP
  const mepById = (id: string) => members.find((m) => m.id === id);
  const mepName = (id: string) => mepById(id)?.name || id;
  const mepGroup = (id: string) => mepById(id)?.group || "—";
  const mepImage = (id: string) => mepById(id)?.image ?? mepById(id)?.photo ?? null;

  if (!total) {
    return (
      <main className="min-h-dvh grid place-items-center p-6">
        <div className="text-center opacity-90">Cargando preguntas…</div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-dvh flex flex-col p-6 relative transition-opacity duration-500 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Cabecera */}
      <header className="max-w-5xl w-full mx-auto mb-2 flex items-center justify-between">
        <div className="text-sm opacity-80">¿A qué eurodiputado me parezco?</div>
        <div className="text-sm font-medium">
          {Object.keys(choices).length}/{total}
        </div>
      </header>

      {/* Progreso */}
      <div className="max-w-5xl w-full mx-auto mb-2">
        <div className="h-2 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-[var(--eu-yellow)] transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {!done && (
        <div className="max-w-5xl w-full mx-auto text-center mt-2 mb-4">
          <div className="text-sm opacity-80">
            Pregunta {index + 1} de {total}
          </div>
        </div>
      )}

      {/* Contenido */}
      <AnimatePresence mode="wait">
        {!done ? (
          <motion.section
            key="quiz"
            className="relative flex-1 w-full"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {/* Flechas fijas */}
            <button
              aria-label="Pregunta anterior"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              className={`hidden md:flex items-center justify-center w-12 h-12 rounded-full
                fixed left-6 top-1/2 -translate-y-1/2 backdrop-blur bg-white/10 border border-white/20
                hover:bg-white/20 transition z-20 ${index === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              ‹
            </button>
            <button
              aria-label="Pregunta siguiente"
              onClick={() => goTo(index + 1)}
              disabled={index === total - 1}
              className={`hidden md:flex items-center justify-center w-12 h-12 rounded-full
                fixed right-6 top-1/2 -translate-y-1/2 backdrop-blur bg-white/10 border border-white/20
                hover:bg-white/20 transition z-20 ${index === total - 1 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              ›
            </button>

            {/* Viewport Embla full-bleed */}
            <div
              className="overflow-hidden"
              style={{
                width: "100vw",
                marginLeft: "calc(50% - 50vw)",
                marginRight: "calc(50% - 50vw)",
              }}
              ref={setViewport}
            >
              {/* Track sin gap (para no afectar snaps) */}
              <div className="flex items-stretch py-4">
                {questions.map((q, idx) => {
                  const active = idx === index;
                  const answered = choices[q.id] !== undefined;

                  return (
                    // La slide tiene ancho EXACTO en PX -> Embla centra siempre.
                    <div
                      key={q.id}
                      className={`flex-none select-none transition-all duration-300 ${
                        active ? "opacity-100 scale-100" : "opacity-35 scale-[0.97]"
                      }`}
                      style={{ flex: `0 0 ${slideW || 1}px` }}
                      aria-hidden={!active}
                    >
                      {/* Wrapper interior solo para espaciado visual, NO afecta snap */}
                      <div className="mx-6 md:mx-10">
                        {/* Enunciado */}
                        <h2 className="text-2xl md:text-3xl font-semibold text-center leading-snug mb-4">
                          {q.q}
                        </h2>

                        {/* Tarjeta de acciones */}
                        <div className="rounded-2xl border border-white/20 bg-white/5 backdrop-blur shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-5 md:p-6">
                          <div className="grid grid-cols-3 gap-3">
                            {([
                              ["A favor", 1, "bg-green-200/90 text-green-900"],
                              ["En contra", -1, "bg-red-200/90 text-red-900"],
                              ["Abstención", 0, "bg-gray-200/90 text-gray-900"],
                            ] as const).map(([label, val, base]) => {
                              const pressed = choices[q.id] === val;
                              return (
                                <button
                                  key={label}
                                  className={`px-4 py-3 rounded-xl text-sm md:text-base font-semibold hover:opacity-95 transition border ${base} ${
                                    pressed
                                      ? "ring-2 ring-offset-0 ring-[var(--eu-yellow)] border-transparent"
                                      : "border-transparent"
                                  }`}
                                  onClick={() => vote(q.id, val)}
                                  aria-pressed={pressed}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <InfoDialog q={q} />
                            <div className="text-xs md:text-sm opacity-70">
                              {answered ? "Podés modificar tu respuesta" : "Elegí una opción"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Botonera inferior fijada */}
            <div className="fixed left-1/2 -translate-x-1/2 bottom-10 w-[92%] max-w-3xl flex items-center justify-between z-20">
              <button
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className={`px-4 py-2 rounded-lg transition ${
                  index === 0 ? "bg-white/10 opacity-50 cursor-not-allowed" : "bg-white/10 hover:bg-white/15"
                }`}
              >
                Volver atrás
              </button>
              <button onClick={() => setDone(true)} className="btn-eu">
                Ver resultados
              </button>
            </div>

            <div className="h-[160px]" />
          </motion.section>
        ) : (
          <motion.section
            key="results"
            className="flex-1 grid place-items-center w-full"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <div className="w-full max-w-3xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold">Tus resultados</h2>

                {/* Píldoras de modo */}
                <div
                  role="tablist"
                  aria-label="Modo de cálculo de afinidad"
                  className="inline-flex rounded-xl overflow-hidden border border-white/20 bg-white/5"
                >
                  {(["coverage", "raw"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => setMode(m)}
                      className={`px-3 py-1.5 text-sm transition ${
                        mode === m ? "bg-[var(--eu-yellow)] text-black font-semibold" : "hover:bg-white/10"
                      }`}
                    >
                      {m === "coverage" ? "Más realista" : "Solo coincidencias"}
                    </button>
                  ))}
                </div>
              </div>

              {Object.keys(filteredChoices).length < 5 && (
                <p className="text-center opacity-80">Responde al menos 5 preguntas para calcular afinidad.</p>
              )}

              {/* render de tarjetas como lo tenías (omitido por brevedad) */}

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => {
                    setDone(false);
                    goTo(Math.min(Math.max(returnIndex, 0), total - 1), true);
                  }}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition"
                >
                  Volver atrás
                </button>
                <a href="/" className="btn-eu">
                  Ir a inicio
                </a>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

/* ====================== Componentes auxiliares ====================== */

function InfoDialog({ q }: { q: Question }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/80 text-black hover:bg-white transition">
          Más información
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 w-[min(92vw,680px)] -translate-x-1/2 -translate-y-1/2
                     rounded-2xl border border-white/20 bg-[#0b1d5f]/80 text-white p-5 md:p-6
                     shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
        >
          <Dialog.Title className="text-lg md:text-xl font-semibold mb-2">Qué se vota</Dialog.Title>
          {q.queSeVota ? (
            <p className="text-sm opacity-90 whitespace-pre-line">{q.queSeVota}</p>
          ) : (
            <p className="text-sm opacity-70">No hay descripción disponible.</p>
          )}

          {(q.aFavor?.length || q.enContra?.length) ? (
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              {q.aFavor?.length ? (
                <div>
                  <h4 className="font-semibold mb-1">Argumentos a favor</h4>
                  <ul className="list-disc pl-4 text-sm opacity-90 space-y-2">
                    {q.aFavor.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {q.enContra?.length ? (
                <div>
                  <h4 className="font-semibold mb-1">Argumentos en contra</h4>
                  <ul className="list-disc pl-4 text-sm opacity-90 space-y-2">
                    {q.enContra.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {q.url && (
            <div className="mt-4 text-sm">
              <a className="underline hover:opacity-80" href={q.url!} target="_blank" rel="noreferrer">
                Fuente oficial
              </a>
            </div>
          )}

          <Dialog.Close asChild>
            <button
              className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/90 text-black hover:bg-white"
              aria-label="Cerrar"
            >
              Cerrar
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
