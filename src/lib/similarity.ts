// src/lib/similarity.ts
// userChoices: Record<vote_id, number> con +1/-1/0 (FOR/AGAINST/ABSTENTION)
export type UserChoices = Record<string, number>;
export type Matrix = Record<string, Record<string, number|null>>;

export function scoreMembers(choices: UserChoices, matrix: Matrix) {
  const agree: Record<string, {match: number, total: number}> = {};
  for (const [voteId, userPos] of Object.entries(choices)) {
    const row = matrix[voteId]; if (!row) continue;
    for (const [memberId, pos] of Object.entries(row)) {
      if (pos === null || pos === undefined) continue; // no votó
      // Coincidencia estricta: +1 si igual, +0.5 si abstención de alguno? mantenlo simple: igual=1
      const ok = (pos === userPos) ? 1 : 0;
      (agree[memberId] ||= {match:0,total:0}).match += ok;
      agree[memberId].total += 1;
    }
  }
  // afinidad = match / total (mínimo 5 votos para no inflar)
  const res = Object.entries(agree)
    .filter(([,v]) => v.total >= 5)
    .map(([memberId,v]) => ({ memberId, affinity: v.total? v.match / v.total : 0 }));
  res.sort((a,b) => b.affinity - a.affinity);
  return res;
}
