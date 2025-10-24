// scripts/fetch_htv.ts
// Descarga el export de HowTheyVote (CSV.gz), sigue redirecciones, filtra 2025 + is_main
import { gunzipSync } from "node:zlib";
import { fetch } from "undici";
import { parse } from "csv-parse/sync";

const HTV = "https://github.com/HowTheyVote/data/releases/latest/download";
const URLS = {
  members: `${HTV}/members.csv.gz`,
  votes: `${HTV}/votes.csv.gz`,
  member_votes: `${HTV}/member_votes.csv.gz`,
};

type MemberRow = { id: string; first_name: string; last_name: string; country_code?: string };
type VoteRow = { id: string; timestamp: string; display_title?: string; procedure_title?: string; procedure_type?: string; is_main?: string | boolean };
type MemberVoteRow = { vote_id: string; member_id: string; position: "FOR"|"AGAINST"|"ABSTENTION"|"DID_NOT_VOTE" };

async function fetchCsvGz<T = any>(url: string): Promise<T[]> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const csv = gunzipSync(buf).toString("utf8");
  const rows = parse(csv, { columns: true, relax_column_count: true }) as T[];
  return rows;
}

async function main() {
  console.log("Descargando HowTheyVote export...");
  const [membersRaw, votesRaw, memberVotesRaw] = await Promise.all([
    fetchCsvGz<MemberRow>(URLS.members),
    fetchCsvGz<VoteRow>(URLS.votes),
    fetchCsvGz<MemberVoteRow>(URLS.member_votes),
  ]);

  // Normaliza miembros
  const members = membersRaw.map(m => ({
    id: String((m as any).id).trim(),
    name: `${((m as any).first_name || "").trim()} ${((m as any).last_name || "").trim()}`.trim(),
    country: ((m as any).country_code || "").trim() || null,
  })).filter(m => m.id);

  // Filtra votos: año 2025 + "is_main"
  const votes2025 = votesRaw.filter(v => {
    const ts = (v.timestamp || "").slice(0,4) === "2025";
    const main = String(v.is_main ?? "").toLowerCase() === "true" || v.is_main === true;
    return ts && main;
  }).map(v => ({
    id: String(v.id),
    title: v.display_title || v.procedure_title || "Vote",
    date: (v.timestamp || "").slice(0,10),
    type: v.procedure_type || null,
  }));

  const wanted = new Set(votes2025.map(v => v.id));

  // Matriz: vote_id -> member_id -> +1/-1/0/null
  const POS: Record<string, number|null> = { FOR: 1, AGAINST: -1, ABSTENTION: 0, DID_NOT_VOTE: null };
  const matrix: Record<string, Record<string, number|null>> = {};
  for (const mv of memberVotesRaw) {
    const vid = String(mv.vote_id);
    if (!wanted.has(vid)) continue;
    const mid = String(mv.member_id);
    matrix[vid] ??= {};
    matrix[vid][mid] = POS[mv.position] ?? null;
  }

  // Escribe JSON en /public/data
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync("public/data", { recursive: true });
  writeFileSync("public/data/members.json", JSON.stringify(members, null, 2), "utf8");
  writeFileSync("public/data/votes_2025_main.json", JSON.stringify(votes2025, null, 2), "utf8");
  writeFileSync("public/data/matrix.json", JSON.stringify(matrix), "utf8");

  console.log(`OK: ${members.length} MEPs, ${votes2025.length} votos (2025 main)`);
}

main().catch(err => { console.error(err); process.exit(1); });
