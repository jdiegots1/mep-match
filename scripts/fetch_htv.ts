// scripts/fetch_htv.ts
// HTV + enriquecido EP: nombres bien, grupo y foto
import { gunzipSync } from "node:zlib";
import { fetch } from "undici";
import { parse } from "csv-parse/sync";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";

const HTV = "https://github.com/HowTheyVote/data/releases/latest/download";
const URLS = {
  members: `${HTV}/members.csv.gz`,
  votes: `${HTV}/votes.csv.gz`,
  member_votes: `${HTV}/member_votes.csv.gz`,
};

// Tipos HTV
type MemberRow = { id: string; first_name: string; last_name: string; country_code?: string };
type VoteRow = {
  id: string; timestamp: string;
  display_title?: string; procedure_title?: string; procedure_type?: string; is_main?: string | boolean
};
type MemberVoteRow = { vote_id: string; member_id: string; position: "FOR"|"AGAINST"|"ABSTENTION"|"DID_NOT_VOTE" };

// EP CSV columnas que nos interesan
type EpRow = {
  mep_identifier: string;
  mep_official_given_name?: string;
  mep_official_family_name?: string;
  mep_image?: string;
  mep_political_group?: string;
  mep_country_of_representation?: string;
  // …el resto nos da igual
};

function titleCaseWord(w: string) {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}
function titleCase(s: string) {
  const lowers = new Set(["de","del","la","las","los","van","von","von der","vom","da","di","du","le","des","d’","d'", "y"]);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w,i)=> lowers.has(w) && i>0 ? w : titleCaseWord(w))
    .join(" ");
}
function fixName(first: string, last: string) {
  const lastFixed = last && last === last.toUpperCase() ? titleCase(last) : titleCase(last);
  return `${titleCase(first)} ${lastFixed}`.trim().replace(/\s+/g, " ");
}

async function fetchCsvGz<T = any>(url: string): Promise<T[]> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const csv = gunzipSync(buf).toString("utf8");
  return parse(csv, { columns: true, relax_column_count: true }) as T[];
}

function readEpCsvLocal(): Map<string, EpRow> {
  const p = "data/ep_meps.csv"; // C:\Users\jdieg\Documents\mep-match\data\ep_meps.csv
  if (!existsSync(p)) return new Map();
  const text = readFileSync(p, "utf8");
  const rows = parse(text, { columns: true, relax_column_count: true }) as EpRow[];
  const map = new Map<string, EpRow>();
  for (const r of rows) {
    const id = String(r.mep_identifier || "").trim();
    if (id) map.set(id, r);
  }
  return map;
}

async function main() {
  console.log("Descargando HowTheyVote export...");
  const [membersRaw, votesRaw, memberVotesRaw] = await Promise.all([
    fetchCsvGz<MemberRow>(URLS.members),
    fetchCsvGz<VoteRow>(URLS.votes),
    fetchCsvGz<MemberVoteRow>(URLS.member_votes),
  ]);

  // EP enriquecido local (opcional pero recomendado)
  const epById = readEpCsvLocal();

  // --- Miembros (normaliza + enriquece con EP) ---
  const members = membersRaw.map((m) => {
    const id = String((m as any).id).trim();
    const ep = epById.get(id);
    const first = String((m as any).first_name || "").trim();
    const last  = String((m as any).last_name  || "").trim();

    // nombre preferente: oficial EP si existe; si no, HTV arreglado
    const officialGiven  = (ep?.mep_official_given_name || "").trim();
    const officialFamily = (ep?.mep_official_family_name || "").trim();
    const name = (officialGiven || officialFamily)
      ? fixName(officialGiven || first, officialFamily || last)
      : fixName(first, last);

    const country = ((m as any).country_code || ep?.mep_country_of_representation || "").trim() || null;
    const group   = (ep?.mep_political_group || "").trim() || null;
    const photo   = (ep?.mep_image || "").trim() || null;

    return { id, name, country, group, photo };
  }).filter(m => m.id);

  // --- Votos 2025 principales ---
  const votes2025 = votesRaw
    .filter(v => {
      const ts = (v.timestamp || "").slice(0, 4) === "2025";
      const main = String(v.is_main ?? "").toLowerCase() === "true" || v.is_main === true;
      return ts && main;
    })
    .map(v => ({
      id: String(v.id),
      title: v.display_title || v.procedure_title || "Vote",
      date: (v.timestamp || "").slice(0, 10),
      type: v.procedure_type || null,
    }));

  const wanted = new Set(votes2025.map(v => v.id));

  // --- Matriz: vote_id -> member_id -> +1/-1/0/null ---
  const POS: Record<string, number|null> = { FOR: 1, AGAINST: -1, ABSTENTION: 0, DID_NOT_VOTE: null };
  const matrix: Record<string, Record<string, number|null>> = {};
  for (const mv of memberVotesRaw) {
    const vid = String(mv.vote_id);
    if (!wanted.has(vid)) continue;
    const mid = String(mv.member_id);
    matrix[vid] ??= {};
    matrix[vid][mid] = POS[mv.position] ?? null;
  }

  // --- Escribe JSON en /public/data ---
  mkdirSync("public/data", { recursive: true });
  writeFileSync("public/data/members.json", JSON.stringify(members, null, 2), "utf8");
  writeFileSync("public/data/votes_2025_main.json", JSON.stringify(votes2025, null, 2), "utf8");
  writeFileSync("public/data/matrix.json", JSON.stringify(matrix), "utf8");

  console.log(`OK: ${members.length} MEPs (enriquecidos), ${votes2025.length} votos (2025 main)`);
}

main().catch(err => { console.error(err); process.exit(1); });
