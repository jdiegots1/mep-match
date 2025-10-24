import { writeFileSync, readFileSync } from "node:fs";
import { fetch } from "undici";
import { XMLParser } from "fast-xml-parser";

type Vote = { id:string; title:string; date:string; type:string|null };

function epXmlUrl(date:string) {
  // 10ª legislatura, acta ES, anexo RCV (XML)
  return `https://www.europarl.europa.eu/doceo/document/PV-10-${date}-RCV_ES.xml`;
}
function epHtmlUrl(date:string) {
  return `https://www.europarl.europa.eu/doceo/document/PV-10-${date}-RCV_ES.html`;
}

async function fetchXml(url:string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return await res.text();
}

async function main() {
  const votes: Vote[] = JSON.parse(readFileSync("public/data/votes_2025_main.json","utf8"));
  // agrupa por fecha para minimizar descargas
  const byDate = new Map<string, Vote[]>();
  for (const v of votes) (byDate.get(v.date) ?? byDate.set(v.date, []).get(v.date)!).push(v);

  const parser = new XMLParser({
    ignoreAttributes:false,
    attributeNamePrefix:"",
    textNodeName:"_t",
    trimValues:true
  });

  // mapa id -> título ES
  const esTitle: Record<string,string> = {};
  const esUrl: Record<string,string> = {};

  for (const [date, arr] of byDate) {
    const url = epXmlUrl(date);
    try {
      const xml = await fetchXml(url);
      const root = parser.parse(xml);
      // estructura: PV.RollCallVoteResults -> RollCallVote.Result (lista)
      const list = root?.["PV.RollCallVoteResults"]?.["RollCallVote.Result"];
      if (!list) continue;

      // normaliza a array
      const results = Array.isArray(list) ? list : [list];
      // índice por Identifier
      const byId: Record<string, any> = {};
      for (const item of results) {
        const id = String(item?.Identifier ?? "");
        if (!id) continue;
        // En ES, la descripción ya está en castellano:
        const desc = item?.["RollCallVote.Description.Text"];
        const title = typeof desc === "string" ? desc : (Array.isArray(desc)?desc[0]:null);
        if (title) { byId[id] = { title }; }
      }

      for (const v of arr) {
        const hit = byId[v.id];
        if (hit?.title) {
          esTitle[v.id] = hit.title.replace(/\s+/g," ").trim();
          esUrl[v.id] = epHtmlUrl(date); // apuntamos al HTML legible en ES
        }
      }
      console.log(`OK ${date}: ${arr.filter(x=>esTitle[x.id]).length}/${arr.length} títulos ES`);
    } catch {
      console.warn(`Saltada ${date}: no se pudo leer XML ES`);
    }
  }

  // compón fichero ES fusionado (sin tocar el original)
  const out = votes.map(v => ({
    ...v,
    title: esTitle[v.id] ?? v.title,   // si hay ES, lo ponemos; si no, dejamos EN
    url: esUrl[v.id] ?? null
  }));

  writeFileSync("public/data/votes_2025_main.es.json", JSON.stringify(out, null, 2), "utf8");
  console.log(`Generado votes_2025_main.es.json con ${Object.keys(esTitle).length} títulos en castellano`);
}

main().catch(e => { console.error(e); process.exit(1); });
