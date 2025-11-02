// src/data/devlog.ts
export type DevlogPost = {
  slug: string;
  title: string;
  date: string;   // ISO: "2025-11-04"
  summary: string;
  content?: string;
};

export const posts: DevlogPost[] = [
  {
    "slug": "novedades-4-noviembre-2025",
    "title": "Novedades 4 de noviembre de 2025",
    "date": "2025-11-04",
    "summary": "Hola :)\r\n\r\nEste lunes 4 de noviembre se añadieron dos novedades para MEP Match:\r\n\r\n- Añadida esta página de novedades. Aquí se publicarán todas las cosas que se vayan introduciendo.\r\n- Añadido los partidos políticos o coaliciones electorales por las que se presentaron los eurodiputados."
  }
];
