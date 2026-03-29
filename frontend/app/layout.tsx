import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinTrack AI – Gestión de Gastos Inteligente",
  description:
    "Registra y analiza tus gastos con inteligencia artificial. Multi-moneda, cotizaciones en tiempo real.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#0f172a] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
