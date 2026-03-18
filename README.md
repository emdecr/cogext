# Brain Extension

A self-hosted personal knowledge base for collecting, organizing, and searching records (images, quotes, articles, links, notes) with AI-assisted tagging, semantic search, and conversational Q&A.

## Stack

- **Framework:** Next.js (App Router)
- **Database:** PostgreSQL + pgvector
- **ORM:** Drizzle
- **Styling:** Tailwind CSS
- **Testing:** Vitest + React Testing Library + Playwright

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres)

## Getting Started

1. **Clone and install:**

   ```bash
   git clone <repo-url>
   cd brain-extension
   npm install
   ```

2. **Set up environment variables:**

   ```bash
   cp .env.example .env.local
   ```

3. **Start the database:**

   ```bash
   docker compose up -d
   ```

4. **Run migrations:**

   ```bash
   npx drizzle-kit migrate
   ```

5. **Start the dev server:**

   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Run unit/component tests (watch mode) |
| `npm run test:run` | Run unit/component tests once |
| `npm run test:e2e` | Run E2E tests with Playwright |
| `npm run test:e2e:ui` | Run E2E tests with interactive UI |
| `npx drizzle-kit generate` | Generate migration from schema changes |
| `npx drizzle-kit migrate` | Apply pending migrations |
| `npx drizzle-kit studio` | Open database GUI |

## Project Structure

```
brain-extension/
├── docker-compose.yml     # Postgres + pgvector
├── drizzle/               # Generated SQL migrations
├── drizzle.config.ts      # Drizzle Kit config
├── e2e/                   # Playwright E2E tests
├── src/
│   ├── app/               # Next.js routes and pages
│   ├── db/
│   │   ├── index.ts       # DB connection
│   │   └── schema.ts      # Drizzle schema (all tables)
│   ├── lib/               # Shared utilities
│   └── test/              # Test setup
├── vitest.config.ts       # Vitest config
└── playwright.config.ts   # Playwright config
```
