// data/devlog.ts
export type DevlogPost = {
  slug: string;
  title: string;
  date: string;   // ISO: "2025-11-04"
  summary: string;
  content?: string;
};

export const posts: DevlogPost[] = [
  {
    slug: "partido-o-coalicion-en-candidaturas",
    title: "Añadido el partido o coalición electoral",
    date: "2025-11-04",
    summary:
      "Cada eurodiputado muestra la fuerza política o coalición con la que se presentó a las elecciones al Parlamento Europeo.",
  },
];
