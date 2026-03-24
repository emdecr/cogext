import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" mode makes `next build` output a self-contained server.
  // Instead of needing the full node_modules at runtime, it traces which
  // files are actually imported and copies only those into `.next/standalone/`.
  // This is what lets our Docker image be ~150MB instead of ~1GB.
  // The standalone folder contains its own `server.js` that you run with
  // `node server.js` — no `next start` needed.
  output: "standalone",
};

export default nextConfig;
