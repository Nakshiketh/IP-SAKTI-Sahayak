# Member portal — design plan

Phase 5 of member authentication. Written before building, as the brief
requires, and reviewed against its "Do not ship" list (section 6).

## 1. The job, and what bends the brief

The page gets a registered member in quickly, and makes the platform look like
the front desk of a serious research institution, not a startup.

Two of the member's decisions (2026-09-26) take precedence over the brief:

- **The background video stays, unaffected** (decision 2). `HeroVideo` is not
  edited: its source, brightness, saturation and edge gradient stay as they
  are. The portal is laid over it.
- **Colours must match the video, and translucent is allowed** (decision 3).
  The brief's "no glassmorphism, no backdrop blur" is set aside for the
  portal's surfaces, and only where text needs a calm ground over moving
  footage. Everything else on the "Do not ship" list still applies.

The brand is deliberate (see `AUTH_PLAN.md` §7), so the brief's palette is
mapped onto it rather than replacing it.

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| Nil → **leaf** | `#1D4B36` | brand pane (translucent over video), primary button text, seal ring |
| Leaf deep | `#0E2419` | scanner viewport ground (brief: "deep indigo, not black"; here deep leaf) |
| Ink | `#1A2029` | text on the paper label and on white buttons |
| Muted (on paper) | `#4F5866` | label field names |
| Herbarium white | `#F6F7F3` | the member record label; primary button face |
| Sheet line | `#D5DAD0` | rules on the paper label |
| On-glass text | `#FFFFFF`, and white at 78% for secondary | text over the tinted surfaces |
| On-glass line | white at 28% | input borders and dividers over the tint |
| Haldi | `#C9971C` | **only** the scanner corners and scan line |
| Neem | `#2F6B45` | "Verified" seal and success lines, used on the paper label |
| Neem, on glass | `#8FD1A8` | success text over the dark tint (Neem itself is too dark there) |
| Sindoor | `#B42318` on paper; `#FFB4A8` on glass | errors only |
| Focus ring | 2 px white on glass, 2 px leaf on paper | always visible; never removed |

**Surfaces over the video**
- **Brand pane:** leaf at 82% opacity with a 14 px backdrop blur, full height,
  38% wide. It reads as a solid green panel through which the footage moves.
- **Portal sheet:** `#08130D` at 62% opacity with a 12 px backdrop blur, full
  height, flush against the brand pane, 560 px wide. It is not a floating
  card: no radius, no shadow, no border except a 1 px line on its right edge.
  To the right of it, the footage is untouched.

**Contrast (WCAG AA, worst case: the brightest video frame behind the tint)**
- White on the brand pane: at least 8:1.
- White at 78% on the portal sheet: at least 7:1.
- Ink on herbarium white: 15.4:1.
- Neem on herbarium white: 6.2:1.
- Haldi is decorative. It carries no text, and the status line says the same
  thing in words.

**Type.** The existing brand fonts, so nothing new is bundled:
- Wordmark, the main heading and "सहायक": Tiro Devanagari Hindi, the display
  face already in use.
- Everything else: IBM Plex Sans 400, 500 and 600.
- Scale: 14, 16, 20, 28, 36 px, with body line-height 1.5 and sentence case.
- Member ID and code digits use `tabular-nums`. No monospace anywhere.

**Shape**
- Buttons and inputs: 6 px radius. Inputs are 44 px tall, with a 1 px line
  and a 2 px focus ring.
- Scanner viewport: 12 px radius. The member record: 2 px radius.
- No drop shadows anywhere in the portal.

## 3. Wireframes

**Desktop (1024 px and up)**

```
+----------------------+----------------------------+--------------------+
| brand pane (leaf 82%)| portal sheet (dark 62%)    |  video, untouched  |
| 38% wide             | 560px, content max 440px   |                    |
|                      |                   [English]|                    |
| IP-SAKTI Sahayak     |                            |                    |
| सहायक                | Registered Member Portal   |                    |
|                      | Secure access for ...      |                    |
| "Ask about protecting|                            |                    |
|  ... kept separate." | [ scanner / step area   ]  |                    |
|                      |                            |                    |
|  (tulsi, fine lines) | [ Scan Member ID        ]  |                    |
|  Ocimum tenuiflorum  | ----------- or ----------  |                    |
|                      | [ Log in another way    ]  |                    |
|                      | Upload a photo of your ID  |                    |
|                      |                            |                    |
|                      | (lock) Authorized members  |             [mute] |
+----------------------+----------------------------+--------------------+
```

At 1024–1279 px the sheet takes all the remaining width and the untouched
strip disappears; the brand pane stays at 38%.

**Tablet (640–1023 px).** No brand pane. A 56 px leaf top bar carries the
wordmark. The sheet is full width, with the content column centred at up to
440 px.

**Mobile (below 640 px)**

```
+--------------------------------+
| IP-SAKTI Sahayak      [English]|  56px leaf bar
+--------------------------------+
| Registered Member Portal       |  sheet, full width, 20px padding
| Secure access for ...          |
| [ square scanner, full width ] |
| [ Scan Member ID            ]  |  48px min height, full width
| ------------- or ------------- |
| [ Log in another way        ]  |
| (lock) Authorized members only |
+--------------------------------+
```

Each step's main action has to fit on a 375 × 667 screen without scrolling.

## 4. The one memorable element

When the card verifies, the scanner area is replaced by **the member record,
styled as a herbarium accession label**:
- a small herbarium-white slip with a 1 px sheet-line border and a 2 px radius
- label/value rows for Name, Role, Institution and Member ID, in ink
- beside it, a circular **"Verified"** seal in Neem that presses in once
  (scale 1.08 to 1, over 220 ms).

Paper on dark glass is the only light surface on the page. That contrast is
what makes it memorable, so nothing else competes with it.

Apart from the scan line, this press is the only motion that happens without
the reader doing something. With `prefers-reduced-motion` there is no sweep
and no press. The background video already pauses for reduced motion, and
that behaviour is untouched.

## 5. Steps, routes and controls

- **`/login`, the QR flow**
  1. **Initial:** the heading, the idle viewport (deep leaf, Haldi corners, no
     camera), "Scan Member ID", "or", "Log in another way", "Upload a photo of
     your Member ID", and the lock line.
  2. **Scanner active:** the camera starts only when the reader taps. The rear
     camera is preferred. The status reads "Hold your Member ID inside the
     frame.", with a sweeping 2 px Haldi line every 2.4 s at 60% opacity. On
     detection the line stops and the corners turn Neem for 150 ms, then the
     status reads "Checking Member ID…". Camera tracks stop on detection, on
     cancel and on unmount.
  3. **Member verified, then code entry:** the label and seal, then "We sent a
     6-digit code to n**********8@gmail.com. It expires in 5 minutes.", six
     digit boxes (paste fills all six, Backspace steps back, it submits by
     itself), and "Resend code in 0:42".
  4. **Success:** "Verified. Opening your dashboard…", then the home page.
- **`/login/password`**: Member ID or username, and password with a
  "Show"/"Hide" text button. "Forgot password?" appears here only.
- **`/forgot-password`**: details, then code, then new password. The same
  controls as above.
- **`/create-password`**: new password and confirm, the live checklist of four
  rules, and a four-segment strength bar labelled Weak, Fair or Strong.

**Scanner situations, each with its own copy from the brief:**
- camera permission prompt
- permission denied
- no camera
- camera already in use
- insecure context

The upload fallback is always on offer. The card has no readable payload, so
an uploaded photo is matched on the server, like camera frames.

**Accessibility**
- One `aria-live="polite"` region announces each state change.
- Focus moves to each new step's heading.
- The whole flow works with the keyboard alone.

## 6. Review against "Do not ship"

| Item | Plan | Verdict |
|---|---|---|
| Gradient backgrounds, mesh, glass, blur, glow, gradient text | Blur on the two tinted surfaces over the video, at the member's request (decision 3). The video's own edge gradient is existing and untouched. No mesh, glow or gradient text. | **Changed on purpose, noted** |
| Centred white card with a soft shadow | Removed the current centred frosted card with its 60 px shadow. The sheet is flush, full height, with no shadow. | Fixed |
| Purple, violet, Tailwind indigo, stock shadcn | Leaf, deep leaf, Haldi, Neem, Sindoor. | OK |
| Inter, Poppins, Roboto, Montserrat, Space Grotesk, monospace | Tiro Devanagari Hindi and IBM Plex Sans. | OK |
| Emoji, sparkles, "AI-powered", robots | None. Lucide lock, camera and image icons only, with meaning. | OK |
| "Welcome back!", "Oops!", exclamation marks | Copy from the brief's table, exactly. | OK |
| Tracked all-caps labels | The current "OR" divider is tracked all-caps; it becomes lowercase "or". | **Fixed** |
| One word coloured in a heading | None. | OK |
| "→" on buttons or links | None. | OK |
| " · " meta strings | None. | OK |
| Fade-and-slide on everything, hovers everywhere, bounces, confetti | Only the scan line and the seal press. The current card's `fadeUp` entrance is removed. Hover is a colour change on buttons only. | **Fixed** |
| Feature grids, icon cards, statistics | None. | OK |
| Stock illustration, clip-art leaves, lotus, Om | A tulsi sprig drawn in a few strokes, which the critique pass may cut. | Watch |
| State Emblem, Lion Capital, ministry logos | None. | OK |
| An icon inside every input | The current password field has an eye icon; it becomes a "Show"/"Hide" text button. No other input icons. | **Fixed** |

## 7. Changes from the current sign-in page

- **Kept:**
  - `HeroVideo` (unchanged)
  - the language selector
  - the mute and volume control
  - every sign-in path
- **Replaced:**
  - the centred frosted card, with the pane and the sheet
  - the scanner modal, with the scanner inside the page
  - the single code box, with six boxes
  - the eye icon, with "Show"/"Hide"
- **Removed:** the card's entrance animation and the tracked "OR".

## 8. Critique of the first screenshots, and what changed

Screenshots were taken at 1536 px, the widest this screen allows, and at
375 px and 768 px. The narrow widths were rendered in same-origin frames of
exactly that width. Findings, in order of how much they mattered:

1. **The main action was below the fold on a phone.** At 375 × 667 the
   full-width square scanner, the heading and a notice pushed "Scan Member ID"
   off the first screen. While the camera is off, the viewport is now a short
   band on phones (16:7); it opens to the full-width square when scanning
   starts. On wider screens the square is capped by the window's height. The
   button now ends at 494 px of 667.
2. **The mute control covered the step's main button on phones.** It moved
   into the top bar beside the language selector below 1024 px. It stays in
   the bottom-right corner over the video on wide screens, where it covers
   nothing.
3. **The language selector was unreadable on the dark surface.** Its label
   was always drawn in ink, whatever class it was given, and the old sign-in
   page had the same flaw. `LanguageSelector` gained `tone="inverse"`. The
   default is unchanged, so the site header and mobile menu look as before.
4. **The member record wrapped badly at 375 px.** "Student / Researcher" and
   the Member ID broke over two lines next to the seal. On phones the seal now
   sits above the rows, which get the full width. The Member ID never wraps.
5. **"Fair" used a yellow close to Haldi**, which the brief reserves for the
   scanner. It is now neutral white. Weak stays Sindoor-light and Strong
   Neem-light.
6. **Backdrop blur removed (decorative).** Two full-height blurs over a
   playing video are recomputed on every frame, and the renderer visibly
   struggled. Both surfaces keep their translucent tint, as the member asked,
   but no longer blur. The tints are a little denser (brand pane 86%, sheet
   72%) to hold contrast.
7. **Tulsi drawing removed (decorative).** At full size it read as generic
   leaves rather than holy basil, which is the brief's own test for leaving it
   out. The brand pane is complete without it.
8. **"Save password" was just below the fold at 375 px.** The rule checklist
   is now two columns at every width, and the top padding is smaller on
   phones. The button ends at 600 px of 667.

The member record, the seal press and the scan line were kept as designed.
They are the page's one memorable moment and its one ambient motion.
