import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isProd = process.env.NODE_ENV === "production";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Le type checking est désactivé pendant le build Docker pour éviter
  // l'OOM sur le builder Fly.io/Depot (2 GB RAM). Il est déjà vérifié
  // localement via `pnpm tsc --noEmit` et le pre-commit hook.
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPECHECK === "true",
  },
  /**
   * Paquets laissés à Node, jamais empaquetés par le bundler serveur.
   *
   * Les trois portent du code natif ou lancent des workers, et le bundling les
   * casse silencieusement : `tesseract.js` ne retrouve plus son worker,
   * `@napi-rs/canvas` et `sharp` ne retrouvent plus leur binaire `.node`. Le
   * symptôme est un OCR qui échoue en production alors qu'il fonctionne en
   * développement — d'où cette déclaration, qui n'est pas une optimisation.
   */
  serverExternalPackages: ["tesseract.js", "@napi-rs/canvas", "sharp"],
  experimental: {
    serverActions: {
      // Seul le domaine de production et les hôtes locaux sont autorisés.
      // Les jokers d'anciennes plateformes (*.netlify.app, *.pages.dev,
      // *.vercel.app) sont retirés : ils permettent à n'importe quel
      // sous-domaine de ces plateformes d'appeler nos Server Actions.
      allowedOrigins: ["*.ecolpro.app", "localhost:3000", "localhost:3001", "localhost:3002", "localhost:3003", "localhost:3004", "localhost:3005", "10.139.161.24:3003"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ecolpro.app" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    const securityHeaders = [
      // SAMEORIGIN (et non DENY) : le workspace charge les modules en
      // iframes same-origin (?embedded=1). DENY bloquerait tout framing,
      // contredisant frame-ancestors 'self' dans la CSP.
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      ...(isProd
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains; preload",
            },
          ]
        : []),
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          // `unsafe-eval` n'est requis QU'EN dev (HMR / react-refresh de
          // Next.js). En production il ouvrirait une porte à l'exécution de
          // code injecté : on ne le laisse jamais passer côté prod.
          isProd
            ? "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"
            : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
          "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
          "img-src 'self' data: https: blob:",
          "font-src 'self' data: https://cdn.fontshare.com",
          // Origines externes réellement appelées par l'app. Les hôtes
          // localhost ne sont autorisés qu'en dev ; les jokers d'anciennes
          // plateformes (netlify/vercel/pages.dev) sont retirés — le site est
          // auto-hébergé sur VPS.
          [
            "connect-src 'self'",
            "https://api.africastalking.com",
            "https://api.sandbox.africastalking.com",
            "https://api.resend.com",
            "https://graph.facebook.com",
            "https://api.telegram.org",
            "https://api.stripe.com",
            ...(isProd ? [] : ["http://localhost:*", "http://127.0.0.1:*"]),
          ].join(" "),
          // frame-ancestors 'self' : le workspace charge les modules en
          // iframes same-origin (?embedded=1). En dev, on autorise aussi
          // localhost pour le HMR.
          ...(isProd
            ? ["frame-ancestors 'self'"]
            : ["frame-ancestors 'self' http://localhost:* http://127.0.0.1:*"]),
          // frame-src 'self' : les iframes du workspace sont same-origin.
          // Turnstile rend son widget dans une iframe depuis challenges.cloudflare.com.
          ...(isProd
            ? ["frame-src 'self' https://challenges.cloudflare.com"]
            : ["frame-src 'self' https://challenges.cloudflare.com http://localhost:* http://127.0.0.1:*"]),
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          ...(isProd ? ["upgrade-insecure-requests", "block-all-mixed-content"] : []),
        ].join("; "),
      },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
      },
    ];

    return [
      // --- En-têtes de sécurité globaux ---
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // --- CORS pour API mobile ---
      {
        source: "/api/mobile/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
      {
        source: "/api/auth/mobile",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
      // --- Stripe webhook : autoriser la signature Stripe ---
      {
        source: "/api/stripe/webhook",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, stripe-signature" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
