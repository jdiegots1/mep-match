// scripts/merge_meps.ts
import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseCsv } from "csv-parse/sync";

/** CSV del EP (ENRIQUECIDO EN CASTELLANO) */
type MEPcsv = {
  mep_identifier: string;

  // nombres (varias variantes)
  mep_given_name?: string;
  mep_family_name?: string;
  mep_official_given_name?: string;
  mep_official_family_name?: string;

  // país, grupo parlamentario europeo, foto
  mep_country_of_representation?: string;
  mep_political_group?: string;
  mep_image?: string;

  // NUEVO: partido/coalición y siglas (añadido por ti)
  mep_polgroup?: string;       // p.ej. "Sumar", "PP", "PSOE", "Coalición por ..."
  mep_polgroup_sig?: string;   // p.ej. "SUMAR", "PP", "PSOE"
};

/** Estructura del members.json base (de HTV) */
type MemberBase = {
  id: string | number;
  name?: string | null;
  country?: string | null;
  group?: string | null;      // grupo parlamentario europeo
  image?: string | null;
  photo?: string | null;      // a veces venía así
};

/** Estructura de salida (enriquecida) */
type MemberOut = {
  id: string;
  name: string;
  country: string | null;
  group: string | null;      // grupo parlamentario europeo (se mantiene)
  image: string | null;

  // NUEVO: partido/coalición nacional y siglas
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

/** Escoge el mejor nombre disponible (preferimos el oficial si existe) */
function pickName(r: MEPcsv, fallback?: string | null): string {
  const given = tidy(r.mep_given_name);
  const fam = tidy(r.mep_family_name);
  const offGiven = tidy(r.mep_official_given_name);
  const offFam = tidy(r.mep_official_family_name);

  const prefA = [offGiven, offFam].filter(Boolean).join(" ");
  const prefB = [given, fam].filter(Boolean).join(" ");

  const chosen = tidy(prefA || prefB || fallback || "");
  // Ponemos en Title Case suave (respetando preposiciones)
  return chosen
    .split(/\s+/)
    .map((w, i) => (i === 0 ? titleCase(w) : titleCase(w)))
    .join(" ");
}

/** Detecta si el CSV usa ; o , como separador */
function autodetectDelimiter(firstLine: string): "," | ";" {
  const sc = (firstLine.match(/;/g)?.length ?? 0);
  const cc = (firstLine.match(/,/g)?.length ?? 0);
  return sc >= cc ? ";" : ",";
}

// ----------- Config rutas -----------
const csvPath = "data/ep_meps_es.csv";           // TU CSV en ES con tus nuevas columnas
const membersPath = "public/data/members.json";  // Base generado por fetch_htv.ts
const outPath = "public/data/members.enriched.json";

// ----------- Carga CSV EP -----------
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

// ----------- Carga members base -----------
const membersBase = JSON.parse(readFileSync(membersPath, "utf8")) as MemberBase[];

let updatedName = 0;
let updatedCountry = 0;
let updatedGroup = 0;
let updatedImage = 0;
let updatedParty = 0;
let updatedPartySig = 0;
let noMatch = 0;

// ----------- Fusión -----------
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
  const nextGroup = tidy(row.mep_political_group) || (m.group ?? null) || null; // GRUPO PARLAMENTARIO EP
  const nextImage = tidy(row.mep_image) || m.image || m.photo || null;

  // NUEVO: partido/coalición nacional + siglas
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

// ----------- Escribe salida -----------
writeFileSync(outPath, JSON.stringify(enriched, null, 2), "utf8");

// ----------- Log -----------
const total = membersBase.length;
console.log(`OK merge_meps: ${total} miembros enriquecidos (fuente ${csvPath}, delimitador "${delimiter}")`);
console.log(
  `Actualizados — nombre:${updatedName}, país:${updatedCountry}, grupo_EP:${updatedGroup}, imagen:${updatedImage}, ` +
  `partido:${updatedParty}, siglas:${updatedPartySig}`
);
if (noMatch) {
  console.warn(`Aviso: ${noMatch} miembros no tuvieron match en el CSV; se mantienen datos base.`);
}
