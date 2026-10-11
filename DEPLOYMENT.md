# EDplatform Production Deployment Guide

This document provides complete instructions for deploying **EDplatform** to production environments (such as Vercel for the Next.js frontend, Render/Railway/Fly.io for the Express backend, and Neon for PostgreSQL).

---

## 1. Required Frontend Environment Variables

Configure these variables in your frontend hosting environment (e.g., Vercel Project Settings > Environment Variables):

| Variable Name | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://api.yourdomain.com/api/v1` | Base URL for all backend API endpoints. |
| `NEXT_PUBLIC_APP_URL` | No | `https://yourdomain.com` | Canonical frontend domain for metadata and links. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **Yes** | `pk_live_...` | Clerk publishable key. Safe to expose; it identifies the Clerk instance. |
| `CLERK_SECRET_KEY` | **Yes** | `sk_live_...` | Clerk secret key, used by `clerkMiddleware()` in the Next.js server runtime. Never exposed to the browser. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | No | `/sign-in` | Sign-in route. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | No | `/sign-up` | Sign-up route. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | No | `/` | Where a returning student lands after sign-in. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | No | `/onboarding` | New students go straight to onboarding. |

> [!IMPORTANT]
> **No Secrets in Frontend:** The frontend bundle is public. It must **never** contain `DATABASE_URL`, `JWT_SECRET`, `OPENROUTER_API_KEY`, or any other private credentials. Only non-sensitive variables prefixed with `NEXT_PUBLIC_` are permitted.

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
| `OPENROUTER_API_KEY` | **Yes** (for live AI) | none | Your OpenRouter API key. Set it in the host's secret store. Without it the app serves the offline Mock instead of AI tutoring. See [AI tutor provider](#ai-tutor-provider-openrouter). |
| `OPENROUTER_MODEL` | No | `apodex/apodex-1.1-mini:free` | Text model for ordinary tutoring. |
| `OPENROUTER_VISION_MODEL` | No | `openrouter/free` | Route used only for questions that include a photo. Empty turns photo questions off. |
| `CLERK_SECRET_KEY` | **Yes** | `sk_live_...` | Verifies Clerk session tokens locally against the cached JWKS. While unset, the backend falls back to the legacy JWT cookie. |
| `CLERK_PUBLISHABLE_KEY` | No | `pk_live_...` | Clerk instance identifier. |
| `CLERK_WEBHOOK_SECRET` | **Yes** | `whsec_...` | Svix signing secret for the `user.created` / `user.updated` / `user.deleted` webhook. Without it the webhook endpoint refuses every request. |

### AI tutor provider (OpenRouter)

The AI tutor uses two OpenRouter routes. **Both must be configured and checked on the deployment host.** They are separate settings, so changing one does not change the other.

- **Text route** (`OPENROUTER_MODEL`) is used for every ordinary tutoring turn. The default is `apodex/apodex-1.1-mini:free`.
- **Photo route** (`OPENROUTER_VISION_MODEL`) is used only when a question includes a photo. The default is `openrouter/free`, OpenRouter's free router. A value in the host's environment replaces the default. The code accepts only `openrouter/free` or a model id ending in `:free`; any other id is refused and students see a clear photo message instead. Set it to an empty value to turn photo questions off.

Keep keys and private URLs out of the repository and this document. Set `OPENROUTER_API_KEY` in the host's secret store only.

**Missing configuration is not a working AI provider.** Without `OPENROUTER_API_KEY` the app still starts, and it serves the offline Mock. The Mock gives canned replies, not tutoring. Treat that as a failed deployment, not a successful one.

**Check both routes after every deploy:**

1. Open the backend's startup log on the host. It should contain one line in this form:
   `AI provider: OpenRouter (<text model>), photos: <photo route>`
   If it reads `AI provider: Mock (OPENROUTER_API_KEY not set)`, the key is missing.
2. Confirm the two model ids in that line are the intended ones, and confirm on your OpenRouter account that the photo route is free.
3. On the deployed app, send one text question and one photo question. Each should get a real answer.

> [!IMPORTANT]
> **Cookies are no longer used for API authentication.** The frontend sends the
> Clerk session token as `Authorization: Bearer <token>`, so the Clerk session
> cookie stays first-party on the frontend origin. `COOKIE_SECURE`,
> `COOKIE_SAME_SITE` and `COOKIE_DOMAIN` now only affect the legacy
> email/password login, which remains available until the Clerk flow is verified
> in production.

### Clerk webhook setup

In the Clerk dashboard, add an endpoint pointing at:

```
https://<your-backend-host>/api/v1/webhooks/clerk
```

Subscribe to `user.created`, `user.updated` and `user.deleted`, then copy the
signing secret into `CLERK_WEBHOOK_SECRET`. The route is mounted before
`express.json()` because Svix verifies the signature against the raw request body.

If the webhook is slow or misconfigured, the backend still creates the student
record lazily on the first authenticated request, so sign-up is never blocked.

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

1. **Project Configuration**:
   - Import the Git repository in Vercel.
   - Set **Root Directory** to `apps/frontend`.
   - Vercel will detect the npm monorepo and automatically install dependencies from the repository root.

2. **Framework Preset & Build Commands**:
   - **Framework Preset**: Next.js
   - **Install Command**: `npm install` (default). No backend Prisma generation is triggered because root `postinstall` is decoupled.
   - **Build Command**: `next build` or `npm run build` (default). `apps/frontend/package.json` includes `"prebuild": "npm run build --workspace=@edplatform/shared"`, which builds the shared schema contract package before Next.js compiles.
   - **Output Directory**: `.next` (default).

3. **Required Environment Variables**:
   - `NEXT_PUBLIC_API_URL`: Set to your live backend API URL (e.g. `https://api.edplatform.com/api/v1`).
   - `NEXT_PUBLIC_APP_URL`: Set to your live frontend URL (e.g. `https://edplatform.com`).

4. **Zero Backend Secrets on Vercel**:
   - Vercel **does not** require `DATABASE_URL`, `JWT_SECRET`, `OPENROUTER_API_KEY`, or any backend secrets.
   - Prisma Client generation is decoupled and executed strictly in backend deployment pipelines (e.g., Render/Railway/Fly.io).

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
