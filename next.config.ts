import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isProd = process.env.NODE_ENV === "production";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      allowedOrigins: ["*.ecolpro.app", "*.netlify.app", "*.pages.dev", "*.vercel.app", "localhost:3000", "localhost:3001", "localhost:3002", "localhost:3003", "localhost:3004", "localhost:3005", "10.139.161.24:3003"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ecolpro.app" },
      { protocol: "https", hostname: "**.pages.dev" },
      { protocol: "https", hostname: "**.vercel.app" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https: blob:",
          "font-src 'self' data:",
          "connect-src 'self' https://*.netlify.app https://*.pages.dev https://*.vercel.app https://api.africastalking.com https://api.sandbox.africastalking.com https://api.resend.com https://graph.facebook.com https://api.telegram.org https://api.stripe.com http://localhost:* http://127.0.0.1:*",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          ...(isProd ? ["upgrade-insecure-requests"] : []),
        ].join("; "),
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
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
