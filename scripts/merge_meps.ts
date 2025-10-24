import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseCsv } from "csv-parse/sync";

type MEPcsv = {
  mep_identifier:string;
  mep_official_given_name:string; mep_official_family_name:string;
  mep_country_of_representation?:string; mep_political_group?:string; mep_image?:string;
};

const epCsv = readFileSync("data/ep_meps.csv","utf8");
const epRows = parseCsv(epCsv, { columns: true }) as MEPcsv[];
const epIndex = new Map(epRows.map(r => [String(r.mep_identifier), r]));

const members = JSON.parse(readFileSync("public/data/members.json","utf8"));
const enriched = members.map((m:any) => {
  const r = epIndex.get(String(m.id));
  if (!r) return m;
  const name = `${(r.mep_official_given_name||"").trim()} ${(r.mep_official_family_name||"").trim()}`.replace(/\s+/g," ").trim();
  return {
    ...m,
    name: name || m.name,
    country: r.mep_country_of_representation || m.country || null,
    group: r.mep_political_group || null,
    image: r.mep_image || null
  };
});

writeFileSync("public/data/members.enriched.json", JSON.stringify(enriched, null, 2), "utf8");
console.log(`OK: ${enriched.length} miembros con nombre/foto/grupo`);
