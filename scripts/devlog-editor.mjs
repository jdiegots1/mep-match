#!/usr/bin/env node
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import slugify from "slugify";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "src", "data");           // <<< src/data
const JSON_PATH = path.join(DATA_DIR, "devlog.json");       // <<< src/data/devlog.json
const TS_PATH   = path.join(DATA_DIR, "devlog.ts");         // <<< src/data/devlog.ts

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson() {
  ensureDirs();
  if (!fs.existsSync(JSON_PATH)) {
    const seed = {
      posts: [
        {
          slug: "partido-o-coalicion-en-candidaturas",
          title: "Añadido el partido o coalición electoral",
          date: "2025-11-04",
          summary:
            "Cada eurodiputado muestra la fuerza política o coalición con la que se presentó a las elecciones al Parlamento Europeo."
        }
      ]
    };
    fs.writeFileSync(JSON_PATH, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
  const raw = fs.readFileSync(JSON_PATH, "utf8");
  try { return JSON.parse(raw); } catch {
    console.error("src/data/devlog.json corrupto. Arregla el JSON.");
    process.exit(1);
  }
}

function saveJson(data) {
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), "utf8");
}

function toTsModule(posts) {
  const header =
`// src/data/devlog.ts
export type DevlogPost = {
  slug: string;
  title: string;
  date: string;   // ISO: "2025-11-04"
  summary: string;
  content?: string;
};

export const posts: DevlogPost[] = `;
  const body = JSON.stringify(posts, null, 2);
  return `${header}${body};\n`;
}

function saveTs(posts) {
  fs.writeFileSync(TS_PATH, toTsModule(posts), "utf8");
  console.log(`✔ Generado ${path.relative(ROOT, TS_PATH)}`);
}

function genSlug(title) {
  return slugify(title, { lower: true, strict: true, locale: "es" });
}

async function promptMain(posts) {
  const choices = [
    { name: "➕ Añadir entrada", value: "add" },
    ...(posts.length
      ? [{ name: "✏️  Editar entrada", value: "edit" },
         { name: "🗑️  Borrar entrada", value: "delete" }]
      : []),
    new inquirer.Separator(),
    { name: "💾 Guardar y reconstruir devlog.ts", value: "save" },
    { name: "Salir", value: "exit" },
  ];
  const { action } = await inquirer.prompt([
    { type: "list", name: "action", message: "¿Qué quieres hacer?", choices }
  ]);
  return action;
}

async function promptPick(posts, msg = "Elige entrada") {
  const { slug } = await inquirer.prompt([
    {
      type: "list",
      name: "slug",
      message: msg,
      choices: posts
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map(p => ({ name: `${p.title} (${p.date})`, value: p.slug }))
    }
  ]);
  return posts.find(p => p.slug === slug);
}

async function promptEdit(base = {}) {
  const defaults = {
    title: base.title ?? "",
    date: base.date ?? new Date().toISOString().slice(0, 10),
    summary: base.summary ?? "",
    slug: base.slug ?? (base.title ? genSlug(base.title) : "")
  };

  const { title } = await inquirer.prompt([
    { type: "input", name: "title", message: "Título:", default: defaults.title, validate: v => v.trim() ? true : "Obligatorio" }
  ]);

  const proposedSlug = base.slug ? base.slug : genSlug(title);

  const { slug } = await inquirer.prompt([
    { type: "input", name: "slug", message: "Slug:", default: proposedSlug, filter: v => genSlug(v || title) }
  ]);

  const { date } = await inquirer.prompt([
    { type: "input", name: "date", message: "Fecha (YYYY-MM-DD):", default: defaults.date, validate: v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? true : "Formato YYYY-MM-DD" }
  ]);

  const { summary } = await inquirer.prompt([
    { type: "editor", name: "summary", message: "Resumen (multilínea, guarda y cierra el editor):", default: defaults.summary }
  ]);

  return { slug, title, date, summary };
}

async function run() {
  const state = loadJson();
  let posts = state.posts || [];

  while (true) {
    const action = await promptMain(posts);

    if (action === "add") {
      const entry = await promptEdit();
      const exists = posts.some(p => p.slug === entry.slug);
      if (exists) {
        const { overwrite } = await inquirer.prompt([
          { type: "confirm", name: "overwrite", message: `Ya existe slug "${entry.slug}". ¿Sobrescribir?`, default: false }
        ]);
        if (!overwrite) continue;
        posts = posts.map(p => (p.slug === entry.slug ? entry : p));
      } else {
        posts.push(entry);
      }
      console.log("✔ Entrada añadida/actualizada.");

    } else if (action === "edit") {
      if (!posts.length) continue;
      const picked = await promptPick(posts, "Editar");
      const updated = await promptEdit(picked);
      posts = posts.map(p => (p.slug === picked.slug ? updated : p));
      console.log("✔ Entrada actualizada.");

    } else if (action === "delete") {
      if (!posts.length) continue;
      const picked = await promptPick(posts, "Borrar");
      const { ok } = await inquirer.prompt([
        { type: "confirm", name: "ok", message: `¿Borrar "${picked.title}"?`, default: false }
      ]);
      if (ok) {
        posts = posts.filter(p => p.slug !== picked.slug);
        console.log("✔ Entrada borrada.");
      }

    } else if (action === "save") {
      posts.sort((a, b) => (a.date < b.date ? 1 : -1));
      saveJson({ posts });
      saveTs(posts);
      console.log(`✔ Guardado ${path.relative(ROOT, JSON_PATH)} y regenerado devlog.ts`);

    } else if (action === "exit") {
      break;
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
