# Member sign-in — setup and checks

How to configure, start and check the member sign-in on your own machine.
`AUTH_PLAN.md` explains how it is built and why; `DESIGN_PLAN.md` covers the
portal's design.

## 1. Fill `backend/.env`

Create `backend/.env`. It is gitignored. Fill these keys yourself, and never
paste their values into a chat, an issue or a commit.

| Key | What to put | Required |
|---|---|---|
| `SESSION_SECRET` | 64 hex characters from `gen-secrets` (below) | yes, the server will not start without it |
| `OTP_SECRET` | 64 hex characters from `gen-secrets` | yes, the server will not start without it |
| `DEMO_MEMBER_TEMP_PASSWORD` | a temporary password you choose; the member must change it at first login | to seed the demo member |
| `EMAIL_HOST` | `smtp.gmail.com` (the default) | for email codes |
| `EMAIL_PORT` | `465` (the default) | for email codes |
| `EMAIL_SECURE` | `true` for 465; `false` for 587 with STARTTLS | for email codes |
| `EMAIL_USER` | the Gmail address that sends the codes | for email codes |
| `EMAIL_PASSWORD` | a Gmail **App Password**: 16 characters, spaces removed. Not the account password. | for email codes |
| `EMAIL_FROM` | usually the same address as `EMAIL_USER` | for email codes |
| `APP_BASE_URL` | the public address, e.g. `https://…onrender.com`; empty locally | when deployed |
| `COOKIE_SECURE` | `true` on HTTPS; `false` on `http://localhost` | when deployed |
| `ENABLE_DEMO_CARD` | `true` to show `/demo/member-card` (never shown in production) | optional |

**Gmail App Password.**
1. Turn on 2-Step Verification for the sending account.
2. Open **Security → App passwords** and create one named "IP-SAKTI Sahayak".
3. Copy the 16 characters into `EMAIL_PASSWORD` with the spaces removed.

## 2. Commands

Run from `backend/`:

```
.venv/Scripts/python.exe -m pip install -e ".[dev]"          # once: installs argon2-cffi
.venv/Scripts/python.exe -m app.auth.cli gen-secrets          # prints SESSION_SECRET and OTP_SECRET
.venv/Scripts/python.exe -m app.auth.cli seed                 # creates the demo member
.venv/Scripts/python.exe -m app.auth.cli issue-card --member IPS-2026-0001
.venv/Scripts/python.exe -m app.auth.cli test-email           # sends one marked test message
.venv/Scripts/python.exe -m app.auth.cli revoke-card --member IPS-2026-0001 --reason lost
```

- `issue-card` writes `demo/cards/IPS-2026-0001-qr.png`, which is gitignored.
  It is the card image.
- The server also seeds the member, and issues a card if none was ever
  issued, each time it starts, whenever `DEMO_MEMBER_TEMP_PASSWORD` is set.

## 3. Start it

| What | Command | Address |
|---|---|---|
| API | `cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000` | `http://127.0.0.1:8000` |
| Web app | `cd frontend && npm run dev` | `http://localhost:5173` |

When the API starts, its log should say `email transport ready`. If it says
`email transport not configured` or names an error, look at the `EMAIL_*`
keys.

## 4. Tests

| Suite | Command | Last result |
|---|---|---|
| Backend | `cd backend && .venv/Scripts/python.exe -m pytest` | 846 passed |
| Frontend | `cd frontend && npx vitest run --maxWorkers=2 --minWorkers=1` | 582 passed, 2 failed |

- **Frontend failures.** Both were failing before the member sign-in work
  began:
  - `backdrop.test.tsx`: "same element on every tab" times out.
  - `Analyst.test.tsx`: follows the uncommitted `Analyst.tsx` edit.
- **Fewer workers.** Two workers keep memory down. A full parallel run on
  this machine hit low memory and timeouts.
- **Acceptance.** The brief's cases A–K are
  `backend/tests/test_member_auth_acceptance.py`, one test per letter.

## 5. Manual checklist

These are the checks only the member can do, on a real device.

1. **Email arrives.** Run `test-email`. The message should arrive in the Gmail
   inbox (check spam too), with "[Test]" in the subject and the dummy code
   123456 in the body.
2. **The card scans from a camera.**
   1. Open `http://localhost:5173/demo/member-card` on a phone, with
      `ENABLE_DEMO_CARD=true`.
   2. On the laptop, open `http://localhost:5173/login` and choose **Scan
      Member ID**.
   3. Allow the camera, then hold the phone's screen up to it.
   4. The member record and "Member ID verified" should appear.
3. **The code signs you in.** Enter the 6-digit code from the email. The page
   should say "Verified. Opening your dashboard…", then show
   **Create your new password**, because the member is on the temporary
   password.
4. **Change the password.** Choose one that meets the four rules. You should
   land on the home page.
5. **Log out.** Use **Sign out** in the header. The portal should say "You've
   been logged out."
6. **The dashboard stays closed.** While logged out, type
   `http://localhost:5173/sahayak` into the address bar. It should land on the
   portal, with no page content shown first.
7. **Printing.** On `/demo/member-card`, choose **Print card** and print at
   100% scale, not "fit to page". Measure the card: it should be 85.6 × 54 mm.
8. **The upload fallback.** On the portal, choose **Upload a photo of your
   Member ID** and pick the PNG from **Download card (PNG)**. It should verify.
