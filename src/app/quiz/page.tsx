"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Matrix } from "@/lib/similarity";
import { scoreMembers } from "@/lib/similarity";
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

  const [index, setIndex] = useState(0);
  const [entered, setEntered] = useState(false);
  const [done, setDone] = useState(false);

  const total = questions.length;
  const current = questions[index];

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

      requestAnimationFrame(() => setEntered(true));
    })();

    return () => {
      alive = false;
    };
  }, []);

  const progressPct = useMemo(() => {
    if (!total) return 0;
    const answered = Object.keys(choices).filter((k) => choices[k] !== undefined).length;
    return Math.round((Math.min(answered, total) / total) * 100);
  }, [choices, total]);

  const vote = (qId: string, val: number) => {
    setChoices((prev) => ({ ...prev, [qId]: val }));
    if (index < total - 1) setIndex((i) => i + 1);
  };

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
      <div className="max-w-5xl w-full mx-auto mb-4">
        <div className="h-2 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-[var(--eu-yellow)] transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Contenido */}
      <AnimatePresence mode="wait">
        {!done ? (
          <motion.section
            key={`q-${current.id}`}
            className="flex-1 w-full"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            {/* GRID con altura EXACTA para el bloque de título (no varía) */}
            <div
              className="
                max-w-5xl mx-auto 
                grid 
                grid-rows-[200px_auto] md:grid-rows-[240px_auto] lg:grid-rows-[280px_auto]
              "
            >
              {/* Fila 1: encabezado y título — fijo */}
              <div className="row-start-1 row-end-2 col-span-1">
                <div className="text-center">
                  <div className="text-sm opacity-80 mb-2">
                    Pregunta {index + 1} de {total}
                  </div>
                  <div className="h-full flex items-end justify-center">
                    <h2 className="text-2xl md:text-3xl font-semibold leading-snug text-center px-2">
                      {current.q}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Fila 2: RESPUESTAS — siempre a la misma altura */}
              <div className="row-start-2 row-end-3 col-span-1">
                {/* separador vertical extra sin tocar el título */}
                <div className="max-w-3xl mx-auto mt-14 md:mt-16">
                  <div className="rounded-2xl border border-white/20 bg-white/5 backdrop-blur shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-5 md:p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {([
                        ["A favor", 1, "bg-green-200/90 text-green-900"],
                        ["En contra", -1, "bg-red-200/90 text-red-900"],
                        ["Abstención", 0, "bg-gray-200/90 text-gray-900"],
                      ] as const).map(([label, val, base]) => {
                        const pressed = choices[current.id] === val;
                        return (
                          <button
                            key={label}
                            className={`px-4 py-3 rounded-xl text-sm md:text-base font-semibold border cursor-pointer ${base} ${
                              pressed
                                ? "ring-2 ring-offset-0 ring-[var(--eu-yellow)] border-transparent"
                                : "border-transparent"
                            }`}
                            onClick={() => vote(current.id, val)}
                            aria-pressed={pressed}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <InfoDialog q={current} />
                      <div className="text-xs md:text-sm opacity-70">
                        {choices[current.id] !== undefined
                          ? "Podés modificar tu respuesta"
                          : "Elegí una opción"}
                      </div>
                    </div>
                  </div>

                  <div className="h-[140px]" />
                </div>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="results"
            className="flex-1 grid place-items-center w-full"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            <div className="w-full max-w-3xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold">Tus resultados</h2>

                {/* Tabs con transición del contenido */}
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
                      className={`px-3 py-1.5 text-sm cursor-pointer ${
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

              {/* Contenido con slide al cambiar de modo */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  {(() => {
                    const top3 = top.slice(0, 3);
                    const pct = (x: number) => Number((x * 100).toFixed(2));

                    const WinnerCard = ({ id, p }: { id: string; p: number }) => {
                      const img = mepImage(id);
                      return (
                        <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-[#003399]/40 to-[#001a66]/40 p-5 md:p-6">
                          <span className="absolute top-3 left-3 text-[10px] uppercase tracking-wider bg-[var(--eu-yellow)] text-black px-2 py-1 rounded-md font-semibold">
                            Tu mejor coincidencia
                          </span>
                          <div className="flex items-center gap-4 md:gap-5">
                            {img ? (
                              <img
                                src={img}
                                alt={mepName(id)}
                                className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover ring-2 ring-white/40"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/10 grid place-items-center text-3xl">
                                👤
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="text-xl md:text-2xl font-bold leading-tight">{mepName(id)}</div>
                              <div className="text-xs md:text-sm opacity-75">{mepGroup(id)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl md:text-5xl font-black leading-none">{p.toFixed(2)}%</div>
                              <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1">afinidad</div>
                            </div>
                          </div>
                        </div>
                      );
                    };

                    const SmallCard = ({ id, p, place }: { id: string; p: number; place: number }) => {
                      const img = mepImage(id);
                      return (
                        <div className="rounded-xl border border-white/15 bg-white/5 p-3 flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-[var(--eu-yellow)] text-black font-bold grid place-items-center text-xs">
                            {place}
                          </div>
                          {img ? (
                            <img src={img} alt={mepName(id)} className="w-10 h-10 rounded-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-white/10 grid place-items-center">👤</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{mepName(id)}</div>
                            <div className="text-xs opacity-70 truncate">{mepGroup(id)}</div>
                          </div>
                          <div className="font-mono">{p.toFixed(2)}%</div>
                        </div>
                      );
                    };

                    return top.length > 0 ? (
                      <div className="space-y-4">
                        <WinnerCard id={top3[0].memberId} p={pct(top3[0].affinity)} />
                        <div className="grid sm:grid-cols-2 gap-3">
                          {top3[1] && <SmallCard place={2} id={top3[1].memberId} p={pct(top3[1].affinity)} />}
                          {top3[2] && <SmallCard place={3} id={top3[2].memberId} p={pct(top3[2].affinity)} />}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </motion.div>
              </AnimatePresence>

              <div className="h-[140px]" />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Botonera inferior fija — SIEMPRE visible */}
      <div className="fixed left-1/2 -translate-x-1/2 bottom-8 w-[92%] max-w-3xl flex items-center justify-between z-20">
        <button
          onClick={() => {
            if (done) {
              setDone(false); // volver del resultado al cuestionario
              return;
            }
            setIndex((i) => Math.max(0, i - 1));
          }}
          disabled={!questions.length || (index === 0 && !done)}
          className={`px-4 py-2 rounded-lg ${
            !questions.length || (index === 0 && !done)
              ? "bg-white/10 opacity-50 cursor-not-allowed"
              : "bg-white/10 cursor-pointer"
          }`}
        >
          Volver atrás
        </button>
        <button
          onClick={() => setDone(true)}
          className={`px-4 py-2 rounded-lg bg-[var(--eu-yellow)] text-black font-semibold ${
            done ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
          }`}
          disabled={done}
        >
          Ver resultados
        </button>
      </div>
    </main>
  );
}

/* ====================== Componentes auxiliares ====================== */

function InfoDialog({ q }: { q: Question }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/80 text-black cursor-pointer">
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
              <a className="underline hover:opacity-80 cursor-pointer" href={q.url!} target="_blank" rel="noreferrer">
                Fuente oficial
              </a>
            </div>
          )}

          <Dialog.Close asChild>
            <button
              className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/90 text-black cursor-pointer"
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
