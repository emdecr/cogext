# Brain Extension

A self-hosted second brain for collecting, organizing, and rediscovering ideas. Save images, quotes, articles, links, and notes — then search, chat with, and reflect on everything you've saved using AI.

Built as an alternative to tools like mymind.com, with full ownership of your data and no algorithmic feed shaping what you see.

## Features

- **AI auto-tagging** — records are automatically tagged on save using a local LLM (Ollama), no manual organization needed
- **Semantic search** — find records by meaning, not just keywords, powered by pgvector embeddings
- **RAG chat** — ask questions about your saved knowledge and get answers grounded in your own records
- **Image analysis** — uploaded images are analyzed via Claude Vision and made searchable by their visual content
- **Weekly reflections** — AI-generated digests that surface patterns, connections, and themes across your recent saves, with media recommendations for deeper exploration
- **Collections** — manually curate and reorder groups of records with drag-and-drop
- **Command palette** — keyboard-first navigation and search (⌘K)

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 16 (App Router, React 19) | Server Components + Server Actions keep the AI/DB logic server-side with minimal client JS |
| Database | PostgreSQL 17 + pgvector | Vector similarity search alongside relational data in one database — no separate vector DB to manage |
| ORM | Drizzle | Type-safe queries, lightweight, generates raw SQL migrations |
| Embeddings | Ollama (nomic-embed-text) | Runs locally, no API costs for embeddings |
| Tagging LLM | Ollama (llama3.2:1b) | Fast local inference for auto-tagging |
| Chat / Vision | Claude API (Sonnet) | High-quality RAG responses and image analysis |
| Object Storage | Local filesystem (dev) / MinIO (prod) | S3-compatible, self-hosted — provider pattern abstracts the switch |
| Auth | Custom JWT + bcrypt | HTTP-only cookies, middleware-based route protection, no third-party auth dependency |
| Styling | Tailwind CSS + Radix UI | Utility-first CSS with accessible, unstyled primitives |
| Containerization | Docker + Docker Compose | Multi-stage build (~150MB image), single `docker compose up` for the full stack |

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────────────┐
│   Browser    │────▶│  Next.js App (Server Components + API Routes)   │
└─────────────┘     └──────┬──────────┬──────────────┬────────────────┘
                           │          │              │
                    ┌──────▼──────┐ ┌─▼────────┐ ┌──▼──────────┐
                    │ PostgreSQL  │ │  Ollama   │ │ Claude API  │
                    │ + pgvector  │ │ (local)   │ │ (external)  │
                    └─────────────┘ └──────────┘ └─────────────┘
```

**How AI features work:**

1. **Save** — user creates a record (any type). If it's an image, Claude Vision generates a rich text description.
2. **Embed** — Ollama produces a 768-dim vector embedding from the record's text content and stores it alongside the record in Postgres.
3. **Tag** — Ollama's LLM generates 3–5 tags based on the content. All three steps run async after save.
4. **Search** — queries are embedded with the same model, then matched against stored vectors via pgvector's HNSW index (cosine similarity). Keyword search runs in parallel.
5. **Chat** — relevant records are retrieved via semantic search and injected as context into a Claude prompt (RAG). Responses stream back to the client.
6. **Reflect** — a weekly job collects recent records, feeds them to Claude with the user's AI profile, and generates a reflection digest with themed media recommendations.

## Getting Started

### Prerequisites

- Node.js 22+
- Docker Desktop (for Postgres + Ollama in dev)
- An [Anthropic API key](https://console.anthropic.com/) (for chat, image analysis, and reflections)

### Local Development Setup

```bash
# 1. Clone and install
git clone https://github.com/emdecr/brain-ext.git
cd brain-ext
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum, set ANTHROPIC_API_KEY

# 3. Start Postgres + Ollama
docker compose up -d

# 4. Run database migrations
npx drizzle-kit migrate

# 5. Start the dev server
npm run dev
```

The app will be available at `http://localhost:3000`. Register an account to get started.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgres://brain:brain@localhost:5435/brain_extension` | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Secret for signing auth tokens (≥32 chars in production) |
| `ANTHROPIC_API_KEY` | No | — | Enables chat, image analysis, and reflections |
| `CHAT_MODEL` | No | `claude-sonnet-4-20250514` | Claude model for chat and RAG |
| `AI_BASE_URL` | No | `http://localhost:11434` | Ollama API endpoint |
| `EMBED_MODEL` | No | `nomic-embed-text` | Ollama model for embeddings |
| `LLM_MODEL` | No | `llama3.2:1b` | Ollama model for auto-tagging |
| `STORAGE_PROVIDER` | No | `local` | `local` or `minio` |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Public-facing app URL |

See `.env.example` for the full list, including MinIO and CRON configuration.

## Testing

```bash
# Unit + component tests (Vitest + React Testing Library)
npm test              # watch mode
npm run test:run      # single run
npm run test:unit     # unit tests only

# Integration tests (requires running database)
npm run test:integration

# E2E tests (Playwright — starts its own dev server on :3100)
npm run test:e2e
npm run test:e2e:ui   # interactive mode

# Coverage report
npm run test:coverage
```

## Deployment

### VPS with Docker Compose

```bash
# 1. Clone the repo on your server
git clone https://github.com/emdecr/brain-ext.git && cd brain-ext

# 2. Create production env file
cp .env.example .env.prod
# Edit .env.prod:
#   - Set a strong JWT_SECRET (≥32 random chars)
#   - Set ANTHROPIC_API_KEY
#   - Set STORAGE_PROVIDER=minio and configure MinIO credentials
#   - Set NEXT_PUBLIC_APP_URL to your domain

# 3. Pull Ollama models (happens inside the container)
# The entrypoint handles this automatically on first start

# 4. Start everything
docker compose -f docker-compose.prod.yml up -d

# 5. Verify
curl http://localhost:3000/api/health
```

The production stack runs 4 services on an internal Docker network:

| Service | Port | Notes |
|---------|------|-------|
| **app** | 3000 (exposed) | Next.js standalone server, runs migrations on startup |
| **db** | 5432 (internal) | PostgreSQL 17 + pgvector, not exposed to host |
| **minio** | 9001 (console) | S3-compatible object storage, API on internal port 9000 |
| **ollama** | 11434 (internal) | Local LLM inference, GPU passthrough optional |

**Next steps after deployment:**
- Set up a reverse proxy (Caddy or nginx) with SSL terminating on port 3000
- Schedule backups with `scripts/backup.sh` via cron
- Restore from backup with `scripts/restore.sh`

### CI/CD via GitHub Actions

The repo includes a CI pipeline (`.github/workflows/ci.yml`) that runs on every push and PR to `main`:

- **Lint + typecheck** — `next lint` and `tsc --noEmit`
- **Unit tests** — Vitest
- **Build verification** — full production build
- **Docker image** — builds and pushes to `ghcr.io` on `main` (tagged with commit SHA + `latest`)

To enable Docker pushes, the workflow uses `GITHUB_TOKEN` (automatic in GitHub Actions). No additional secrets needed for CI.

## Project Structure

```
brain-extension/
├── .github/workflows/     # CI pipeline
├── drizzle/                # Generated SQL migrations
├── e2e/                    # Playwright E2E tests
├── scripts/
│   ├── backup.sh           # Database + storage backup
│   ├── restore.sh          # Restore from backup
│   └── migrate.mjs         # Standalone migration runner (used in Docker)
├── src/
│   ├── app/                # Next.js routes, pages, and API routes
│   │   └── api/            # REST endpoints (auth, chat, upload, health, reflections)
│   ├── components/         # React components (forms, cards, command palette, etc.)
│   ├── db/
│   │   ├── index.ts        # Database connection pool
│   │   └── schema.ts       # Drizzle schema (11 tables, pgvector index)
│   ├── lib/
│   │   ├── actions/        # Server Actions (records, search, tags, collections, reflections)
│   │   ├── ai/             # AI providers (embeddings, tagging, chat, image analysis, reflections)
│   │   ├── storage/        # Storage abstraction (local filesystem / MinIO)
│   │   ├── auth.ts         # Session management
│   │   ├── config.ts       # Centralized env var config with validation
│   │   ├── logger.ts       # Structured logging (JSON in prod)
│   │   └── rate-limit.ts   # In-memory rate limiting
│   ├── middleware.ts        # Auth middleware for route protection
│   └── test/               # Test setup, helpers, and mocks
├── Dockerfile              # Multi-stage build (node:22-alpine, ~150MB)
├── docker-compose.yml      # Dev services (Postgres + Ollama)
├── docker-compose.prod.yml # Production stack (app + db + minio + ollama)
└── docker-entrypoint.sh    # Runs migrations, then starts the server
```
