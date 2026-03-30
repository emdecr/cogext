# CogExt

A self-hosted cognition extension for collecting, organizing, and rediscovering ideas. Save images, quotes, articles, links, and notes – then search, chat with, and reflect on everything you've saved using AI.

Built as an alternative to tools like mymind.com or Pinterest, with full ownership of your data and no feed shaping what you see.

## Features

- **AI auto-tagging** — records are automatically tagged on save using Claude, no manual organization needed
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
| Embeddings | Voyage AI (voyage-4-lite) | High-quality embeddings via API — no GPU or local model server needed. Swappable via provider interface (Ollama included as alternative) |
| Tagging / Chat / Vision | Claude API (Anthropic) | Auto-tagging, RAG chat, image analysis, and weekly reflections. Swappable via provider interface (Ollama included as alternative) |
| Object Storage | Local filesystem (dev) / MinIO (prod) | S3-compatible, self-hosted — provider pattern abstracts the switch |
| Auth | Custom JWT + bcrypt | HTTP-only cookies, middleware-based route protection, no third-party auth dependency |
| Styling | Tailwind CSS + Radix UI | Utility-first CSS with accessible, unstyled primitives |
| Containerization | Docker + Docker Compose | Multi-stage build (~150MB image), single `docker compose up` for the full stack |

### AI Provider Abstraction

The AI layer is provider-agnostic. All AI features code against two interfaces — `EmbeddingProvider` and `LLMProvider` (`src/lib/ai/types.ts`) — and a factory in `src/lib/ai/index.ts` decides which implementation to use. To swap providers, you change one file; no other code needs to touch.

The repo ships with two sets of implementations:

| Provider | Embeddings | Tagging / Chat | When to use |
|----------|-----------|----------------|-------------|
| **Cloud (default)** | Voyage AI | Claude (Anthropic) | Production, no GPU needed |
| **Local** | Ollama (nomic-embed-text) | Ollama (llama3.2) | Offline dev, zero API costs, GPU recommended |

To switch to Ollama, change the imports in `src/lib/ai/index.ts` from the Voyage/Claude providers to the Ollama providers and set `AI_BASE_URL` in your `.env`.

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────────────┐
│   Browser    │────▶│  Next.js App (Server Components + API Routes)   │
└─────────────┘     └──────┬───────────────────┬────────────────────────┘
                           │                   │
                    ┌──────▼──────┐    ┌───────▼──────────────┐
                    │ PostgreSQL  │    │  Cloud APIs           │
                    │ + pgvector  │    │  Voyage AI (embed)    │
                    └─────────────┘    │  Claude (tag/chat)    │
                                       └──────────────────────┘
```

**How AI features work:**

1. **Save** — user creates a record (any type). If it's an image, Claude Vision generates a rich text description.
2. **Embed** — Voyage AI produces a vector embedding from the record's text content and stores it alongside the record in Postgres.
3. **Tag** — Claude generates 3–5 tags based on the content. All three steps run async after save.
4. **Search** — queries are embedded with the same model, then matched against stored vectors via pgvector's HNSW index (cosine similarity). Keyword search runs in parallel.
5. **Chat** — relevant records are retrieved via semantic search and injected as context into a Claude prompt (RAG). Responses stream back to the client.
6. **Reflect** — a weekly job collects recent records, feeds them to Claude with the user's AI profile, and generates a reflection digest with themed media recommendations.

## Getting Started

### Prerequisites

- Node.js 22+
- Docker Desktop (for Postgres in dev)
- A [Voyage AI API key](https://dash.voyageai.com/) (for embeddings)
- An [Anthropic API key](https://console.anthropic.com/) (for chat, image analysis, tagging, and reflections)

### Local Development Setup

```bash
# 1. Clone and install
git clone https://github.com/emdecr/cogext.git
cd cogext
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and VOYAGE_API_KEY

# 3. Start Postgres
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
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Secret for signing auth tokens (≥32 chars in production) |
| `VOYAGE_API_KEY` | Yes | — | Voyage AI API key for embeddings |
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key for chat, tagging, image analysis, reflections |
| `EMBED_MODEL` | No | `voyage-4-lite` | Voyage AI embedding model |
| `CHAT_MODEL` | No | `claude-sonnet-4-6` | Claude model for chat and RAG |
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
# 1. Copy docker-compose.prod.yml to the server
scp docker-compose.prod.yml deploy@your-server:/opt/cogext/

# 2. Create .env on the server with production values
#    (see .env.example for all variables)
#    Key: DATABASE_URL must use db:5432 (Docker service name, internal port)

# 3. Start everything
docker compose -f docker-compose.prod.yml up -d

# 4. Verify
curl http://localhost:3000/api/health
```

The production stack runs 3 services on an internal Docker network:

| Service | Port | Notes |
|---------|------|-------|
| **app** | 3000 (exposed) | Next.js standalone server, runs migrations on startup |
| **db** | 5432 (internal) | PostgreSQL 17 + pgvector, not exposed to host |
| **minio** | 9001 (console), 9000 (API) | S3-compatible object storage, both on localhost only |

**Next steps after deployment:**
- Set up a reverse proxy (nginx) with SSL via Certbot
- Create the MinIO bucket and set its access policy
- Configure GitHub Actions secrets for automated deploys

### CI/CD via GitHub Actions

The repo includes a CI pipeline (`.github/workflows/ci.yml`) that runs on every push and PR to `main`:

- **Lint + typecheck** — `eslint` and `tsc --noEmit`
- **Unit tests** — Vitest
- **Build verification** — full production build
- **Docker image** — builds and pushes to `ghcr.io` on `main` (tagged with commit SHA + `latest`)
- **Deploy** — SSHs into the server, pulls the new image, and restarts the app container

To enable Docker pushes, the workflow uses `GITHUB_TOKEN` (automatic in GitHub Actions). For the deploy job, add these secrets in your repo settings:
- `DEPLOY_HOST` — server IP or hostname
- `DEPLOY_SSH_KEY` — private SSH key for the `deploy` user on the server

## Project Structure

```
cogext/
├── .github/workflows/     # CI pipeline
├── deploy/                # Cloud-init config for server provisioning
├── drizzle/               # Generated SQL migrations
├── e2e/                   # Playwright E2E tests
├── scripts/
│   ├── backup.sh          # Database + storage backup
│   ├── restore.sh         # Restore from backup
│   └── migrate.mjs        # Standalone migration runner (used in Docker)
├── src/
│   ├── app/               # Next.js routes, pages, and API routes
│   │   └── api/           # REST endpoints (auth, chat, upload, health, reflections)
│   ├── components/        # React components (forms, cards, command palette, etc.)
│   ├── db/
│   │   ├── index.ts       # Database connection pool
│   │   └── schema.ts      # Drizzle schema (11 tables, pgvector index)
│   ├── lib/
│   │   ├── actions/       # Server Actions (records, search, tags, collections, reflections)
│   │   ├── ai/            # AI providers (embeddings, tagging, chat, image analysis, reflections)
│   │   ├── storage/       # Storage abstraction (local filesystem / MinIO)
│   │   ├── auth.ts        # Session management
│   │   ├── config.ts      # Centralized env var config with validation
│   │   ├── logger.ts      # Structured logging (JSON in prod)
│   │   └── rate-limit.ts  # In-memory rate limiting
│   ├── middleware.ts       # Auth middleware for route protection
│   └── test/              # Test setup, helpers, and mocks
├── Dockerfile             # Multi-stage build (node:22-alpine, ~150MB)
├── docker-compose.yml     # Dev services (Postgres)
├── docker-compose.prod.yml # Production stack (app + db + minio)
└── docker-entrypoint.sh   # Runs migrations, then starts the server
```
