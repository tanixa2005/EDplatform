# EDplatform Production Deployment Guide

This document provides complete instructions for deploying **EDplatform** to production environments (such as Vercel for the Next.js frontend, Render/Railway/Fly.io for the Express backend, and Neon for PostgreSQL).

---

## 1. Required Frontend Environment Variables

Configure these variables in your frontend hosting environment (e.g., Vercel Project Settings > Environment Variables):

| Variable Name | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://api.yourdomain.com/api/v1` | Base URL for all backend API endpoints. |
| `NEXT_PUBLIC_APP_URL` | No | `https://yourdomain.com` | Canonical frontend domain for metadata and links. |

> [!IMPORTANT]
> **No Secrets in Frontend:** The frontend bundle is public. It must **never** contain `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, or any other private credentials. Only non-sensitive variables prefixed with `NEXT_PUBLIC_` are permitted.

---

## 2. Required Backend Environment Variables

Configure these variables in your backend hosting environment (e.g., Render, Railway, Fly.io, AWS):

| Variable Name | Required | Example Format | Purpose |
| :--- | :---: | :--- | :--- |
| `PORT` | Auto | `5000` or `$PORT` | Port for Express server (automatically injected by most PaaS). |
| `NODE_ENV` | **Yes** | `production` | Enables production error masking, secure cookies, and optimizations. |
| `DATABASE_URL` | **Yes** | `postgresql://user:pass@ep-xyz.neon.tech/edplatform?sslmode=require` | Neon / PostgreSQL connection string (pooled connection recommended). |
| `JWT_SECRET` | **Yes** | `[64-character-cryptographically-secure-random-string]` | Secret key used for signing and verifying JWT auth tokens (minimum 32 characters). |
| `JWT_EXPIRES_IN` | No | `7d` | JWT token lifetime (default: `7d`). |
| `CORS_ORIGIN` | **Yes** | `https://yourdomain.com` | Allowed frontend origins (supports single origin or comma-separated list). |
| `COOKIE_SECURE` | No | `true` | Enforces `Secure` flag on `auth_token` cookie (defaults to `true` when `NODE_ENV=production`). |
| `COOKIE_SAME_SITE` | **Yes** | `lax` or `none` | Set to `lax` for same-domain setups, or `none` if frontend and backend have different domains. |
| `COOKIE_DOMAIN` | No | `.yourdomain.com` | Optional shared root domain for subdomains. Leave unset for host-only cookies. |
| `GEMINI_API_KEY` | No | `AIzaSy...` | Google Gemini API key. If omitted, AI Tutor falls back safely to Mock provider. |

---

## 3. Local Development Commands

### Initial Setup
```bash
# 1. Install all dependencies across monorepo
npm install

# 2. Configure environment files from templates
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local

# 3. Generate Prisma client
npm run prisma:generate --workspace=@edplatform/backend
```

### Running Locally
```bash
# Run both frontend and backend concurrently
npm run dev

# Run backend service only (port 5000)
npm run dev:backend

# Run frontend service only (port 3000)
npm run dev:frontend
```

---

## 4. Production Build Commands

```bash
# Build all workspaces (backend, frontend, and shared packages)
npm run build

# Build individual workspaces
npm run build --workspace=@edplatform/backend
npm run build --workspace=@edplatform/frontend
npm run build --workspace=@edplatform/shared

# Run full monorepo type checking
npm run typecheck

# Run monorepo linting
npm run lint

# Run automated security and regression test suite
npm test
```

---

## 5. Database Migration Commands

In production CI/CD or deployment pipelines, apply existing migrations without creating new migration files or resetting the database:

```bash
# Apply pending Prisma migrations in production
npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma

# Verify migration status
npx prisma migrate status --schema=apps/backend/prisma/schema.prisma
```

> [!CAUTION]
> Never run `prisma migrate dev` or `prisma migrate reset` in production, as this can delete data or reset the database. Always use `prisma migrate deploy`.

---

## 6. Frontend Deployment Notes (Vercel)

When deploying `apps/frontend` to **Vercel**:

1. **New Project Setup**:
   - Import the Git repository in Vercel.
   - Set **Root Directory** to `apps/frontend`.
2. **Framework Preset**:
   - Vercel will automatically detect **Next.js**.
3. **Build & Development Settings**:
   - Build Command: `cd ../.. && npm run build --workspace=@edplatform/frontend` (or standard `next build` if monorepo dependencies are configured).
   - Output Directory: `.next`
   - Install Command: `npm install` (from monorepo root)
4. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL`: Set to your live backend API URL (e.g. `https://api.edplatform.com/api/v1`).
   - `NEXT_PUBLIC_APP_URL`: Set to your live frontend URL (e.g. `https://edplatform.com`).

---

## 7. Backend Deployment Requirements

The backend is built with **Node.js, Express, TypeScript, and Prisma**. It is fully stateless and container-ready.

- **Supported Platforms:** Render, Railway, Fly.io, AWS ECS, Google Cloud Run, DigitalOcean App Platform.
- **Node.js Version:** `20.x` or `22.x` (LTS).
- **Stateless Execution:** No runtime reliance on local filesystem state. All persistent data resides in Neon PostgreSQL.
- **Process Management:**
  - Build command: `npm run build --workspace=@edplatform/backend`
  - Start command: `node dist/server.js` (from `apps/backend`) or `npm start --workspace=@edplatform/backend` (from root).
- **Graceful Shutdown:** The server handles `SIGTERM` and `SIGINT` signals, draining connections within a 10-second timeout window.
- **Port Dynamic Binding:** Uses `process.env.PORT` automatically.

---

## 8. CORS Configuration Requirements

Cross-Origin Resource Sharing is enforced via `helmet` and `cors` middlewares in `apps/backend/src/app.ts`:

- `CORS_ORIGIN` must match your frontend URL exactly.
- **Multiple Origins Support:** You can specify comma-separated origins:
  ```env
  CORS_ORIGIN=https://edplatform.com,https://preview.edplatform.vercel.app
  ```
- `credentials: true` is enabled to allow HttpOnly authentication cookies to be sent and received in cross-origin requests.

---

## 9. Production Cookie Requirements

Authentication uses an HttpOnly cookie named `auth_token`:

| Setting | Value | Rationale |
| :--- | :--- | :--- |
| **HttpOnly** | `true` | Prevents token exfiltration by client-side scripts (XSS mitigation). |
| **Secure** | `true` | Required in production. Cookie is only transmitted over HTTPS connections. |
| **SameSite** | `lax` or `none` | Use `lax` if frontend and backend share the same parent domain. Use `none` if frontend and backend reside on separate top-level domains (requires `Secure=true`). |
| **Domain** | Undefined or `.domain.com` | Leave unset for host-only cookies, or set to `.yourdomain.com` to share sessions across subdomains. |
| **Path** | `/` | Accessible to all API routes. |

---

## 10. Health-Check Endpoint

The backend provides a lightweight, unauthenticated health-check endpoint for load balancers, container probes, and uptime monitoring:

- **URL:** `GET /api/v1/health`
- **Expected Status:** `200 OK`
- **Example Response:**
  ```json
  {
    "success": true,
    "data": {
      "status": "healthy",
      "service": "EDplatform-API",
      "version": "1.0.0",
      "uptimeSeconds": 1420,
      "timestamp": "2026-09-30T17:55:00.000Z",
      "environment": "production"
    }
  }
  ```
