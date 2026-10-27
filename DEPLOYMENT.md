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
> **Clerk must be configured before the frontend can build.** `ClerkProvider` wraps every page, so `next build` fails with `throwMissingPublishableKeyError` when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is absent. Set both `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` for **every Vercel environment that builds the app: Production and Preview**. The publishable key is compiled into the bundle at build time, so changing it requires a new build. Use keys from the same Clerk instance, and make sure the preview domain is allowed in that instance's settings. The key values come from the Clerk dashboard and are never written into this document or the repository.

### Clerk keys by environment

Clerk keys come in two kinds: **test** (development instance, `pk_test_` / `sk_test_`) and **live** (production instance, `pk_live_` / `sk_live_`). Which kind to use depends on where the code runs.

| Where | Variable | Kind | Why |
| :--- | :--- | :--- | :--- |
| Vercel **Production** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | live | The production site must use the production Clerk instance. |
| Vercel **Production** | `CLERK_SECRET_KEY` | live, same instance | Used by the frontend server. Must match the publishable key. |
| Vercel **Preview** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | live, same instance | Preview calls the same Render backend as production (see below). |
| Vercel **Preview** | `CLERK_SECRET_KEY` | live, same instance | Same reason as Production. |
| Render (backend) | `CLERK_SECRET_KEY` | live, same instance | The backend verifies every token with this key. |
| Render (backend) | `CLERK_WEBHOOK_SECRET` | from that instance's webhook | Verifies user webhooks. |

**Why Preview uses the production instance:** one Render backend serves both the Production and Preview frontends, and it verifies every token with its own `CLERK_SECRET_KEY`. A token from a different Clerk instance is rejected, so Preview must use the same instance as Render. Because that instance is live, add each preview domain to its allowed domains in the Clerk dashboard.

**The "development keys" warning** appears when the publishable key is a test key (`pk_test_`). Test keys belong only to local development, where the local backend also uses a test secret key. If the production site shows the warning, the Vercel **Production** publishable key is a test key: replace it with the live key and redeploy. The key is compiled into the build, so a change only takes effect after a new build.

If you want Preview on a separate test instance, that needs its own backend with test keys. It is not set up in this repository.

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
| `AI_TUTOR_MODE` | No | unset, or `live` | External AI switch. **Off by default:** unset or any value other than `live` means no request is sent to any AI provider. See [AI tutor provider](#ai-tutor-provider-openrouter). |
| `OPENROUTER_API_KEY` | Only when `AI_TUTOR_MODE=live` | none | Your OpenRouter API key. Set it in the host's secret store. Not needed, and best left unset, while AI is off. See [AI tutor provider](#ai-tutor-provider-openrouter). |
| `OPENROUTER_MODEL` | No | `apodex/apodex-1.1-mini:free` | Text model for ordinary tutoring. |
| `OPENROUTER_VISION_MODEL` | No | `openrouter/free` | Route used only for questions that include a photo. Empty turns photo questions off. |
| `CLERK_SECRET_KEY` | **Yes** | `sk_live_...` | Verifies Clerk session tokens locally against the cached JWKS. While unset, the backend falls back to the legacy JWT cookie. |
| `CLERK_PUBLISHABLE_KEY` | No | `pk_live_...` | Clerk instance identifier. |
| `CLERK_WEBHOOK_SECRET` | **Yes** | `whsec_...` | Svix signing secret for the `user.created` / `user.updated` / `user.deleted` webhook. Without it the webhook endpoint refuses every request. |

### AI tutor provider (OpenRouter)

**External AI is off by default.** Unless `AI_TUTOR_MODE` is exactly `live`, the backend sends no request to any AI provider: tutor chat, photo questions and quiz hints show a short "paused" message, and quiz analysis uses the local, non-AI version. Lessons, quizzes, sign-in, the public catalogue and read-aloud keep working. No `OPENROUTER_API_KEY` is needed while AI is off, and the OpenRouter client is never created even if a key is present.

**Check after every deploy with AI off:** the backend's startup log should contain `AI provider: disabled (AI_TUTOR_MODE is not live; no external AI client is created)` and `AI tutor: PAUSED by AI_TUTOR_MODE - no external AI requests will be made`. Asking ED a question on the deployed app should show the paused message.

The rest of this section applies only when external AI is deliberately turned on with `AI_TUTOR_MODE=live`.

The AI tutor uses two OpenRouter routes. **Both must be configured and checked on the deployment host.** They are separate settings, so changing one does not change the other.

- **Text route** (`OPENROUTER_MODEL`) is used for every ordinary tutoring turn. The default is `apodex/apodex-1.1-mini:free`.
- **Photo route** (`OPENROUTER_VISION_MODEL`) is used only when a question includes a photo. The default is `openrouter/free`, OpenRouter's free router. A value in the host's environment replaces the default. The code accepts only `openrouter/free` or a model id ending in `:free`; any other id is refused and students see a clear photo message instead. Set it to an empty value to turn photo questions off.

Keep keys and private URLs out of the repository and this document. Set `OPENROUTER_API_KEY` in the host's secret store only.

**In live mode, missing configuration is not a working AI provider.** A production backend with `AI_TUTOR_MODE=live` and no `OPENROUTER_API_KEY` refuses to start, rather than serving canned Mock replies.

**With AI live, check both routes after every deploy:**

1. Open the backend's startup log on the host. It should contain one line in this form:
   `AI provider: OpenRouter (<text model>), photos: <photo route>`
   If it reads `AI provider: disabled`, `AI_TUTOR_MODE` is not set to `live`.
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

The browser frontend may call the API only from the origins listed in `CORS_ORIGIN` on the backend host (Render).

- **Format:** a comma-separated list of exact origins. Each entry is the scheme and host (and port, if any), with no path.
- **Tidying:** spaces and trailing slashes are removed automatically, and letter case is normalised.
- **Refused:** a wildcard `*`, any entry with a path or query, and any non-web scheme. An invalid value stops the backend at startup with a message that names the problem, so a bad value is caught on deploy rather than as a failing browser request.
- **Per request:** each request is checked against the list on its own. The origin that matched is echoed back, so every listed frontend works. An origin that is not listed gets no allow-origin header, and the browser blocks the response.
- **No pattern matching:** the backend does **not** trust `*.vercel.app`. Every Vercel preview URL that should reach the API must be added to `CORS_ORIGIN` explicitly.
- **Preview URLs change:** a preview deployment's URL changes when the deployment is recreated. When a new preview URL must reach the API, add it to `CORS_ORIGIN`. Render reads the variable at startup, so the running service keeps the old value until it restarts (see the checklist below).
- **Local development:** if `CORS_ORIGIN` is not set, the default is `http://localhost:3000`.

**Current value for this setup** (production and the current preview URL):

```env
CORS_ORIGIN=https://e-dplatform.vercel.app,https://e-dplatform-fh81hvko1-tanixa.vercel.app
```

To confirm it works in a browser: open the profile page, open DevTools, and inspect the `/me` request. Its `access-control-allow-origin` response header must equal the page's own origin.

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


---

## Demo curriculum bootstrap (safe run)

This creates the approved Class 6-8 curriculum in a **new, empty** demo database. It reads only the repository's committed files, and it never reads data from any existing database. It is separate from the development seeds and the production curriculum runner, and neither of those is changed.

### Why a clean clone is required

The database client loads `apps/backend/.env` as soon as it is imported, and that file holds the development database address. The bootstrap therefore checks, before it imports the database client, whether a `.env` file exists in the repository root or the backend folder. If one does, it prints a short explanation and exits. It never opens or reads the file.

Run it from a **fresh clone**, because `.env` files are git-ignored and a clone does not contain them:

```bash
git clone <repository-url> edplatform-demo
cd edplatform-demo
git checkout release/edplatform-submission
npm install
```

Do not copy your own `.env` files into the clone. The check does not move, rename or delete any file, so your existing `.env` files are left as they are.

### Set the variables for the current shell only

Never put these in a file. The database address comes from the new Neon project's **direct** connection (Connection Details, not the pooled one).

```bash
export EDP_DEMO_DATABASE_URL='<direct connection string of the demo project>'
export EDP_DEMO_EXPECT_ENDPOINT='<the demo project endpoint id, for example ep-cool-darkness-a1b2c3d4>'
```

### Run it, in order

1. **Plan (offline, no connection):**
   ```bash
   npm run demo:bootstrap --workspace=@edplatform/backend -- --plan
   ```
2. **Preflight (reads only):** checks that all seven migrations are finished and the database is empty. Writes nothing.
   ```bash
   EDP_ALLOW_DEMO_SEED=1 npm run demo:bootstrap --workspace=@edplatform/backend -- --preflight --confirm-demo-seed
   ```
3. **Apply (writes), only after reviewing the preflight output:**
   ```bash
   EDP_ALLOW_DEMO_SEED=1 npm run demo:bootstrap --workspace=@edplatform/backend -- --confirm-demo-seed
   ```

The migrations must already be applied to the demo database before step 2 will pass. Apply them through the demo service's own build (its `DATABASE_URL` points at the demo database), not through the development database guard.

### If the run is refused

- **"An environment file exists in: ..."**: you are in a checkout that has a `.env` file. Run from a fresh clone instead. Do not delete your own files to get around this.
- **"could not be verified"**: the folder layout is not the repository's. Run from a fresh clone.
- Any other refusal names the rule that failed. None of the messages print a URL, password or key.

### What the runner refuses, in every mode that connects

- the production endpoint, the development endpoint, and the backup endpoint, in direct or pooled form
- any hostname that is not a valid Neon hostname for the approved endpoint
- a run without both confirmations (`--confirm-demo-seed` and `EDP_ALLOW_DEMO_SEED=1`)
- a database that holds any row in the application tables
- a migration history that is incomplete, failed or rolled back

Writes are create-only, inside one transaction. A failure part-way through rolls the whole run back.

### Known limitation

The production curriculum runner and the development seed scripts import the same database client without this check. They are unchanged by this work, so they should also only be run from a clean clone.
