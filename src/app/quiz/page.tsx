"use client";
import { useEffect, useMemo, useState } from "react";
import type { Matrix } from "@/lib/similarity";
import { scoreMembers } from "@/lib/similarity";

type Member = {
  id: string;
  name: string;
  country: string | null;
  group?: string | null;
  image?: string | null;
  photo?: string | null;
};

type VoteRef = { id: string; url?: string | null };

// Entrada flexible: admite (a) voteId/question y (b) id/q/title
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

// Esquema normalizado interno
type Question = {
  id: string;     // siempre el voteId real (p.ej. "176302")
  q: string;      // enunciado
  queSeVota?: string;
  aFavor?: string[];
  enContra?: string[];
  url?: string | null;
};

type Mode = "coverage" | "raw"; // "coverage" = más realista, "raw" = solo coincidencias

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [votesIdx, setVotesIdx] = useState<Record<string, VoteRef>>({});

  const [choices, setChoices] = useState<Record<string, number>>({}); // voteId -> +1|-1|0
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<Mode>("coverage"); // selector de modo

  // recordar desde qué pregunta se llegó a "Resultados"
  const [returnIndex, setReturnIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [qRaw, m, mat, votesEs] = await Promise.all([
        fetch("/data/questions.es.json").then(r => r.json()).catch(() => []),
        fetch("/data/members.enriched.json").then(r => r.json()).catch(() => []),
        fetch("/data/matrix.json").then(r => r.json()).catch(() => ({})),
        fetch("/data/votes_2025_main.es.json").then(r => r.json()).catch(() => []),
      ]);

      if (!alive) return;

      const vIdx: Record<string, VoteRef> = {};
      (votesEs as any[]).forEach(v => {
        vIdx[String(v.id)] = { id: String(v.id), url: v.url ?? null };
      });

      const normalized: Question[] = (qRaw as QuestionInput[])
        .map(x => {
          const idReal = String(x.voteId ?? x.id ?? "").trim();
          const qText = (x.question ?? x.q ?? x.title ?? "").toString().trim();
          if (!idReal || !qText) return null;

          const aFav = Array.isArray(x.aFavor)
            ? x.aFavor
            : (typeof x.aFavor === "string" && x.aFavor.trim() ? [x.aFavor] : []);
          const enC = Array.isArray(x.enContra)
            ? x.enContra
            : (typeof x.enContra === "string" && x.enContra.trim() ? [x.enContra] : []);

          return {
            id: idReal,
            q: qText,
            queSeVota: x.queSeVota,
            aFavor: aFav,
            enContra: enC,
            url: x.url ?? vIdx[idReal]?.url ?? null,
          } as Question;
        })
        .filter(Boolean) as Question[];

      const normalizedFiltered = normalized.filter(q => !!(mat as Matrix)[q.id]);
      const picked = shuffle(normalizedFiltered).slice(0, 10);

      setVotesIdx(vIdx);
      setQuestions(picked);
      setMembers(m);
      setMatrix(mat);
      setExpandedById({});
      setI(0);
      setDone(false);
    })();
    return () => { alive = false; };
  }, []);

  const total = questions.length;
  const current = questions[i];

  const answeredCount = useMemo(
    () => Object.keys(choices).filter(k => choices[k] !== undefined).length,
    [choices]
  );

  const progressPct = useMemo(
    () => (total ? Math.round((Math.min(answeredCount, total) / total) * 100) : 0),
    [answeredCount, total]
  );

  function pick(voteId: string, val: number) {
    setChoices(prev => ({ ...prev, [voteId]: val }));
    const nextIndex = i + 1;
    if (nextIndex < total) {
      setI(nextIndex);
    } else {
      setReturnIndex(i);
      setDone(true);
    }
  }

  function showResults() {
    setReturnIndex(i);
    setDone(true);
  }

  function back() {
    if (done && total > 0) {
      setDone(false);
      setI(Math.min(Math.max(returnIndex, 0), total - 1));
      return;
    }
    if (i > 0) setI(i - 1);
  }

  function gotoPrev() {
    if (i > 0) setI(i - 1);
  }
  function gotoNext() {
    if (i < total - 1) setI(i + 1);
  }

  // solo puntuamos votos que existan en matrix
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

  const mepById = (id: string) => members.find(m => m.id === id);
  const mepName = (id: string) => mepById(id)?.name || id;
  const mepGroup = (id: string) => mepById(id)?.group || "—";
  const mepImage = (id: string) => mepById(id)?.image ?? mepById(id)?.photo ?? null;

  if (!total) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center opacity-90">Cargando preguntas…</div>
      </main>
    );
  }

  // helpers para previews borrosas
  const prevQ = i > 0 ? questions[i - 1] : null;
  const nextQ = i < total - 1 ? questions[i + 1] : null;

  return (
    <main className="min-h-dvh flex flex-col p-6 relative">
      {/* Cabecera */}
      <header className="max-w-4xl w-full mx-auto mb-4 flex items-center justify-between">
        <div className="text-sm opacity-80">¿A qué eurodiputado me parezco?</div>
        <div className="text-sm font-medium">{answeredCount}/{total}</div>
      </header>

      {/* Progreso */}
      <div className="max-w-4xl w-full mx-auto mb-6">
        <div className="h-2 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-[#ffcc00] transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-right opacity-75">{progressPct}%</div>
      </div>

      {/* Contenido */}
      <section className="flex-1 grid place-items-center w-full relative">
        {/* RESULTADOS */}
        {done ? (
          <div className="w-full max-w-3xl fade-in">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">Tus resultados</h2>

              {/* Píldoras de modo */}
              <div
                role="tablist"
                aria-label="Modo de cálculo de afinidad"
                className="inline-flex rounded-xl overflow-hidden border border-white/20 bg-white/5"
              >
                <button
                  role="tab"
                  aria-selected={mode === "coverage"}
                  className={`px-3 py-1.5 text-sm transition ${
                    mode === "coverage"
                      ? "bg-[#ffcc00] text-black font-semibold"
                      : "hover:bg-white/10"
                  }`}
                  onClick={() => setMode("coverage")}
                >
                  Más realista
                </button>
                <button
                  role="tab"
                  aria-selected={mode === "raw"}
                  className={`px-3 py-1.5 text-sm transition ${
                    mode === "raw"
                      ? "bg-[#ffcc00] text-black font-semibold"
                      : "hover:bg-white/10"
                  }`}
                  onClick={() => setMode("raw")}
                >
                  Solo coincidencias
                </button>
              </div>
            </div>

            {Object.keys(filteredChoices).length < 5 && (
              <p className="text-center opacity-80">
                Responde al menos 5 preguntas para calcular afinidad.
              </p>
            )}

            {top.length > 0 && (() => {
              const top3 = top.slice(0, 3);

              const WinnerCard = ({ id, pct }: { id: string; pct: number }) => {
                const img = mepImage(id);
                return (
                  <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-[#003399]/40 to-[#001a66]/40 p-5 md:p-6">
                    <span className="absolute top-3 left-3 text-[10px] uppercase tracking-wider bg-[#ffcc00] text-black px-2 py-1 rounded-md font-semibold">
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
                        <div className="text-3xl md:text-5xl font-black leading-none">{pct}%</div>
                        <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1">afinidad</div>
                      </div>
                    </div>
                  </div>
                );
              };

              const SmallCard = ({ id, pct, place }: { id: string; pct: number; place: number }) => {
                const img = mepImage(id);
                return (
                  <div className="rounded-xl border border-white/15 bg-white/5 p-3 flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#ffcc00] text-black font-bold grid place-items-center text-xs">
                      {place}
                    </div>
                    {img ? (
                      <img
                        src={img}
                        alt={mepName(id)}
                        className="w-10 h-10 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 grid place-items-center">👤</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{mepName(id)}</div>
                      <div className="text-xs opacity-70 truncate">{mepGroup(id)}</div>
                    </div>
                    <div className="font-mono">{pct}%</div>
                  </div>
                );
              };

              return (
                <div className="space-y-4">
                  <WinnerCard id={top3[0].memberId} pct={Math.round(top3[0].affinity * 100)} />
                  <div className="grid sm:grid-cols-2 gap-3">
                    {top3[1] && (
                      <SmallCard
                        place={2}
                        id={top3[1].memberId}
                        pct={Math.round(top3[1].affinity * 100)}
                      />
                    )}
                    {top3[2] && (
                      <SmallCard
                        place={3}
                        id={top3[2].memberId}
                        pct={Math.round(top3[2].affinity * 100)}
                      />
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={back}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition"
              >
                Volver atrás
              </button>
              <a href="/" className="btn-eu">Ir a inicio</a>
            </div>
          </div>
        ) : (
          // PREGUNTA + TARJETA FIJA
          <div className="w-full max-w-3xl relative">
            {/* Enunciado FUERA del recuadro */}
            <div className="mb-3">
              <div className="text-sm opacity-80 mb-1">Pregunta {i + 1} de {total}</div>
              <h2 className="text-xl font-semibold">{current.q}</h2>
            </div>

            {/* Previews borrosos izquierda/derecha */}
            {prevQ && (
              <div
                className="hidden sm:block absolute -left-6 top-1/2 -translate-y-1/2 w-40 pointer-events-none select-none opacity-40 blur-[2px]"
                aria-hidden="true"
              >
                <div className="text-xs line-clamp-3">
                  {prevQ.q}
                </div>
              </div>
            )}
            {nextQ && (
              <div
                className="hidden sm:block absolute -right-6 top-1/2 -translate-y-1/2 w-40 text-right pointer-events-none select-none opacity-40 blur-[2px]"
                aria-hidden="true"
              >
                <div className="text-xs line-clamp-3">
                  {nextQ.q}
                </div>
              </div>
            )}

            {/* TARJETA FIJA (altura constante) */}
            <div className="relative">
              <div className="border border-white/20 rounded-2xl bg-white/5 backdrop-blur p-5 h-[360px] md:h-[380px] flex flex-col overflow-hidden">
                {/* Botones de voto */}
                <div className="grid sm:grid-cols-3 gap-3">
                  {([["A favor", 1], ["En contra", -1], ["Abstención", 0]] as const).map(
                    ([label, val]) => {
                      const isPressed = choices[current.id] === val;
                      const base =
                        val === 1
                          ? "bg-green-200/90 text-green-900"
                          : val === -1
                          ? "bg-red-200/90 text-red-900"
                          : "bg-gray-200/90 text-gray-900";
                      return (
                        <button
                          key={label}
                          className={`px-4 py-3 rounded-xl font-semibold hover:opacity-95 transition border ${
                            isPressed ? "ring-2 ring-offset-0 ring-[#ffcc00] border-white/0" : "border-transparent"
                          } ${base}`}
                          onClick={() => pick(current.id, val)}
                          aria-pressed={isPressed}
                        >
                          {label}
                        </button>
                      );
                    }
                  )}
                </div>

                {/* Botón "Más información" (negrita, sin subrayado/flecha) */}
                <button
                  className="mt-4 w-full text-sm font-bold hover:opacity-80"
                  onClick={() =>
                    setExpandedById(prev => ({ ...prev, [current.id]: !prev[current.id] }))
                  }
                  aria-expanded={!!expandedById[current.id]}
                  aria-controls={`more-info-${current.id}`}
                >
                  Más información
                </button>

                {/* Zona expandible scrollable dentro de la tarjeta fija */}
                {expandedById[current.id] && (
                  <div
                    id={`more-info-${current.id}`}
                    className="mt-3 border border-white/15 rounded-xl p-4 bg-white/5 overflow-auto"
                  >
                    {current.queSeVota && (
                      <>
                        <h3 className="font-medium mb-2">Qué se vota</h3>
                        <p className="text-sm opacity-90 whitespace-pre-line">{current.queSeVota}</p>
                      </>
                    )}

                    {(current.aFavor?.length || current.enContra?.length) ? (
                      <div className="mt-4 grid md:grid-cols-2 gap-4">
                        {current.aFavor?.length ? (
                          <div>
                            <h4 className="font-semibold mb-1">Argumentos a favor</h4>
                            <ul className="list-disc pl-4 text-sm opacity-90 space-y-2">
                              {current.aFavor.map((t, idx) => <li key={idx}>{t}</li>)}
                            </ul>
                          </div>
                        ) : null}
                        {current.enContra?.length ? (
                          <div>
                            <h4 className="font-semibold mb-1">Argumentos en contra</h4>
                            <ul className="list-disc pl-4 text-sm opacity-90 space-y-2">
                              {current.enContra.map((t, idx) => <li key={idx}>{t}</li>)}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {current.url && (
                      <div className="mt-3 text-sm">
                        <a
                          className="underline hover:opacity-80"
                          href={current.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Fuente oficial
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer fijo dentro de la tarjeta */}
                <div className="mt-auto pt-4 flex items-center justify-between">
                  <button
                    onClick={back}
                    disabled={i === 0}
                    className={`px-4 py-2 rounded-lg transition ${
                      i === 0 ? "bg-white/10 opacity-50 cursor-not-allowed" : "bg-white/10 hover:bg-white/15"
                    }`}
                  >
                    Volver atrás
                  </button>

                  <button onClick={showResults} className="btn-eu">
                    Ver resultados
                  </button>
                </div>
              </div>

              {/* Flechas laterales (botones circulares) */}
              <button
                aria-label="Pregunta anterior"
                onClick={gotoPrev}
                disabled={i === 0}
                className={`hidden md:flex items-center justify-center w-10 h-10 rounded-full
                  absolute -left-5 top-1/2 -translate-y-1/2 backdrop-blur bg-white/10 border border-white/20
                  hover:bg-white/20 transition ${i === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                ‹
              </button>
              <button
                aria-label="Pregunta siguiente"
                onClick={gotoNext}
                disabled={i === total - 1}
                className={`hidden md:flex items-center justify-center w-10 h-10 rounded-full
                  absolute -right-5 top-1/2 -translate-y-1/2 backdrop-blur bg-white/10 border border-white/20
                  hover:bg-white/20 transition ${i === total - 1 ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
