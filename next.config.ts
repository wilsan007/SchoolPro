import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["*.ecolpro.app", "localhost:3000"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ecolpro.app" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
