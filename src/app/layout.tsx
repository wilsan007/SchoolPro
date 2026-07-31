import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { PWAProvider } from "@/components/providers/PWAProvider";
import { PWAEnhanced } from "@/components/providers/PWAEnhanced";
import { NativeProvider } from "@/components/providers/NativeProvider";
import { Toaster } from "sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | EcolPro",
    default: "EcolPro — Gestion scolaire moderne",
  },
  description:
    "Plateforme SaaS multi-tenant pour la gestion d'établissements scolaires. Élèves, absences, notes, examens, parents — tout en un.",
  keywords: ["école", "gestion scolaire", "SaaS", "Afrique", "notes", "absences"],
  authors: [{ name: "EcolPro" }],
  creator: "EcolPro",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    title: "EcolPro — Gestion scolaire moderne",
    description: "La plateforme scolaire de nouvelle génération pour l'Afrique",
    siteName: "EcolPro",
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
        <meta name="theme-color" content="#6366f1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="EcolPro" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
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
