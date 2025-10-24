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

type Question = {
  qid?: string;
  id: string;            // debe existir en matrix.json
  q?: string;            // enunciado (questions.es.json)
  title?: string;        // fallback si viniera de votes_2025_main.es.json
  queSeVota?: string;
  aFavor?: string;
  enContra?: string;
  url?: string | null;
};

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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [q, m, mat, votesEs] = await Promise.all([
        fetch("/data/questions.es.json").then(r => r.json()).catch(() => []),
        fetch("/data/members.enriched.json").then(r => r.json()).catch(() => []),
        fetch("/data/matrix.json").then(r => r.json()).catch(() => ({})),
        fetch("/data/votes_2025_main.es.json").then(r => r.json()).catch(() => []),
      ]);

      if (!alive) return;

      // índice para url oficial
      const vIdx: Record<string, VoteRef> = {};
      (votesEs as any[]).forEach(v => {
        vIdx[String(v.id)] = { id: String(v.id), url: v.url ?? null };
      });

      // normaliza y completa url si falta
      const normalized = (q as Question[])
        .map(x => {
          const id = String(x.id ?? "").trim();
          return {
            ...x,
            id,
            url: x.url ?? vIdx[id]?.url ?? null,
          };
        })
        .filter(x => x.id);

      // baraja y toma 10
      const picked = shuffle(normalized).slice(0, 10);

      setVotesIdx(vIdx);
      setQuestions(picked);
      setMembers(m);
      setMatrix(mat);

      // debug mínimo en consola por si falta algo
      console.log("[quiz] loaded", {
        questions: picked.length,
        members: (m as any[]).length,
        votesInMatrix: Object.keys(mat || {}).length,
      });
    })();
    return () => { alive = false; };
  }, []);

  const total = questions.length;
  const current = questions[i];

  // enunciado con fallback
  const questionText = current ? (current.q || current.title || "(sin texto)") : "";

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
      setExpanded(false);
    } else {
      setDone(true);
    }
  }

  function back() {
    if (done && total > 0) {
      setDone(false);
      setI(total - 1);
      setExpanded(false);
      return;
    }
    if (i > 0) {
      setI(i - 1);
      setExpanded(false);
    }
  }

  // solo puntuamos con votos que existan en matrix
  const filteredChoices = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [voteId, val] of Object.entries(choices)) {
      if (matrix[voteId]) out[voteId] = val;
    }
    return out;
  }, [choices, matrix]);

  // resultados solo al final
  const top = useMemo(() => {
    if (!done) return [];
    // exige al menos 5 respuestas válidas para evitar ruido
    if (Object.keys(filteredChoices).length < 5) return [];
    return scoreMembers(filteredChoices, matrix).slice(0, 10);
  }, [done, filteredChoices, matrix]);

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

  return (
    <main className="min-h-dvh flex flex-col p-6">
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
      <section className="flex-1 grid place-items-center">
        {/* RESULTADOS */}
        {done ? (
          <div className="w-full max-w-3xl fade-in">
            <h2 className="text-2xl font-bold text-center mb-4">Tus resultados</h2>

            {Object.keys(filteredChoices).length < 5 && (
              <p className="text-center opacity-80">
                Responde al menos 5 preguntas para calcular afinidad.
              </p>
            )}

            {top.length > 0 && (
              <ul className="space-y-2">
                {top.map(r => {
                  const img = mepImage(r.memberId);
                  return (
                    <li
                      key={r.memberId}
                      className="border border-white/20 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {img && (
                          <img
                            src={img}
                            alt={mepName(r.memberId)}
                            className="w-10 h-10 rounded-full object-cover"
                            loading="lazy"
                          />
                        )}
                        <div>
                          <div className="font-medium">{mepName(r.memberId)}</div>
                          <div className="text-xs opacity-70">{mepGroup(r.memberId)}</div>
                        </div>
                      </div>
                      <span className="font-mono">{Math.round(r.affinity * 100)}%</span>
                    </li>
                  );
                })}
              </ul>
            )}

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
          // PREGUNTA actual
          <div className="w-full max-w-3xl fade-in">
            <div className="border border-white/20 rounded-2xl p-5 bg-white/5 backdrop-blur">
              <div className="text-sm opacity-80 mb-1">
                Pregunta {i + 1} de {total}
              </div>

              {/* ENUNCIADO con fallback */}
              <h2 className="text-xl font-semibold">
                {questionText}
              </h2>

              <div className="mt-5 grid sm:grid-cols-3 gap-3">
                {([["A favor", 1], ["En contra", -1], ["Abstención", 0]] as const).map(
                  ([label, val]) => {
                    const isActive = choices[current.id] === val;
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
                          isActive ? "ring-2 ring-offset-0 ring-[#ffcc00] border-white/0" : "border-transparent"
                        } ${base}`}
                        onClick={() => pick(current.id, val)}
                        aria-pressed={isActive}
                      >
                        {label}
                      </button>
                    );
                  }
                )}
              </div>

              {/* Toggle “Más información” */}
              <button
                className="mt-4 w-full flex items-center justify-center gap-2 text-sm underline hover:opacity-80"
                onClick={() => setExpanded(e => !e)}
                aria-expanded={expanded}
                aria-controls="more-info"
              >
                <span
                  className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  ▼
                </span>
                Más información
              </button>

              {expanded && (
                <div id="more-info" className="mt-4 border border-white/15 rounded-xl p-4 bg-white/5">
                  {current.queSeVota && (
                    <>
                      <h3 className="font-medium mb-2">Qué se vota</h3>
                      <p className="text-sm opacity-90 whitespace-pre-line">{current.queSeVota}</p>
                    </>
                  )}

                  {(current.aFavor || current.enContra) && (
                    <div className="mt-4 grid md:grid-cols-2 gap-4">
                      {current.aFavor && (
                        <div>
                          <h4 className="font-semibold mb-1">Argumentos a favor</h4>
                          <p className="text-sm opacity-90 whitespace-pre-line">{current.aFavor}</p>
                        </div>
                      )}
                      {current.enContra && (
                        <div>
                          <h4 className="font-semibold mb-1">Argumentos en contra</h4>
                          <p className="text-sm opacity-90 whitespace-pre-line">{current.enContra}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {(current.url ?? votesIdx[current.id]?.url) && (
                    <div className="mt-3 text-sm">
                      <a
                        className="underline hover:opacity-80"
                        href={(current.url ?? votesIdx[current.id]?.url)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Fuente oficial
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={back}
                  disabled={i === 0}
                  className={`px-4 py-2 rounded-lg transition ${
                    i === 0 ? "bg-white/10 opacity-50 cursor-not-allowed" : "bg-white/10 hover:bg-white/15"
                  }`}
                >
                  Volver atrás
                </button>

                <button onClick={() => setDone(true)} className="btn-eu">
                  Ver resultados
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
