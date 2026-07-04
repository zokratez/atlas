import type { NextConfig } from "next";

const noStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/api/:path*", headers: noStoreHeaders },
      { source: "/feed", headers: noStoreHeaders },
      { source: "/queue", headers: noStoreHeaders },
      { source: "/experiments", headers: noStoreHeaders },
      { source: "/costs", headers: noStoreHeaders },
    ];
  },
};

export default nextConfig;
