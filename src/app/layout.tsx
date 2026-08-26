import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { PWAProvider } from "@/components/providers/PWAProvider";
import { PWAEnhanced } from "@/components/providers/PWAEnhanced";
import { NativeProvider } from "@/components/providers/NativeProvider";
import { Toaster } from "sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
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
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0ea5e9" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SchoolPro" />
        {/* Clash Grotesk (display/hero) — CDN Fontshare, conformément au DESIGN.md */}
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-grotesk@400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${jakarta.variable} ${geist.variable} ${jetbrains.variable} font-sans antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
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
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
