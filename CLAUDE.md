# CLAUDE.md

Guidance for Claude Code working in this repo. Keep this file short — link to docs, don't duplicate them.

## What this project is

Self-hosted personal knowledge base. Save records (images, quotes, articles, links, notes), auto-tag with Claude, embed with Voyage, chat over them with RAG, and get weekly reflections. Next.js 16 + PostgreSQL 17 + pgvector, deployed via Docker Compose.

## Authoritative docs (read in this order)

- [README.md](README.md) — user-facing setup and feature overview. **Current.**
- [SPEC.md](SPEC.md) — architectural decisions and rationale. **Canonical.** When code disagrees with SPEC.md, code wins; flag the drift.
- [DEPLOY.md](DEPLOY.md) — production deploy, backup, restore, teardown. Includes the DR runbook.
- [plans/2026-03-24-PLAN.md](plans/2026-03-24-PLAN.md) — improvement backlog and historical implementation notes. **Plan files are datestamped `YYYY-MM-DD-<name>.md`.**

## Non-obvious things to know before editing

- **AI providers are swapped in one file.** `src/lib/ai/index.ts` picks between Voyage/Claude (cloud, default) and Ollama (local). All feature code depends only on the `EmbeddingProvider` and `LLMProvider` interfaces in [src/lib/ai/types.ts](src/lib/ai/types.ts). Never import a concrete provider outside `src/lib/ai/`.
- **Two chat providers, not one.** `getLLMProvider()` is used for auto-tagging (cheap/local-friendly); `getChatProvider()` is used for RAG chat and reflections (Claude). Don't collapse them.
- **Streaming shape.** `chatStream()` returns an `AsyncGenerator<string>`. Convert to `ReadableStream` only at the API route boundary (`/api/chat`).
- **Server Actions vs API routes.** CRUD goes through server actions in `src/lib/actions/`. API routes are reserved for auth, file uploads, and streaming (chat, reflections). Don't add mutation logic to routes without a reason.
- **JWT in middleware uses `jose`, not `jsonwebtoken`.** Next.js middleware runs on the Edge Runtime. Both verify the same tokens; pick by runtime.
- **Rate limiting is in-memory** (`src/lib/rate-limit.ts`). Single-instance only. Don't scale horizontally without swapping this.
- **Background AI work must not call `revalidatePath`.** Embedding and auto-tagging run async after save; calling `revalidatePath` from that context throws.
- **`src/lib/config.ts` is the only place to read env vars.** `requireEnv()` fails loudly at startup.

## Local dev

- Postgres runs in Docker on **host port 5435** → container 5432 (avoids collision with a system Postgres). Use `postgres://…@localhost:5435/…` in `.env`.
- Start the stack: `docker compose up -d` then `npm run dev`.
- Migrations: `npm run db:generate` (create from schema), `npm run db:migrate` (apply locally), `npm run db:migrate:prod` (used inside the prod image; `scripts/migrate.mjs`).
- Ollama is optional — only needed if you flip `src/lib/ai/index.ts` to the local providers.

## Tests

- `npm run test` / `test:unit` — Vitest, no external deps.
- `npm run test:integration` — needs a live Postgres reachable at `DATABASE_URL`. The setup file (`src/test/setup.integration.ts`) may not exist yet; the vitest config comment tells you what it should contain when you write it.
- `npm run test:e2e` — Playwright. Assumes the dev server is running.
- CI runs lint + typecheck + unit tests + `next build` + Docker build. See `.github/workflows/`.

## Conventions I've been burned by

- **Don't add `.env.local`.** The project standardized on a single `.env` file (Next.js and drizzle-kit both load it). See SPEC.md.
- **Env var names are provider-agnostic** (`AI_BASE_URL`, `EMBED_MODEL`, `LLM_MODEL`) — don't reintroduce `OLLAMA_*`.
- **`embedding_model` is stored per record.** When changing embedding models, existing records keep working; re-embedding is a deliberate opt-in via `scripts/re-embed-all.ts`.
- **Tags are global**, not per-user. Records link via `record_tags`. "Find or create" on tag add.
- **Cron endpoints accept `Authorization: Bearer $CRON_SECRET`** in addition to session cookie. `/api/reflections/generate` is the current example.

## When answering questions

- If the user asks about deploy/backup/restore, the answer is in DEPLOY.md — read it first.
- If a change touches `src/lib/ai/**`, run `npx tsc --noEmit` before reporting done. Provider interface drift is easy to miss.
- Don't propose horizontal scaling changes without flagging the in-memory rate limiter and any `revalidatePath`-from-background traps.
