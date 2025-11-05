// scripts/merge_meps.ts
import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseCsv } from "csv-parse/sync";

/** CSV del EP (ES o EN) */
type MEPcsv = {
  mep_identifier: string;

  // nombres (solo estos, NO official)
  mep_given_name?: string;
  mep_family_name?: string;

  // país, grupo parlamentario europeo, foto
  mep_country_of_representation?: string;
  mep_political_group?: string;
  mep_image?: string;

  // partido/coalición y siglas (añadidas por ti)
  mep_polgroup?: string;
  mep_polgroup_sig?: string;
};

/** members.json base (de fetch_htv.ts) */
type MemberBase = {
  id: string | number;
  name?: string | null;
  country?: string | null;
  group?: string | null;
  image?: string | null;
  photo?: string | null;
};

/** salida enriquecida */
type MemberOut = {
  id: string;
  name: string;
  country: string | null;
  group: string | null;
  image: string | null;
  party: string | null;
  party_sig: string | null;
};

function tidy(s?: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

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

/** NOMBRE: SOLO given+family (EP). Si no hay, usa fallback (HTV). */
function pickName(r: MEPcsv, fallback?: string | null): string {
  const given = tidy(r.mep_given_name);
  const fam   = tidy(r.mep_family_name);

  const prefer = [given, fam].filter(Boolean).join(" ");
  const chosen = tidy(prefer || fallback || "");

  return chosen
    .split(/\s+/)
    .map((w) => titleCase(w))
    .join(" ");
}

/** Detecta ; o , */
function autodetectDelimiter(firstLine: string): "," | ";" {
  const sc = (firstLine.match(/;/g)?.length ?? 0);
  const cc = (firstLine.match(/,/g)?.length ?? 0);
  return sc >= cc ? ";" : ",";
}

// -------- rutas --------
const csvPath = "data/ep_meps_es.csv";
const membersPath = "public/data/members.json";
const outPath = "public/data/members.enriched.json";

// -------- carga EP CSV --------
const epCsvText = readFileSync(csvPath, "utf8");
const firstLine = epCsvText.split(/\r?\n/, 1)[0] ?? "";
const delimiter = autodetectDelimiter(firstLine);

const epRows = parseCsv(epCsvText, {
  columns: true,
  delimiter,
  bom: true,
  skip_empty_lines: true,
  trim: true,
}) as MEPcsv[];

if (!epRows.length) {
  console.error("ERROR: CSV vacío o ilegible:", csvPath);
  process.exit(1);
}
const epById = new Map<string, MEPcsv>();
for (const r of epRows) {
  const id = tidy(r.mep_identifier);
  if (id) epById.set(id, r);
}

// -------- carga base HTV --------
const membersBase = JSON.parse(readFileSync(membersPath, "utf8")) as MemberBase[];

let updatedName = 0;
let updatedCountry = 0;
let updatedGroup = 0;
let updatedImage = 0;
let updatedParty = 0;
let updatedPartySig = 0;
let noMatch = 0;

// -------- fusión --------
const enriched: MemberOut[] = membersBase.map((m) => {
  const id = String(m.id);
  const row = epById.get(id);

  if (!row) {
    noMatch++;
    return {
      id,
      name: tidy(m.name || "") || id,
      country: m.country ?? null,
      group: m.group ?? null,
      image: m.image ?? m.photo ?? null,
      party: null,
      party_sig: null,
    };
  }

  const nextName = pickName(row, m.name);
  const nextCountry = tidy(row.mep_country_of_representation) || (m.country ?? null) || null;
  const nextGroup = tidy(row.mep_political_group) || (m.group ?? null) || null; // grupo EP
  const nextImage = tidy(row.mep_image) || m.image || m.photo || null;

  const nextParty = tidy(row.mep_polgroup) || null;
  const nextPartySig = tidy(row.mep_polgroup_sig) || null;

  if (nextName && tidy(m.name || "") !== nextName) updatedName++;
  if ((nextCountry || null) !== (m.country ?? null)) updatedCountry++;
  if ((nextGroup || null) !== (m.group ?? null)) updatedGroup++;
  if ((nextImage || null) !== (m.image ?? m.photo ?? null)) updatedImage++;
  if (nextParty) updatedParty++;
  if (nextPartySig) updatedPartySig++;

  return {
    id,
    name: nextName || (m.name ?? id),
    country: nextCountry,
    group: nextGroup,
    image: nextImage,
    party: nextParty,
    party_sig: nextPartySig,
  };
});

// -------- salida --------
writeFileSync(outPath, JSON.stringify(enriched, null, 2), "utf8");

// -------- log --------
const total = membersBase.length;
console.log(`OK merge_meps: ${total} miembros enriquecidos (fuente ${csvPath}, delimitador "${delimiter}")`);
console.log(
  `Actualizados — nombre:${updatedName}, país:${updatedCountry}, grupo_EP:${updatedGroup}, imagen:${updatedImage}, ` +
  `partido:${updatedParty}, siglas:${updatedPartySig}`
);
if (noMatch) {
  console.warn(`Aviso: ${noMatch} miembros no tuvieron match en el CSV; se mantienen datos base.`);
}
