import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI CV Koçu — nejdettut.com",
  description:
    "CV'ni PDF veya metin olarak yükle, iş ilanıyla karşılaştır: uyum skoru, ATS uyumlu güçlendirilmiş CV, kişiye özel ön yazı ve 30-60-90 günlük kariyer planı.",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
