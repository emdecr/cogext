import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" mode makes `next build` output a self-contained server.
  // Instead of needing the full node_modules at runtime, it traces which
  // files are actually imported and copies only those into `.next/standalone/`.
  // This is what lets our Docker image be ~150MB instead of ~1GB.
  // The standalone folder contains its own `server.js` that you run with
  // `node server.js` — no `next start` needed.
  output: "standalone",

  // sharp uses native binaries (libvips) that can't be bundled by webpack.
  // Marking it as external tells Next.js to load it from node_modules at runtime.
  // In standalone mode, Next.js automatically copies the correct platform binary.
  serverExternalPackages: ["sharp"],

  // ===========================================================================
  // SECURITY HEADERS
  // ===========================================================================
  //
  // These HTTP headers add defense-in-depth against common web attacks.
  // They're set on EVERY response via Next.js's built-in headers config.
  //
  // Why headers instead of middleware?
  //   Next.js middleware runs on the Edge Runtime and can set headers, but
  //   using the config is simpler, faster (no runtime code), and applies
  //   to ALL responses — including static files that skip middleware.
  //
  // These headers are "free" security — zero performance cost, zero
  // behavior change for legitimate users, but they close off entire
  // categories of attacks.
  // ===========================================================================
  headers: async () => [
    {
      // Apply to all routes
      source: "/:path*",
      headers: [
        // --- X-Content-Type-Options ---
        // Prevents browsers from "MIME sniffing" — guessing the content type
        // of a response by inspecting the body. Without this, a browser might
        // interpret a text file as JavaScript and execute it.
        // Example attack: upload a .txt file containing <script>alert(1)</script>,
        // browser sniffs it as HTML → XSS.
        { key: "X-Content-Type-Options", value: "nosniff" },

        // --- X-Frame-Options ---
        // Prevents your site from being embedded in an <iframe> on another site.
        // This blocks "clickjacking" attacks where an attacker overlays an
        // invisible iframe of your site on top of a legitimate-looking page,
        // tricking users into clicking buttons they can't see.
        // DENY = never allow framing (even by your own domain).
        { key: "X-Frame-Options", value: "DENY" },

        // --- Referrer-Policy ---
        // Controls what information is sent in the Referer header when
        // navigating away from your site. "strict-origin-when-cross-origin"
        // means: send the full URL for same-origin requests, but only the
        // origin (no path) for cross-origin requests. This prevents leaking
        // sensitive URL paths (like /records/secret-id) to external sites.
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

        // --- Strict-Transport-Security (HSTS) ---
        // Tells browsers to ONLY connect via HTTPS for the next year.
        // After the first visit, even if the user types http://, the browser
        // will automatically upgrade to https:// — preventing SSL-stripping
        // attacks where a middleman downgrades the connection.
        // max-age=31536000 = 1 year in seconds.
        // includeSubDomains = also enforce on subdomains (e.g., files.yourdomain.com).
        //
        // Note: This only takes effect when served over HTTPS. In local dev
        // (http://localhost), browsers ignore it — no harm done.
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },

        // --- Permissions-Policy ---
        // Restricts which browser features your site can use.
        // We disable camera, microphone, and geolocation since this app
        // doesn't need them. This prevents any injected script from
        // silently accessing these sensitive APIs.
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

export default nextConfig;
