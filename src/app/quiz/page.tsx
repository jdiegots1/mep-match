"use client";
import { useEffect, useMemo, useState } from "react";
import type { Matrix } from "@/lib/similarity";
import { scoreMembers } from "@/lib/similarity";

type Vote = { id: string; title: string; date: string; type: string | null };
type Member = { id: string; name: string; country: string | null };

export default function QuizPage() {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [choices, setChoices] = useState<Record<string, number>>({}); // +1|-1|0
  const [i, setI] = useState(0); // índice de pregunta actual
  const [done, setDone] = useState(false);

  // carga datos
  useEffect(() => {
    let alive = true;
    (async () => {
      const [v, m, mat] = await Promise.all([
        fetch("/data/votes_2025_main.json").then(r => r.json()).catch(() => []),
        fetch("/data/members.json").then(r => r.json()).catch(() => []),
        fetch("/data/matrix.json").then(r => r.json()).catch(() => ({})),
      ]);
      if (!alive) return;
      // usa 15-20 preguntas máx para agilidad
      setVotes((v as Vote[]).slice(0, 18));
      setMembers(m);
      setMatrix(mat);
    })();
    return () => { alive = false; };
  }, []);

  const total = votes.length;
  const current = votes[i];

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
    // avanza automáticamente o termina
    const nextIndex = i + 1;
    if (nextIndex < total) setI(nextIndex);
    else setDone(true);
  }

  function back() {
    // si estamos en resultados y hay al menos 1, vuelve a la última pregunta
    if (done && total > 0) {
      setDone(false);
      setI(total - 1);
      return;
    }
    if (i > 0) setI(i - 1);
  }

  // resultados solo al final
  const top = useMemo(() => {
    if (!done) return [];
    return scoreMembers(choices, matrix).slice(0, 10);
  }, [done, choices, matrix]);

  const nameOf = (id: string) => members.find(m => m.id === id)?.name || id;

  // UI
  if (!total) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center opacity-90">Cargando preguntas…</div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col p-6">
      {/* Cabecera compacta */}
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
        {/* Pantalla de RESULTADOS */}
        {done ? (
          <div className="w-full max-w-3xl fade-in">
            <h2 className="text-2xl font-bold text-center mb-4">
              Tus resultados
            </h2>
            {top.length === 0 && (
              <p className="text-center opacity-80">
                Responde al menos 5 preguntas para calcular afinidad.
              </p>
            )}
            <ul className="space-y-2">
              {top.map(r => (
                <li
                  key={r.memberId}
                  className="border border-white/20 rounded-xl p-3 flex items-center justify-between"
                >
                  <span>{nameOf(r.memberId)}</span>
                  <span className="font-mono">{Math.round(r.affinity * 100)}%</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={back}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 transition"
              >
                Volver atrás
              </button>
              <a
                href="/"
                className="btn-eu"
              >
                Ir a inicio
              </a>
            </div>
          </div>
        ) : (
          // Pantalla de PREGUNTA actual (una tarjeta centrada)
          <div className="w-full max-w-3xl fade-in">
            <div className="border border-white/20 rounded-2xl p-5 bg-white/5 backdrop-blur">
              <div className="text-sm opacity-80 mb-1">
                Pregunta {i + 1} de {total}
              </div>
              <h2 className="text-xl font-semibold">{current.title}</h2>
              <div className="text-xs opacity-70">{current.date}{current.type ? ` · ${current.type}` : ""}</div>

              <div className="mt-5 grid sm:grid-cols-3 gap-3">
                <button
                  className="px-4 py-3 rounded-xl bg-green-200/90 text-green-900 font-semibold hover:opacity-95 transition"
                  onClick={() => pick(current.id, 1)}
                >
                  A favor
                </button>
                <button
                  className="px-4 py-3 rounded-xl bg-red-200/90 text-red-900 font-semibold hover:opacity-95 transition"
                  onClick={() => pick(current.id, -1)}
                >
                  En contra
                </button>
                <button
                  className="px-4 py-3 rounded-xl bg-gray-200/90 text-gray-900 font-semibold hover:opacity-95 transition"
                  onClick={() => pick(current.id, 0)}
                >
                  Abstención
                </button>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={back}
                  disabled={i === 0}
                  className={`px-4 py-2 rounded-lg transition ${i === 0 ? "bg-white/10 opacity-50 cursor-not-allowed" : "bg-white/10 hover:bg-white/15"}`}
                >
                  Volver atrás
                </button>

                <button
                  onClick={() => setDone(true)}
                  className="btn-eu"
                >
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
