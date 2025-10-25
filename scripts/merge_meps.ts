// scripts/merge_meps.ts
import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseCsv } from "csv-parse/sync";

type MEPcsv = {
  mep_identifier: string;
  mep_given_name?: string;
  mep_family_name?: string;
  mep_official_given_name?: string;
  mep_official_family_name?: string;
  mep_country_of_representation?: string;
  mep_political_group?: string;
  mep_image?: string;
};

type Member = {
  id: string | number;
  name?: string | null;
  country?: string | null;
  group?: string | null;
  image?: string | null;
  photo?: string | null;
};

function tidy(s?: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function pickName(r: MEPcsv, fallback?: string | null): string {
  const given = tidy(r.mep_given_name);
  const fam = tidy(r.mep_family_name);
  const offGiven = tidy(r.mep_official_given_name);
  const offFam = tidy(r.mep_official_family_name);

  const a = [given, fam].filter(Boolean).join(" ");
  if (a) return a;

  const b = [offGiven, offFam].filter(Boolean).join(" ");
  if (b) return b;

  return tidy(fallback) || "";
}

function autodetectDelimiter(firstLine: string): "," | ";" {
  const sc = (firstLine.match(/;/g)?.length ?? 0);
  const cc = (firstLine.match(/,/g)?.length ?? 0);
  return sc >= cc ? ";" : ",";
}

const csvPath = "data/ep_meps_es.csv"; // CSV en castellano (con ;)
// Lee CSV (maneja UTF-8 con BOM)
const epCsv = readFileSync(csvPath, "utf8");
const firstLine = epCsv.split(/\r?\n/, 1)[0] ?? "";
const delimiter = autodetectDelimiter(firstLine);

const epRows = parseCsv(epCsv, {
  columns: true,
  delimiter,
  bom: true,
  skip_empty_lines: true,
  trim: true,
}) as MEPcsv[];

if (!epRows.length) {
  console.error("ERROR: CSV vacío o no legible:", csvPath);
  process.exit(1);
}

// Indexa por identificador
const epIndex = new Map(epRows.map((r) => [String(r.mep_identifier), r]));

// Lee miembros base
const membersPath = "public/data/members.json";
const members = JSON.parse(readFileSync(membersPath, "utf8")) as Member[];

let updatedName = 0;
let updatedCountry = 0;
let updatedGroup = 0;
let updatedImage = 0;
let noMatch = 0;

const enriched = members.map((m) => {
  const id = String(m.id);
  const row = epIndex.get(id);
  if (!row) {
    noMatch++;
    return {
      ...m,
      name: tidy(m.name || ""),
      country: m.country ?? null,
      group: m.group ?? null,
      image: m.image ?? m.photo ?? null,
    };
  }

  const nextName = pickName(row, m.name);
  const nextCountry = tidy(row.mep_country_of_representation) || (m.country ?? null) || null;
  const nextGroup = tidy(row.mep_political_group) || (m.group ?? null) || null;
  const nextImage = tidy(row.mep_image) || m.image || m.photo || null;

  if (nextName && tidy(m.name || "") !== nextName) updatedName++;
  if ((nextCountry || null) !== (m.country ?? null)) updatedCountry++;
  if ((nextGroup || null) !== (m.group ?? null)) updatedGroup++;
  if ((nextImage || null) !== (m.image ?? m.photo ?? null)) updatedImage++;

  return {
    ...m,
    name: nextName || m.name || null,
    country: nextCountry,
    group: nextGroup,
    image: nextImage,
  };
});

// Escribe resultado
const outPath = "public/data/members.enriched.json";
writeFileSync(outPath, JSON.stringify(enriched, null, 2), "utf8");

// Log resumen
const total = members.length;
console.log(
  `OK: ${total} miembros enriquecidos (fuente ${csvPath} con delimitador "${delimiter}")`
);
console.log(
  `Actualizados — nombre:${updatedName}, país:${updatedCountry}, grupo:${updatedGroup}, imagen:${updatedImage}`
);
if (noMatch) {
  console.warn(`Aviso: ${noMatch} miembros no tuvieron coincidencia en el CSV (se mantienen datos originales)`);
}
