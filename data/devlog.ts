// data/devlog.ts
export type DevlogPost = {
  slug: string;
  title: string;
  date: string; // ISO "2025-11-02"
  summary: string;
  tags?: string[];
  content?: string; // opcional si luego haces página por slug
};

export const posts: DevlogPost[] = [
  {
    slug: "primer-prototipo-cuestionario",
    title: "Primer prototipo del cuestionario",
    date: "2025-11-02",
    summary: "Carga de 10 preguntas aleatorias, afinidad por cobertura/‘raw’ y ranking básico.",
    tags: ["quiz", "afinidad", "ui"]
  },
  {
    slug: "ranking-con-scroll-y-animaciones",
    title: "Ranking con scroll suave y animaciones",
    date: "2025-11-02",
    summary: "Transición colapsable y auto-scroll al revelar el ranking.",
    tags: ["ranking", "ux"]
  }
];
