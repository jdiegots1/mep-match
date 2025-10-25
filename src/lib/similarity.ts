// src/lib/similarity.ts
export type UserChoices = Record<string, number>; // +1 / -1 / 0
export type Matrix = Record<string, Record<string, number | null>>;

type Options = {
  minOverlap?: number;        // mínimo de votos en común para considerar al MEP
  coveragePenalty?: boolean;  // penalizar por no-votos del MEP (recomendado)
  abstentionSoft?: boolean;   // tratar abstenciones como coincidencia suave
};

export function scoreMembers(
  choices: UserChoices,
  matrix: Matrix,
  opts: Options = {}
) {
  const {
    minOverlap = 5,
    coveragePenalty = true,
    abstentionSoft = false,
  } = opts;

  const userAnswered = Object.keys(choices).length;
  if (userAnswered === 0) return [];

  const agg: Record<string, { match: number; overlap: number }> = {};

  for (const [voteId, userPos] of Object.entries(choices)) {
    const row = matrix[voteId];
    if (!row) continue;

    for (const [memberId, pos] of Object.entries(row)) {
      if (pos === null || pos === undefined) continue; // el MEP no votó -> no cuenta al solape
      const same = pos === userPos;

      let inc = 0;
      if (same) {
        inc = 1;
      } else if (abstentionSoft) {
        // Coincidencia suave si alguno es abstención (0) y el otro no
        // p.ej. 0.5 en vez de 0 (ajústalo a tu gusto)
        if (pos === 0 || userPos === 0) inc = 0.5;
      }

      (agg[memberId] ||= { match: 0, overlap: 0 });
      agg[memberId].match += inc;
      agg[memberId].overlap += 1;
    }
  }

  const scored = Object.entries(agg)
    .filter(([, v]) => v.overlap >= minOverlap)
    .map(([memberId, v]) => {
      const raw = v.overlap > 0 ? v.match / v.overlap : 0; // aciertos / solape
      const coverage = v.overlap / userAnswered;           // qué % de tus respuestas cubre el MEP
      const affinity = coveragePenalty ? raw * coverage : raw;

      return { memberId, affinity, overlap: v.overlap, coverage };
    });

  scored.sort((a, b) => {
    // ordena por afinidad y, a igualdad, prioriza mayor solape
    if (b.affinity !== a.affinity) return b.affinity - a.affinity;
    return b.overlap - a.overlap;
  });

  return scored;
}
