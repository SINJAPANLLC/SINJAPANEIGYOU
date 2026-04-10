# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL (NEON) + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI gpt-4o-mini
- **SMTP**: Hostinger (smtp.hostinger.com, port 465)
- **Search**: Yahoo Japan HTML scraping (cheerio) — DuckDuckGo blocked from server IPs
- **Encoding**: iconv-lite for Shift-JIS/EUC-JP Japanese pages

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Application: 営業自動化ダッシュボード

Japanese B2B Sales Automation SaaS.

### Admin Credentials
- Email: info@sinjapan.jp
- Password: Kazuya8008

### Features
- **Lead Collection**: Yahoo Japan scraping → site crawling → NEON DB storage
- **AI Email Generation**: OpenAI gpt-4o-mini, endpoint `POST /api/email/generate`
- **SMTP Delivery**: Hostinger via nodemailer
- **Unsubscribe**: Token-based `/unsubscribe?token=...` endpoint
- **Cron Scheduling**: `/schedule` page with campaign scheduling
- **Templates**: Email templates per business with AI generation
- **Dashboard**: Overview with stats

### Architecture
- API Server: port 8080 (`artifacts/api-server`)
- Frontend: port 18816 (`artifacts/sales-dashboard`) — Vite + React
- Database: NEON PostgreSQL (`NEON_DATABASE_URL`)

### Lead Search
- Uses Yahoo Japan (`search.yahoo.co.jp`) for company discovery
- Selector: `.sw-Card a h3` for clean titles
- Excludes: job boards, social media, news sites, blog platforms, company directories
- URL scoring: filters blog posts, article pages, social media
- Crawling: extracts email, phone, contact URL, company name
- Encoding: handles Shift-JIS and EUC-JP pages via iconv-lite

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
