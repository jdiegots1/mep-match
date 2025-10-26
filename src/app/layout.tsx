import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "¿A qué eurodiputado me parezco?",
  description: "Juega con votaciones del Parlamento Europeo (HowTheyVote.eu).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body
        className={`${roboto.variable} font-sans antialiased min-h-dvh bg-gradient-to-b from-[#001b6b] via-[#002a8a] to-[#003399] text-white`}
      >
        {children}
        <footer className="text-xs/relaxed text-white/70 p-4 text-center">
        Los datos fueron extraídos de{" "}
        <a
          href="https://howtheyvote.eu"
          target="_blank"
          rel="noopener noreferrer"
        >
          <strong>HowTheyVote.eu</strong>
        </a>{" "}
        y del{" "}
        <a
          href="https://data.europarl.europa.eu"
          target="_blank"
          rel="noopener noreferrer"
        >
          <strong>Portal de Datos Abiertos del Parlamento Europeo</strong>
        </a>
        .
      </footer>
      </body>
    </html>
  );
}
