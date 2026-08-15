import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Build output — un-anchored (**/) so nested copies are ignored too,
    // e.g. a stale .next inside a .claude/worktrees/* worktree. A root-anchored
    // ".next/**" misses those and floods lint with minified-chunk noise.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "next-env.d.ts",
    // Claude Code's working dir (worktrees, memory, its own builds) — never
    // our source, never lint it.
    ".claude/**",
  ]),
]);

export default eslintConfig;
