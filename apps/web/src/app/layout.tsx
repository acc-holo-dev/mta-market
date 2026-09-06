import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTA Market — Marketplace серверных ресурсов",
  description: "DRM-защищённая площадка продаж серверных ресурсов для MTA:SA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
