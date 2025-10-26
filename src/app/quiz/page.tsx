"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Matrix } from "@/lib/similarity";
import { scoreMembers } from "@/lib/similarity";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

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

const labelFromVal = (v: number | undefined) =>
  v === 1 ? "A favor" : v === -1 ? "En contra" : v === 0 ? "Abstención" : "Ausente";
const colorFromVal = (v: number | undefined) =>
  v === 1
    ? "bg-green-600"
    : v === -1
    ? "bg-red-600"
    : v === 0
    ? "bg-amber-500"
    : "bg-gray-500";

/* ====================== Página ====================== */
export default function QuizPage() {
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<Mode>("coverage");

  const [index, setIndex] = useState(0);
  const [entered, setEntered] = useState(false);
  const [done, setDone] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Carga real
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0); // 0..1

  // hover para atenuar otras opciones
  const [hoverVal, setHoverVal] = useState<number | null>(null);

  // ranking
  const [search, setSearch] = useState("");
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(10);
  const rankingRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setShowCount(10), [search]);

  const total = questions.length;
  const current = questions[index];

  // Cargar data con progreso
  useEffect(() => {
    let alive = true;

    const smoothTo = (target: number) => {
      setProgress((prev) => (target < prev ? prev : target));
    };

    (async () => {
      try {
        smoothTo(0.1);

        // Preguntas (33%)
        const qRaw: QuestionInput[] =
          (await fetch("/data/questions.es.json").then((r) => r.json()).catch(() => [])) ?? [];
        alive && smoothTo(0.33);

        // Miembros (66%)
        const m: Member[] =
          (await fetch("/data/members.enriched.json").then((r) => r.json()).catch(() => [])) ?? [];
        alive && smoothTo(0.66);

        // Matriz (100%)
        const mat: Matrix =
          (await fetch("/data/matrix.json").then((r) => r.json()).catch(() => ({}))) ?? {};
        alive && smoothTo(1);

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

        // Solo preguntas presentes en la matriz
        const filtered = normalized.filter((q) => !!(mat as Matrix)[q.id]);
        const picked = shuffle(filtered).slice(0, 10);

        setQuestions(picked);
        setMembers(m);
        setMatrix(mat);
        setChoices({});
        setIndex(0);
        setDone(false);

        requestAnimationFrame(() => setEntered(true));
      } finally {
        // pequeña espera para que la barra llegue visualmente al 100%
        setTimeout(() => alive && setLoading(false), 150);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // progreso por posición
  const progressPct = useMemo(() => {
    if (!total) return 0;
    const pos = Math.min(index + 1, total);
    return Math.round((pos / total) * 100);
  }, [index, total]);

  const vote = (qId: string, val: number) => {
    setChoices((prev) => ({ ...prev, [qId]: val }));
    setHoverVal(null);
    if (index < total - 1) setIndex((i) => i + 1);
    else setDone(true); // total=10 ⇒ ≥5 seguro
  };

  const filteredChoices = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [voteId, val] of Object.entries(choices)) {
      if (matrix[voteId]) out[voteId] = val;
    }
    return out;
  }, [choices, matrix]);

  const answeredCount = useMemo(() => Object.keys(filteredChoices).length, [filteredChoices]);
  const minRequired = 5;
  const remaining = Math.max(0, minRequired - answeredCount);

  const computeScores = useMemo(() => {
    if (answeredCount < minRequired) return [];
    return scoreMembers(filteredChoices, matrix, {
      coveragePenalty: mode === "coverage",
      minOverlap: minRequired,
    }); // desc
  }, [filteredChoices, matrix, mode, answeredCount]);

  const top = useMemo(() => (done ? computeScores.slice(0, 10) : []), [done, computeScores]);

  // IDs presentes en la matriz
  const allMemberIds = useMemo(() => {
    const set = new Set<string>();
    Object.values(matrix).forEach((row) => {
      if (row && typeof row === "object") {
        Object.keys(row as Record<string, number | undefined>).forEach((mid) => set.add(mid));
      }
    });
    return Array.from(set).filter((id) => members.some((m) => m.id === id));
  }, [matrix, members]);

  // Mapa de afinidad por MEP
  const scoreMap = useMemo(() => {
    const map = new Map<string, number>();
    computeScores.forEach((s) => map.set(s.memberId, s.affinity));
    return map;
  }, [computeScores]);

  // Base global ordenada por afinidad
  const globalBase = useMemo(() => {
    const list = allMemberIds.map((id) => ({
      memberId: id,
      affinity: scoreMap.get(id) ?? 0,
      m: members.find((mm) => mm.id === id),
    }));
    list.sort((a, b) => b.affinity - a.affinity);
    return list;
  }, [allMemberIds, scoreMap, members]);

  // Posición global comprimida
  const globalPosMap = useMemo(() => {
    let lastPct: number | null = null;
    let rank = 0;
    const m = new Map<string, number>();
    globalBase.forEach((s) => {
      const pct = Number((s.affinity * 100).toFixed(2));
      if (lastPct === null || pct !== lastPct) {
        rank += 1;
        lastPct = pct;
      }
      m.set(s.memberId, rank);
    });
    return m;
  }, [globalBase]);

  // Posición por país
  const countryPosMap = useMemo(() => {
    const map = new Map<string, number>();
    const byCountry = new Map<string, typeof globalBase>();
    globalBase.forEach((item) => {
      const c = item.m?.country ?? "—";
      if (!byCountry.has(c)) byCountry.set(c, []);
      byCountry.get(c)!.push(item);
    });
    for (const [, arr] of byCountry) {
      let lastPct: number | null = null;
      let rank = 0;
      arr.forEach((s) => {
        const pct = Number((s.affinity * 100).toFixed(2));
        if (lastPct === null || pct !== lastPct) {
          rank += 1;
          lastPct = pct;
        }
        map.set(s.memberId, rank);
      });
    }
    return map;
  }, [globalBase]);

  // Ranking final
  const rankedAll = useMemo(() => {
    if (!done) return [];

    const q = search.trim().toLowerCase();

    let base = globalBase.map(({ memberId, affinity }) => ({ memberId, affinity }));

    if (q) {
      base = base.filter(({ memberId }) => {
        const m = members.find((mm) => mm.id === memberId);
        const name = m?.name?.toLowerCase() ?? "";
        const group = m?.group?.toLowerCase() ?? "";
        const country = m?.country?.toLowerCase() ?? "";
        return name.includes(q) || group.includes(q) || country.includes(q);
      });
    }

    let lastPctInFiltered: number | null = null;

    return base.map((s) => {
      const pct = Number((s.affinity * 100).toFixed(2));
      const showPos = lastPctInFiltered === null || pct !== lastPctInFiltered;
      lastPctInFiltered = pct;

      const m = members.find((mm) => mm.id === s.memberId);
      const globalPos = globalPosMap.get(s.memberId) ?? 0;
      const countryPos = q ? countryPosMap.get(s.memberId) ?? null : null;

      return {
        memberId: s.memberId,
        pct,
        showPos,
        globalPos,
        countryPos,
        name: m?.name ?? s.memberId,
        group: m?.group ?? "—",
        country: m?.country ?? "—",
        image: m?.image ?? m?.photo ?? null,
      };
    });
  }, [done, globalBase, globalPosMap, countryPosMap, members, search]);

  const mepById = (id: string) => members.find((m) => m.id === id);
  const mepName = (id: string) => mepById(id)?.name || id;
  const mepGroup = (id: string) => mepById(id)?.group || "—";
  const mepCountry = (id: string) => mepById(id)?.country || "—";
  const mepImage = (id: string) => mepById(id)?.image ?? mepById(id)?.photo ?? null;

  const smoothScrollToRanking = () => {
    rankingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const overlayOpen = infoOpen || !!detailFor;

  // Panel de progreso vertical (md+)
  const progressList = useMemo(() => {
    return questions.map((q, i) => {
      const v = choices[q.id];
      const color =
        v === 1 ? "bg-green-600" : v === -1 ? "bg-red-600" : v === 0 ? "bg-amber-500" : "bg-gray-500";
      const label =
        v === 1 ? "A favor" : v === -1 ? "En contra" : v === 0 ? "Abstención" : "Sin responder";
      return { index: i + 1, color, label };
    });
  }, [questions, choices]);

  // helpers barra inferior (resultados)
  const resetTest = () => {
    setChoices({});
    setIndex(0);
    setDone(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ========== Loading con barra real ========== */
  if (loading || !total) {
    const pct = Math.round(progress * 100);
    return (
      <main className="min-h-dvh grid place-items-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mb-3 text-sm opacity-90">Cargando preguntas… {pct}%</div>
          <div className="h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full bg-[var(--eu-yellow)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-dvh flex flex-col p-6 pb-28 relative transition-opacity duration-500 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Progreso vertical (solo md+) */}
      {!done && (
        <div
          aria-label="Progreso del cuestionario"
          className="hidden md:flex fixed left-3 top-1/2 -translate-y-1/2 flex-col gap-2 z-[80]"
        >
          {progressList.map((p, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-2 py-1 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm"
              title={`${p.label} — Pregunta ${p.index}`}
            >
              <span className="text-xs tabular-nums w-6 text-center opacity-80">{p.index}</span>
              <span className={`h-3 w-5 rounded-full ${p.color}`} aria-hidden />
            </div>
          ))}
        </div>
      )}

      {/* Cabecera */}
        <header className="max-w-5xl w-full mx-auto mb-2">
            {!done ? (
                // Durante el test: solo el título centrado
                <div className="text-sm opacity-80 text-center">¿A qué eurodiputado me parezco?</div>
            ) : (
                // En resultados: si faltan preguntas por responder, muestra aviso centrado
                (() => {
                const quedan = Math.max(0, total - answeredCount);
                if (quedan <= 0) return <div className="h-5" />; // espaciador sutil
                return (
                    <div className="text-sm opacity-80 text-center">
                    {quedan === 1 ? "Te queda una pregunta por responder" : `Te quedan ${quedan} preguntas por responder`}
                    </div>
                );
                })()
            )}
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
            <div className="max-w-5xl mx-auto grid grid-rows-[200px_auto] md:grid-rows-[240px_auto] lg:grid-rows-[280px_auto]">
              {/* Título */}
              <div className="row-start-1 row-end-2">
                <div className="text-center">
                  <div className="text-sm opacity-80 mb-2">
                    Pregunta {index + 1} de {total}
                  </div>
                  <div className="h-full flex items-end justify-center">
                    {/* móvil más pequeño */}
                    <h2 className="text-base sm:text-lg md:text-3xl font-semibold leading-snug text-center px-2">
                      {current.q}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Respuestas */}
              <div className="row-start-2 row-end-3">
                <div className="max-w-3xl mx-auto mt-14 md:mt-16">
                  <div className="rounded-2xl border border-white/20 bg-white/5 backdrop-blur shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-5 md:p-6">
                    <div
                      className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${
                        hoverVal !== null && choices[current.id] === undefined ? "group" : ""
                      }`}
                    >
                      {(
                        [
                          ["A favor", 1, "green"],
                          ["En contra", -1, "red"],
                          ["Abstención", 0, "amber"],
                        ] as const
                      ).map(([label, val, color]) => {
                        const selectedVal = choices[current.id];
                        const isPressed = selectedVal === val;
                        const dim =
                          (selectedVal !== undefined && !isPressed) ||
                          (selectedVal === undefined && hoverVal !== null && hoverVal !== val);

                        const baseDefault =
                          color === "green"
                            ? "bg-green-700 text-white"
                            : color === "red"
                            ? "bg-red-700 text-white"
                            : "bg-amber-600 text-white";

                        return (
                          <button
                            key={label}
                            onMouseEnter={() => setHoverVal(val)}
                            onMouseLeave={() => setHoverVal(null)}
                            className={`px-4 py-3 rounded-xl text-sm md:text-base font-semibold border cursor-pointer transition
                              ${baseDefault}
                              ${dim ? "opacity-45 grayscale" : ""}
                              ${isPressed ? "border-transparent shadow-inner" : "border-transparent"}
                            `}
                            onClick={() => vote(current.id, val)}
                            aria-pressed={isPressed}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-5">
                      <InfoDialog q={current} onOpenChange={setInfoOpen} />
                    </div>
                  </div>

                  {/* Aviso anonimato */}
                  <p className="mt-2 text-[10px] leading-tight text-white/60 text-center">
                    Tus respuestas no se guardan; son anónimas.
                  </p>

                  <div className="h-[140px]" />
                </div>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="results"
            className="flex-1 w-full"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            <div className="w-full max-w-6xl mx-auto">
              {/* Encabezado resultados */}
                {/* ====== MOBILE ====== */}
                <div className="md:hidden px-2 mb-4">
                <div className="w-full flex justify-center">
                    <div
                    role="tablist"
                    aria-label="Modo de cálculo de afinidad"
                    className="inline-flex w-full max-w-[420px] justify-center rounded-xl overflow-hidden border border-white/20 bg-white/5"
                    >
                    {(["coverage", "raw"] as Mode[]).map((m) => (
                        <button
                        key={m}
                        role="tab"
                        aria-selected={mode === m}
                        onClick={() => setMode(m)}
                        title={
                            m === "coverage"
                            ? "Contar ausencias: coincidencias, desacuerdos y AUSENCIAS del eurodiputado/a."
                            : "Ignorar ausencias: solo coincidencias/desacuerdos; se ignoran sus ausencias."
                        }
                        className={`flex-1 px-4 py-2 text-sm whitespace-nowrap cursor-pointer transition ${
                            mode === m ? "bg-[var(--eu-yellow)] text-black font-semibold" : "hover:bg-white/10"
                        }`}
                        >
                        {m === "coverage" ? "Contar ausencias" : "Ignorar ausencias"}
                        </button>
                    ))}
                    </div>
                </div>

                {/* Titular cercano, centrado y más humano */}
                <div className="mt-2 text-center text-lg font-semibold">
                    Tus votos se parecen a los de estos eurodiputados
                </div>
                </div>

                {/* ====== DESKTOP ====== */}
                <div className="hidden md:flex items-center justify-between gap-3 px-2 mb-4">
                <h2 className="text-2xl font-bold">Tus resultados</h2>
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
                        title={
                        m === "coverage"
                            ? "Contar ausencias: coincidencias, desacuerdos y AUSENCIAS del eurodiputado/a."
                            : "Ignorar ausencias: solo coincidencias/desacuerdos; se ignoran sus ausencias."
                        }
                        className={`px-3 py-1.5 text-sm cursor-pointer transition ${
                        mode === m ? "bg-[var(--eu-yellow)] text-black font-semibold" : "hover:bg-white/10"
                        }`}
                    >
                        {m === "coverage" ? "Contar ausencias" : "Ignorar ausencias"}
                    </button>
                    ))}
                </div>
                </div>

              {/* ====== MÓVIL (md:hidden) ====== */}
              <div className="md:hidden px-2">
                {(() => {
                  const top3 = top.slice(0, 3);

                  const WinnerMobile = ({ id, p }: { id: string; p: number }) => {
                    const img = mepImage(id);
                    return (
                      <div className="w-full rounded-2xl border border-white/20 bg-white/5 p-4 mb-4">
                        <span className="text-[10px] uppercase tracking-wider bg-[var(--eu-yellow)] text-black px-2 py-0.5 rounded-md font-semibold inline-block mb-2">
                          Tu mejor coincidencia
                        </span>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            {img ? (
                              <img
                                src={img}
                                alt={mepName(id)}
                                className="w-14 h-14 rounded-full object-cover ring-2 ring-white/30 shrink-0"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-white/10 grid place-items-center">👤</div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-xl font-bold leading-tight break-words">{mepName(id)}</div>
                              <div className="text-xs opacity-80 break-words">{mepGroup(id)}</div>
                              <div className="text-[11px] opacity-70 break-words">{mepCountry(id)}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-2xl font-black leading-none">{p.toFixed(2)}%</div>
                              <div className="text-[10px] uppercase tracking-wider opacity-70">afinidad</div>
                            </div>
                          </div>
                          <div>
                            <span
                              onClick={() => setDetailFor(id)}
                              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition text-sm cursor-pointer"
                            >
                              Mira sus votos
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  };

                  const SmallMobile = ({ id, p, place }: { id: string; p: number; place: number }) => {
                    const img = mepImage(id);
                    return (
                      <div className="w-full rounded-2xl border border-white/15 bg-white/5 p-3 flex items-center gap-3 mb-3">
                        <div className="w-6 h-6 rounded-full bg-[var(--eu-yellow)] text-black font-bold grid place-items-center text-[11px]">
                          {place}
                        </div>
                        {img ? (
                          <img src={img} alt={mepName(id)} className="w-10 h-10 rounded-full object-cover shrink-0" loading="lazy" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white/10 grid place-items-center shrink-0">👤</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold leading-tight break-words">{mepName(id)}</div>
                          <div className="text-xs opacity-80 leading-tight break-words">{mepGroup(id)}</div>
                          <div className="text-[11px] opacity-70 leading-tight break-words">{mepCountry(id)}</div>
                          <span className="mt-2 inline-flex">
                            <span
                              onClick={() => setDetailFor(id)}
                              className="inline-flex items-center px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 transition text-xs cursor-pointer"
                            >
                              Mira sus votos
                            </span>
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-extrabold leading-none">{p.toFixed(2)}%</div>
                          <div className="text-[10px] uppercase tracking-wider opacity-70">afinidad</div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      {top3[0] && <WinnerMobile id={top3[0].memberId} p={top3[0].affinity * 100} />}
                      {top3[1] && <SmallMobile place={2} id={top3[1].memberId} p={top3[1].affinity * 100} />}
                      {top3[2] && <SmallMobile place={3} id={top3[2].memberId} p={top3[2].affinity * 100} />}
                    </>
                  );
                })()}
              </div>

              {/* ====== DESKTOP (hidden md:block) ====== */}
              <div className="hidden md:block">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22 }}
                    className="flex flex-col items-center justify-center px-2"
                  >
                    {(() => {
                      const top3 = top.slice(0, 3);

                      const GhostButton = (props: React.HTMLAttributes<HTMLSpanElement>) => (
                        <span
                          {...props}
                          className={`inline-flex items-center px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition text-sm cursor-pointer ${props.className ?? ""}`}
                        />
                      );

                      const WinnerCard = ({ id, p }: { id: string; p: number }) => {
                        const img = mepImage(id);
                        return (
                          <div className="w-full max-w-3xl relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-[#003399]/50 to-[#001a66]/50 p-6 md:p-8 mb-6">
                            <span className="absolute top-4 left-4 text-[10px] uppercase tracking-wider bg-[var(--eu-yellow)] text-black px-2.5 py-1 rounded-md font-semibold">
                              Tu mejor coincidencia
                            </span>
                            <div className="flex items-center gap-5 md:gap-6">
                              {img ? (
                                <img
                                  src={img}
                                  alt={mepName(id)}
                                  className="w-24 h-24 md:w-28 md:h-28 rounded-full object-cover ring-2 ring-white/40"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-white/10 grid place-items-center text-4xl">👤</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-2xl md:text-3xl font-bold leading-tight truncate">{mepName(id)}</div>
                                <div className="text-sm md:text-base opacity-80 truncate">{mepGroup(id)}</div>
                                <div className="text-xs md:text-sm opacity-70 truncate">{mepCountry(id)}</div>
                                <GhostButton onClick={() => setDetailFor(id)} className="mt-3">
                                  Mira sus votos
                                </GhostButton>
                              </div>
                              <div className="text-right">
                                <div className="text-4xl md:text-6xl font-black leading-none">{p.toFixed(2)}%</div>
                                <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1">afinidad</div>
                              </div>
                            </div>
                          </div>
                        );
                      };

                      const SmallCard = ({ id, p, place }: { id: string; p: number; place: number }) => {
                        const img = mepImage(id);
                        return (
                          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-white/5 p-4 md:p-5 flex items-center gap-4 mx-auto">
                            <div className="w-7 h-7 rounded-full bg-[var(--eu-yellow)] text-black font-bold grid place-items-center text-xs">
                              {place}
                            </div>
                            {img ? (
                              <img src={img} alt={mepName(id)} className="w-12 h-12 rounded-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-white/10 grid place-items-center">👤</div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">{mepName(id)}</div>
                              <div className="text-xs opacity-70 truncate">{mepGroup(id)}</div>
                              <div className="text-[11px] opacity-60 truncate">{mepCountry(id)}</div>
                              <span className="mt-2 block">
                                <span
                                  onClick={() => setDetailFor(id)}
                                  className="inline-flex items-center px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 transition text-xs cursor-pointer"
                                >
                                  Mira sus votos
                                </span>
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-extrabold leading-none">{p.toFixed(2)}%</div>
                              <div className="text-[10px] uppercase tracking-wider opacity-70">afinidad</div>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <>
                          {top3[0] && <WinnerCard id={top3[0].memberId} p={top3[0].affinity * 100} />}
                          <div className="grid md:grid-cols-2 gap-4 w-full place-items-center">
                            {top3[1] && <SmallCard place={2} id={top3[1].memberId} p={top3[1].affinity * 100} />}
                            {top3[2] && <SmallCard place={3} id={top3[2].memberId} p={top3[2].affinity * 100} />}
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* CTA */}
              <div className="text-center mt-8 md:mt-10">
                <span
                  onClick={smoothScrollToRanking}
                  className="cursor-pointer inline-flex items-center px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition"
                  role="button"
                >
                  Mira tus coincidencias con todos los eurodiputados
                </span>
              </div>

              {/* Ranking */}
              <div ref={rankingRef} className="mt-20 md:mt-24 px-2 scroll-mt-24">
                <h3 className="text-xl font-semibold mb-3 text-center">Ranking de coincidencia</h3>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, grupo o país…"
                  className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-2 outline-none mb-4"
                />

                {/* Lista */}
                <div>
                  <AnimatePresence initial={false}>
                    {rankedAll.slice(0, showCount).map((r) => (
                      <motion.div
                        key={r.memberId}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                        className="
                          border-b border-white/10
                          px-2 sm:px-3 py-2
                          flex flex-col sm:flex-row sm:items-center sm:gap-3
                        "
                      >
                        {/* Cabecera móvil */}
                        <div className="flex items-center justify-between sm:hidden mb-1">
                          <div className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-md bg-white/10 text-xs font-semibold">
                              {r.showPos ? r.globalPos : ""}
                            </span>
                            {Boolean(search.trim()) && r.countryPos ? (
                              <span className="text-[11px] opacity-70">#{r.countryPos} país</span>
                            ) : null}
                          </div>
                          <div className="font-mono text-sm">{r.pct.toFixed(2)}%</div>
                        </div>

                        {/* Posición desktop */}
                        <div className="hidden md:flex w-20 items-center justify-center">
                          <div className="w-8 text-center font-semibold">
                            {r.showPos ? r.globalPos : ""}
                          </div>
                          {Boolean(search.trim()) && r.countryPos ? (
                            <span className="text-xs opacity-70 ml-1">#{r.countryPos} país</span>
                          ) : null}
                        </div>

                        {/* Foto + texto */}
                        <div className="flex items-start gap-3 w-full">
                          {r.image ? (
                            <img
                              src={r.image}
                              alt={r.name}
                              className="w-10 h-10 rounded-full object-cover shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-white/10 grid place-items-center shrink-0">👤</div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="font-medium leading-tight break-words sm:truncate">{r.name}</div>
                            <div className="text-xs opacity-80 leading-tight break-words sm:truncate">{r.group}</div>
                            <div className="text-[11px] opacity-70 leading-tight break-words sm:truncate">{r.country}</div>
                          </div>

                          {/* Derecha desktop */}
                          <div className="hidden md:flex items-center gap-8 shrink-0 ml-auto sm:-mr-3 md:-mr-6 lg:-mr-10 xl:-mr-14">
                            <div className="text-right font-mono w-36 lg:w-48 xl:w-56">{r.pct.toFixed(2)}%</div>
                            <span
                              onClick={() => setDetailFor(r.memberId)}
                              className="inline-flex items-center px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 transition text-sm cursor-pointer"
                              role="button"
                            >
                              Mira sus votos
                            </span>
                          </div>
                        </div>

                        {/* CTA móvil debajo */}
                        <div className="sm:hidden mt-2">
                          <span
                            onClick={() => setDetailFor(r.memberId)}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition text-sm cursor-pointer"
                            role="button"
                          >
                            Mira sus votos
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Mostrar más */}
                {rankedAll.length > showCount && (
                  <div className="text-center mt-4">
                    <span
                      onClick={() => setShowCount((c) => c + 10)}
                      className="cursor-pointer inline-flex items-center px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition"
                      role="button"
                      aria-label="Mostrar más resultados"
                    >
                      Mostrar más
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Barra inferior fija — NO se renderiza si hay overlay */}
      {!overlayOpen && (
        <div className="fixed left-0 right-0 bottom-0 z-[1000] pointer-events-auto bg-[#0b1d5f]/70 backdrop-blur border-t border-white/10">
          <AnimatePresence initial={false} mode="wait">
            {!done ? (
              <motion.div
                key="quiz-buttons"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="mx-auto w-full max-w-3xl px-4 py-3 flex items-center justify-between"
              >
                <button
                  onClick={() => {
                    if (done) {
                      setDone(false);
                      return;
                    }
                    setIndex((i) => Math.max(0, i - 1));
                  }}
                  disabled={!questions.length || (index === 0 && !done)}
                  className={`px-4 py-2 rounded-lg ${
                    !questions.length || (index === 0 && !done)
                      ? "bg-white/10 opacity-50 cursor-not-allowed"
                      : "bg-white/10 hover:bg-white/15 cursor-pointer"
                  }`}
                >
                  Volver atrás
                </button>

                {/* Ver resultados: bloqueado si <5 */}
                <button
                  onClick={() => answeredCount >= minRequired && setDone(true)}
                  className={`px-4 py-2 rounded-lg font-semibold ${
                    answeredCount >= minRequired
                      ? "bg-[var(--eu-yellow)] text-black hover:brightness-95 cursor-pointer"
                      : "bg-white/10 text-white/70 cursor-not-allowed"
                  }`}
                  disabled={answeredCount < minRequired}
                  aria-disabled={answeredCount < minRequired}
                  title={answeredCount < minRequired ? `Responde ${remaining} más` : "Ver resultados"}
                >
                  {answeredCount < minRequired ? `Ver resultados (${remaining})` : "Ver resultados"}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="results-actions"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="mx-auto w-full max-w-5xl px-4 py-3"
              >
                {/* Móvil: Volver + Ir a inicio */}
                <div className="flex md:hidden items-center justify-center gap-3">
                  <button
                    onClick={() => setDone(false)}
                    className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"
                  >
                    Volver
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    className="px-5 py-2 rounded-lg bg-[var(--eu-yellow)] text-black font-semibold hover:brightness-95 cursor-pointer"
                  >
                    Ir a inicio
                  </button>
                </div>

                {/* Desktop: los tres botones */}
                <div className="hidden md:flex items-center justify-center gap-3">
                  <button
                    onClick={() => setDone(false)}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"
                  >
                    Continuar con el test
                  </button>
                  <button
                    onClick={resetTest}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 cursor-pointer"
                  >
                    Reiniciar el test
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    className="px-4 py-2 rounded-lg bg-[var(--eu-yellow)] text-black font-semibold hover:brightness-95 cursor-pointer"
                  >
                    Ir a inicio
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Modal detalle comparativa */}
      <DetailDialog
        open={!!detailFor}
        onOpenChange={(o) => !o && setDetailFor(null)}
        memberId={detailFor}
        questions={questions}
        choices={filteredChoices}
        matrix={matrix}
        mepName={mepName}
        mepGroup={mepGroup}
        mepCountry={mepCountry}
        mepImage={mepImage}
        />
    </main>
  );
}

/* ====================== Modales ====================== */

function InfoDialog({
  q,
  onOpenChange,
}: {
  q: Question;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog.Root onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/80 text-black cursor-pointer">
          Más información
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        </Dialog.Overlay>

        {/* Contenido */}
        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          >
            <div className="relative w-[92vw] max-w-[820px] rounded-2xl border border-white/20 bg-[#0b1d5f]/80 text-white p-5 md:p-7 shadow-[0_10px_40px_rgba(0,0,0,0.35)] max-h-[90vh] md:max-h-[85vh] overflow-y-auto">
              {/* Botón X */}
              <Dialog.Close
                className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-black font-bold hover:bg-white transition cursor-pointer"
                aria-label="Cerrar"
              >
                ✕
              </Dialog.Close>

              <Dialog.Title className="text-lg md:text-xl font-semibold mb-4">Qué se vota</Dialog.Title>

              {/* Descripción */}
              {q.queSeVota ? (
                <p className="text-sm opacity-90 whitespace-pre-line text-justify">{q.queSeVota}</p>
              ) : (
                <p className="text-sm opacity-70 text-justify">No hay descripción disponible.</p>
              )}

              {/* Enlace centrado */}
              {q.url && (
                <div className="mt-4 mb-2 text-sm text-center">
                  <a
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition cursor-pointer"
                    href={q.url!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ampliar información
                  </a>
                  <div className="h-4 md:hidden" />
                </div>
              )}

              {(q.aFavor?.length || q.enContra?.length) ? (
                <div className="mt-5 grid md:grid-cols-2 gap-6">
                  {q.aFavor?.length ? (
                    <div>
                      <div className="w-full flex justify-center mb-3">
                        <span className="inline-block rounded-full px-3 py-1 text-sm font-semibold bg-green-700 text-white">
                          Argumentos a favor
                        </span>
                      </div>
                      <div className="space-y-2 text-sm opacity-90 text-justify">
                        {q.aFavor.map((t, i) => (
                          <p key={i}>{t}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {q.enContra?.length ? (
                    <div>
                      <div className="w-full flex justify-center mb-3">
                        <span className="inline-block rounded-full px-3 py-1 text-sm font-semibold bg-red-700 text-white">
                          Argumentos en contra
                        </span>
                      </div>
                      <div className="space-y-2 text-sm opacity-90 text-justify">
                        {q.enContra.map((t, i) => (
                          <p key={i}>{t}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Aviso legal al pie */}
              <p className="mt-6 text-[10px] leading-tight text-white/65 text-center">
                Datos de votación © HowTheyVote.eu — ODbL/DBCL para la base y contenidos; fotos y resúmenes quedan excluidos.
              </p>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailDialog({
  open,
  onOpenChange,
  memberId,
  questions,
  choices,
  matrix,
  mepName,
  mepGroup,   // no lo usamos en el título, pero lo dejo por si lo quieres reutilizar
  mepCountry, // idem
  mepImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string | null;
  questions: Question[];
  choices: Record<string, number>;
  matrix: Matrix;
  mepName: (id: string) => string;
  mepGroup: (id: string) => string;
  mepCountry: (id: string) => string;
  mepImage: (id: string) => string | null;
}) {
  if (!memberId) return null;

  const rows = questions
    .filter((q) => matrix[q.id])
    .map((q) => {
      const mepVote = (matrix as any)[q.id]?.[memberId] as number | undefined;
      const myVote = choices[q.id];
      return { id: q.id, q: q.q, myVote, mepVote };
    });

  const mepImg = mepImage(memberId);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        </Dialog.Overlay>

        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          >
            <div className="relative w-[92vw] max-w-[980px] rounded-2xl border border-white/20 bg-[#0b1d5f]/80 text-white p-5 md:p-7 shadow-[0_10px_40px_rgba(0,0,0,0.35)] max-h-[90vh] md:max-h-[85vh] overflow-y-auto">
              {/* Botón X */}
              <Dialog.Close
                className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-black font-bold hover:bg-white transition cursor-pointer"
                aria-label="Cerrar"
              >
                ✕
              </Dialog.Close>

              {/* Título: SOLO NOMBRE (móvil y desktop) */}
              <Dialog.Title className="text-lg md:text-xl font-semibold mb-3">
                {mepName(memberId)}
              </Dialog.Title>
              <div className="h-2" />

              {/* ======= MÓVIL ======= */}
              <div className="md:hidden">
                {/* Cabecera: vacío / Tú / foto MEP */}
                <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] px-2 pb-2 text-xs opacity-80 items-center">
                  <div />
                  <div className="text-center font-semibold">Tú</div>
                  <div className="text-center">
                    {mepImg ? (
                      <img
                        src={mepImg}
                        alt={mepName(memberId)}
                        className="inline-block w-6 h-6 rounded-full object-cover ring-1 ring-white/40 align-middle"
                        loading="lazy"
                      />
                    ) : (
                      <span className="inline-block w-6 h-6 rounded-full bg-white/10 align-middle" />
                    )}
                  </div>
                </div>

                {/* Filas sin recuadro, con separadores */}
                <div className="divide-y divide-white/10">
                  {rows.map((r) => (
                    <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-center py-2">
                      <div className="px-2 text-xs leading-snug">{r.q}</div>
                      <div className="px-2 flex items-center justify-center">
                        <span
                          className={`w-5 h-5 rounded-full ${colorFromVal(r.myVote)}`}
                          title={labelFromVal(r.myVote)}
                        />
                      </div>
                      <div className="px-2 flex items-center justify-center">
                        <span
                          className={`w-5 h-5 rounded-full ${colorFromVal(r.mepVote)}`}
                          title={labelFromVal(r.mepVote)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ======= DESKTOP ======= */}
              <div className="hidden md:block">
                {/* SIN recuadro: solo cabecera + filas con separadores */}
                {/* Cabecera: vacío / Tú / foto MEP */}
                <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-0 px-1 pb-2 text-sm opacity-80 items-center">
                  <div />
                  <div className="text-center font-semibold">Tú</div>
                  <div className="text-center">
                    {mepImg ? (
                      <img
                        src={mepImg}
                        alt={mepName(memberId)}
                        className="inline-block w-7 h-7 rounded-full object-cover ring-1 ring-white/40 align-middle"
                        loading="lazy"
                      />
                    ) : (
                      <span className="inline-block w-7 h-7 rounded-full bg-white/10 align-middle" />
                    )}
                  </div>
                </div>

                <div className="divide-y divide-white/10">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center"
                    >
                      <div className="px-3 py-2 text-sm">{r.q}</div>
                      <div className="px-3 py-2 flex items-center justify-center">
                        <span
                          className={`w-6 h-6 rounded-full ${colorFromVal(r.myVote)}`}
                          title={labelFromVal(r.myVote)}
                        />
                      </div>
                      <div className="px-3 py-2 flex items-center justify-center">
                        <span
                          className={`w-6 h-6 rounded-full ${colorFromVal(r.mepVote)}`}
                          title={labelFromVal(r.mepVote)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Aviso legal al pie */}
              <p className="mt-6 text-[10px] leading-tight text-white/65 text-center">
                Datos de votación © HowTheyVote.eu — ODbL/DBCL para la base y contenidos; fotos y resúmenes quedan excluidos.
              </p>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

