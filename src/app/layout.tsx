import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { PWAProvider } from "@/components/providers/PWAProvider";
import { PWAEnhanced } from "@/components/providers/PWAEnhanced";
import { NativeProvider } from "@/components/providers/NativeProvider";
import { Dictionnaire } from "@/components/providers/dictionnaires";
import { Toaster } from "sonner";
import Script from "next/script";
import { getLocale } from "next-intl/server";
import "./globals.css";

// Body / UI — Plus Jakarta Sans (DESIGN.md)
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});
// Data / tables — Geist (sans-serif, avec tnum pour alignement des nombres)
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
// Code — JetBrains Mono (DESIGN.md)
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
// Display / Hero — Clash Grotesk est chargé via le CDN Fontshare (link dans <head>).
// La variable CSS --font-clash est définie dans globals.css.

const CLASH_GROTESK_CSS =
  "https://api.fontshare.com/v2/css?f[]=clash-grotesk@400,500,600,700&display=swap";

export const metadata: Metadata = {
  title: {
    template: "%s | SchoolPro",
    default: "SchoolPro — Gestion scolaire moderne",
  },
  description:
    "Plateforme SaaS multi-tenant pour la gestion d'établissements scolaires. Élèves, absences, notes, examens, parents — tout en un.",
  keywords: ["école", "gestion scolaire", "SaaS", "Afrique", "notes", "absences"],
  authors: [{ name: "SchoolPro" }],
  creator: "SchoolPro",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    title: "SchoolPro — Gestion scolaire moderne",
    description: "La plateforme scolaire de nouvelle génération pour l'Afrique",
    siteName: "SchoolPro",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0ea5e9" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SchoolPro" />
        {/* Clash Grotesk (display/hero) — CDN Fontshare, conformément au DESIGN.md.
            Chargée SANS bloquer le rendu : une feuille de style externe dans le
            <head> suspend l'affichage de chaque document (donc de chaque
            fenêtre du workspace) tant que le CDN n'a pas répondu. La police
            étant en `display=swap`, le texte s'affiche aussitôt avec la police
            de repli, puis bascule. `next/script` (en fin de <body>) pose la
            feuille après coup ; la balise noscript garde le comportement
            d'origine sans JavaScript. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <noscript>
          <link href={CLASH_GROTESK_CSS} rel="stylesheet" />
        </noscript>
      </head>
      <body className={`${jakarta.variable} ${geist.variable} ${jetbrains.variable} font-sans antialiased`}>
        {/* Le dictionnaire n'est PAS passé en prop : voir `providers/dictionnaires`. */}
        <Dictionnaire locale={locale}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <PWAProvider />
            <PWAEnhanced />
            <NativeProvider />
            {children}
            <Toaster position="top-right" richColors closeButton />
            <Script id="clash-grotesk" strategy="afterInteractive">
              {`(function(){var l=document.createElement("link");l.rel="stylesheet";l.href=${JSON.stringify(CLASH_GROTESK_CSS)};document.head.appendChild(l)})()`}
            </Script>
          </ThemeProvider>
        </Dictionnaire>
      </body>
    </html>
  );
}
