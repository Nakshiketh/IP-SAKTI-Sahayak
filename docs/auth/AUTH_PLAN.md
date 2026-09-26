# Member authentication — plan

Phase 0 of the member authentication work: what the project is today, what has
to change, and where the brief and the project disagree. No code has been
changed. Written 2026-09-26 on branch `feature/member-auth`, from commit
`40fb25e`.

## 1. Stack as it is

**Frontend.**
- React 18, TypeScript and Vite 5.
- Routing: `react-router-dom` 6, with every route declared in
  `frontend/src/App.tsx`.
- Styling: Tailwind 3 over CSS custom properties in `src/styles/tokens.css`.
- Icons: Lucide. Motion: Framer Motion 11. Translation: i18next.
- Tests: Vitest with Testing Library and axe-core.
- There is no component kit. No shadcn, Radix or MUI is installed; every
  component is hand-built under `src/components/ui`.
- `html5-qrcode` 2.3.8 is a dependency, but nothing in `src/` imports it. The
  current badge scanner posts camera frames to the server instead.

**Backend.**
- Python 3.11 with FastAPI, Pydantic v2 and `pydantic-settings`.
- Storage is SQLite through the stdlib `sqlite3` module. There is no ORM and
  no migration tool.
- Each store is its own file under `data/` (`accounts.sqlite3`,
  `audit.sqlite3`, `records.sqlite3`, `analyses.sqlite3` and so on). Each
  creates its tables with `CREATE TABLE IF NOT EXISTS` when it first connects.
- Tests: pytest with `fastapi.testclient`.

## 2. Existing authentication

The file is `backend/app/api/auth.py`, and the store is `data/accounts.sqlite3`
with one table, `accounts`:
`username` (primary key), `name`, `email`, `salt`, `password`, `badge_code`
and `created_at`.

| Piece | Today | Brief requires |
|---|---|---|
| Password hash | PBKDF2-HMAC-SHA256, 200k rounds | argon2id |
| Session | HMAC-signed bearer token; key generated per process; 12 h; no revocation | Server-side session row, opaque ID in an HttpOnly cookie, idle and absolute timeouts, revocable |
| Token storage in browser | `sessionStorage` (`sahayak.auth.token`, `sahayak.auth.user`) | Nothing auth-related in web storage |
| Seed account | `demo` / `demo1234`, hard-coded | Nakshiketh, password from `DEMO_MEMBER_TEMP_PASSWORD`, must change it |
| Registration | `POST /api/v1/auth/register`, open to anyone | Not in brief ("Authorized members only") |
| QR sign-in | `POST /api/v1/auth/badge`: a JPEG frame is compared, module by module, with one hard-coded QR pattern that has no decodable data (`app/core/badge.py`) | Issued, revocable token `IPSAKTI:v1:<token>`, then an email OTP |
| Rate limiting | In-memory sliding window keyed on the client-sent `X-Session-Id` header (`app/core/ratelimit.py`) | Per IP, per member and per identifier limits |
| Audit | `app/services/audit.py` logs answers, not auth events | `auth_events` table |
| CSRF | None needed (bearer header) | Required once cookies carry the session |

Three routers already require a session, through the `current_user` dependency:
`analyst`, `documents` and `insight`. Every other router is open today. I
confirmed this against the running server:
- `GET /api/v1/sources` returns 200 without a session.
- `POST /api/v1/query` reaches request validation (422) without a session.

## 3. Frontend ↔ backend

- **Development.** Vite serves on port 5173 and proxies `/api` to
  `http://127.0.0.1:8000`. Override the target with `SAHAYAK_API_TARGET`.
  Frontend and API are same-origin.
- **Public deploy.** Render uses `Dockerfile`. `scripts/serve-public.mjs`
  serves `frontend/dist` and pipes `/api` to uvicorn on loopback, so it is
  also same-origin.
- **CORS.** `CORSMiddleware` allows `SAHAYAK_CORS_ORIGINS` (default: the two
  5173 origins) with `allow_credentials=False`. Nothing relies on it, because
  both paths are same-origin.
- **CSP.** The built app sets `connect-src 'self'` (`vite.config.ts`). The API
  sends `default-src 'none'` and `Permissions-Policy: camera=(self)`.

## 4. Environment

- `app/core/settings.py` (pydantic-settings) reads `backend/.env`, with prefix
  `SAHAYAK_`.
- The template is `backend/.env.example`. The root `.gitignore` already
  ignores `.env`, `.env.local` and `*.local`. It does not ignore
  `demo/cards/`.
- The frontend reads only `VITE_SAHAYAK_API` (`mock` switches to the
  demo-data service).

## 5. Running and testing

| What | Command |
|---|---|
| Backend | `cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000` (`make dev-backend`) |
| Frontend | `cd frontend && npm run dev` (`make dev-frontend`) |
| Backend tests | `cd backend && .venv/Scripts/python.exe -m pytest` |
| Frontend tests | `cd frontend && npm test` |
| Lint and types | `make lint`, `cd frontend && npx tsc --noEmit` |

## 6. Baseline (2026-09-26, before any auth code)

The working tree carried uncommitted changes onto this branch:
- `frontend/src/components/layout/SignOutButton.tsx` and
  `frontend/src/routes/Analyst.tsx`: yours.
- The answer streaming work: `hooks/useStreamReveal.ts`, `ClaimText`,
  `InShort`, `AnswerView` and `Sahayak.tsx`.

None of them will be included in an auth commit.

| Check | Result |
|---|---|
| Backend tests | **666 passed**, 0 failed (49.8 s) |
| Frontend tests | **541 passed, 11 failed**, 552 in total |
| Frontend typecheck | 1 error: `src/routes/Analyst.tsx(77,10)`, `status` declared but never used (uncommitted edit) |
| Backend starts | Yes. `/api/v1/health` returns `{"status":"ok","environment":"development"}` |
| Frontend starts | Yes, HTTP 200 on `localhost:5173`. The sign-in page renders with no console errors (checked in Chrome) |

The 11 frontend failures, all present before any auth work:
- `App.test.tsx`, "renders its own heading" for 6 routes: `/assess`,
  `/assess/steps`, `/how-it-works`, `/sahayak`, `/sources` and
  `/what-is-covered`. These are timeouts under full-suite load. Run alone,
  most of them pass, and which ones fail changes from run to run.
- `backdrop.test.tsx`: "is the same element on every tab".
- `language_switch.test.tsx`: switching Sources to Tamil.
- `Analyst.test.tsx`: "sends a message and shows the streamed reply". This
  follows the uncommitted `Analyst.tsx` edit.
- `Assessment.test.tsx`: 2 product-check cases.

## 7. Brand

The existing brand is **deliberate**, not a framework default:

| Token | Value | Role |
|---|---|---|
| `--leaf` | `#1D4B36` deep botanical green | primary |
| `--sap` | `#3E7D5A` | interactive states, success |
| `--stamp` | `#2B4C8C` indigo | sourced, citation, focus ring |
| `--lac` | `#9B2C1F` | caution, declining to answer |
| `--ink` | `#101A14` | text |
| `--bone` | `#F6F4EE` | page ground |
| Display type | Tiro Devanagari Hindi (plus Tiro Telugu, Tamil and Bangla per script) | self-hosted through `@fontsource` |
| Body type | IBM Plex Sans (plus Noto per script) | self-hosted |

There is no logo image. The wordmark is text: "IP-SAKTI Sahayak", with the line
"Ayurveda, intellectual property and regulation" under it.

The rules in `docs/BANNED.md` overlap heavily with the brief's "Do not ship"
list.

## 8. What must be protected

**Page routes.** Everything the gate covers today: `/`, `/sahayak`, `/assess`,
`/assess/steps`, `/what-is-covered`, `/how-it-works`, `/sources`, `/about`,
`/privacy`, `/insights` (behind a flag), and the development-only `/design` and
`/audit`. The unknown-route 404 renders only once someone is signed in.

**Public.**
- `GET /api/v1/health`
- The new auth endpoints: login, `qr/verify`, `otp/resend`, `otp/verify`,
  `password/forgot`, `password/forgot/verify` and `password/reset`
- `logout` and `me`, which answer 401 without a session

**Protected.** Every other endpoint:
- **Query, the answer engine:** `POST /api/v1/query`
- **Classification:** `POST /api/v1/classify`, `POST /api/v1/abs-check`
- **Sources:** `GET /api/v1/sources`, `GET /api/v1/sources/{document_id}`
- **Records:** `GET /api/v1/records/search`, `/landscape`, `/sources`,
  `/{record_id}`
- **Documents:** `POST /api/v1/documents/read`
- **Analyst:**
  - `GET /api/v1/analyst/status`
  - conversations: `GET`, `POST` and `GET/DELETE /{id}`
  - `POST /{id}/messages`, `/{id}/edit` and `/{id}/analyse`
- **Feedback:** `POST /api/v1/feedback`, `POST /api/v1/escalate`
- **Privacy:** `POST /api/v1/consent`, `GET /api/v1/access-log`,
  `GET /api/v1/audit` (development only)
- **Other:** `GET /api/v1/demo/flagship-case`, `GET /api/v1/corpus-version`,
  `GET /api/v1/admin/insight`
- **Old sign-in routes:** `POST /api/v1/auth/register` and
  `POST /api/v1/auth/badge` (see conflicts C1 and C4)

**How.** One `require_member` dependency is attached at router level
(`include_router(..., dependencies=[...])`), so a new route on a protected
router is protected by default. A test lists every registered route and fails
if any route outside the public allowlist answers without a session.

## 9. Conflicts — need your decision before Phase 1

**C1. The QR credential.**
- The current sign-in QR is the Digital QR Badge pattern. It holds no
  decodable data, and it was deliberately made the one and only login
  credential.
- The brief replaces it with issued token QRs (`IPSAKTI:v1:<token>`).
- *Proposal:* retire `/auth/badge` and `app/core/badge.py` once Phase 4 lands.
  The old badge would stop signing anyone in. That also removes the
  OpenCV/numpy dependency, if nothing else uses it.

**C2. The sign-in page's look.**
- Today it is a frosted card over the brightened background video, which you
  asked for.
- The brief bans glassmorphism, blur and floating cards.
- *Proposal:* the brief wins on the portal routes. The background video and
  mute control on pages behind sign-in stay exactly as they are, since the
  brief says not to restyle the dashboard.

**C3. Palette and type mapping.**
- The brand is deliberate, so the brief says to use its primary colour in
  place of Nil.
- *Proposal:*
  - Nil → leaf `#1D4B36`.
  - Neem, the success colour → sap `#3E7D5A`. Neem `#2F6B45` is too close to
    leaf to read as a separate state. "Verified" also carries a label and a
    seal shape, so colour is never the only signal.
  - Focus ring → the existing 2 px stamp indigo, which the app already uses
    everywhere.
  - Camera viewport → a deep leaf, `#0E2419`, instead of `#16233E`.
  - Page ground → the brief's Herbarium white `#F6F7F3`. It is cooler than the
    app's bone `#F6F4EE`, and bone sits close to the cream the banned list
    names.
  - Haldi, Sindoor, Sheet line, Ink and Muted as in the brief.
  - Type: keep the existing Tiro Devanagari Hindi, in place of Martel, for the
    wordmark, the heading and "सहायक", and IBM Plex Sans in place of Mukta.
    Both are already bundled, so no new fonts.
- If you'd rather have the brief's Martel/Mukta and Nil indigo exactly, say so.

**C4. Open registration.**
- `POST /auth/register` and the "Create one" link let anyone make an account.
- That contradicts "authorized members only".
- *Proposal:* remove self-registration, both endpoint and link. Members are
  issued with the seed and card scripts.
- This does remove an existing feature, so it needs your yes.

**C5. The old demo account** (`demo` / `demo1234`, published in the README).
- *Proposal:* delete it along with the old `accounts` table. It is a
  published password on a site that would otherwise be members-only.

**C6. Render free tier.**
- The disk is wiped whenever the service sleeps.
- On every wake the members table, the card's token hash and sessions would
  be gone. The seed recreates the member from env, but the printed card would
  stop working.
- I believe Render's free web services also block outbound SMTP (ports
  25/465/587). I have not verified that, and you should check it on your
  Render dashboard.
- *Proposal:*
  - Treat member auth as working locally, and through `scripts/share.ps1`,
    for now.
  - For Render, add one optional env key, `DEMO_MEMBER_QR_TOKEN_SHA256`. The
    seed would restore the card's hash from it on boot, so the card outlives
    restarts. Email OTP there would still need an HTTPS email API instead of
    SMTP, which is a later decision.
- The brief forbids a second database, so an external Postgres is out.

**C7. Environment variable names.**
- The settings class reads `SAHAYAK_`-prefixed keys from `backend/.env`.
- The brief's keys are unprefixed: `EMAIL_HOST`, `SESSION_SECRET` and so on.
- *Proposal:* read the brief's names exactly, through field aliases in the
  same settings class, from the same `backend/.env`. Add them to the existing
  `backend/.env.example`. There will be no separate root `.env`.

**C8. Where "dashboard" is.**
- The app has no separate dashboard. After sign-in, the site itself (`/`,
  `/sahayak` and the rest) is what the brief calls the dashboard.
- `next: "dashboard"` will navigate to `/`, or to the page the reader
  originally asked for.

## 10. Design of the new pieces (summary)

- **Store.**
  - New tables go in the existing `data/accounts.sqlite3`: `members`,
    `member_qr_tokens`, `auth_challenges`, `otp_codes`, `sessions` and
    `auth_events`. It stays the one accounts database.
  - The schema is created idempotently on connect, as every other store here
    does, with a `schema_version` row so a later change is a deliberate step.
  - Code lives in a new package, `backend/app/auth/` (store, hashing,
    sessions, OTP, email, rate limits, CLI).
- **Sessions.**
  - Opaque 256-bit ID in cookie `sahayak_session`: HttpOnly, SameSite=Lax,
    Path=/, and Secure when `COOKIE_SECURE=true`.
  - Only its SHA-256 is stored.
  - Timeouts: 60 min idle and 12 h absolute; a restricted session lasts
    10 min.
- **CSRF.**
  - Both deploy paths are same-origin, so every state-changing request must
    carry `X-Sahayak-CSRF: 1`, which a cross-site form cannot set.
  - `Origin`/`Referer` must also be in the allowlist (`APP_BASE_URL` plus the
    dev origins).
  - CORS moves to `allow_credentials=True` with an explicit origin list,
    never `*`.
- **Rate limits.** The existing in-process limiter, keyed per IP, member and
  identifier. The IP comes from the socket, or from `X-Forwarded-For` only
  when behind the known local proxy.
- **Frontend.**
  - `services/auth.ts` and `useAuth` move to cookie sessions (`credentials:
    'same-origin'`, `GET /api/v1/auth/me` on load).
  - Every `Authorization: Bearer` header and `sessionStorage` key is removed.
  - The gate shows nothing until `/me` answers, so no page content flashes.
  - New routes: `/login`, `/login/password`, `/forgot-password` and
    `/create-password`.
- **QR decode in the browser.**
  - Native `BarcodeDetector` where the browser has it.
  - Otherwise `html5-qrcode`, which is already installed, loaded only when the
    scanner or upload is opened.

## 11. Files

**Create.**
- Backend package `backend/app/auth/`: `__init__.py`, `store.py`,
  `hashing.py`, `sessions.py`, `otp.py`, `email.py`, `templates.py`,
  `limits.py`, `deps.py` and `cli.py`.
  - The CLI commands are `seed`, `issue-card`, `revoke-card`, `test-email`
    and `gen-secrets`.
- `backend/app/api/member_auth.py`.
- Backend tests: `backend/tests/test_member_auth_*.py`.
- Frontend routes: `frontend/src/routes/portal/*` (Portal, PasswordLogin,
  ForgotPassword, CreatePassword and DemoCard).
- Frontend components: `frontend/src/components/portal/*` (Scanner,
  MemberRecord, OtpInput, PasswordFields and StrengthMeter).
- Frontend tests.
- Docs: `docs/auth/DESIGN_PLAN.md`, written in Phase 5.

**Change.**
- Backend: `app/main.py`, `app/core/settings.py`, `backend/.env.example`,
  `pyproject.toml`, and the routers (router-level dependency only).
- Frontend: `App.tsx`, `services/auth.ts`, `hooks/useAuth.tsx`,
  `hooks/authContext.ts`, and the services that set a bearer header
  (`analyst.ts`, `documents.ts`, `insight.ts`, `privacy.ts`,
  `query.http.ts`).
- Frontend: `components/layout/SignOutButton.tsx`, which already exists. It
  has your uncommitted edit, which I will work around rather than overwrite.
- Frontend: `test/signedIn.ts` and the English locale files.
- Repo: `.gitignore` (adds `demo/cards/`) and `README` (removes the published
  demo password).

**Retire, pending C1, C4 and C5.**
- `app/core/badge.py`
- `/auth/badge` and `/auth/register`
- `components/auth/BadgeScanner.tsx` and the register form in
  `routes/Login.tsx`

## 12. New dependencies proposed

| Package | Where | Why |
|---|---|---|
| `argon2-cffi` | backend | argon2id password hashing, as the brief requires. The project has no bcrypt to fall back on. |
| `segno` | backend | Writes the card QR PNG (level M, quiet zone 4, 600 px or larger). Pure Python, no Pillow. |

Nothing else:
- SMTP is stdlib `smtplib`/`ssl`.
- Randomness, HMAC and SHA-256 come from the stdlib `secrets`, `hmac` and
  `hashlib` modules.
- QR decoding in the browser uses native `BarcodeDetector` and the
  already-installed `html5-qrcode`.
- The OTP boxes, strength bar and card use no new packages.
