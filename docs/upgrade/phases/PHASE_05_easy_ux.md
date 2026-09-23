# Phase 5 - Make it easy to understand (clarity, not redesign)

Goal: a first-time vaidya, MSME founder or student knows where to start within 10 seconds and understands any answer within 30, in the existing look.
Read: PROGRESS.md, this file.

## Build
1. Home (existing layout; copy and ordering only). Proposition: "From an Ayurvedic formulation to the IP and regulatory questions that matter, with official sources behind every answer." Three doors with existing card components, in this order: Ask a question, Check my product, Explore a complex case. Proof points as small chips: source-cited, jurisdiction-aware, conflict-aware, multilingual, traditional-knowledge-aware, ABS-aware, expert-review ready. No statistics, no dashboard, no "100% accurate", "government-approved" or "replaces lawyers".
2. One answer shape everywhere (Ask, Product, Case): "In short" (60 words max, everyday words, acronyms expanded) -> "What this means for you" (3-5 bullets) -> evidence and details behind progressive disclosure.
3. Simple / Expert view toggle, remembered locally (a non-sensitive preference). Simple shows In short, escalation level, next actions and a "Show the evidence" link; Expert opens matrices, provenance and receipt by default.
4. Guided intake for Check My Product and cases: stepper, 7 steps max, one question per screen on mobile, an example under each field, "I don't know" on every question (becomes a missing fact, never blocks), draft saved for logged-in users, session-only otherwise.
5. Glossary: data/glossary/en.json with {term, plain_definition (25 words max), source_id or null}. Tap/hover definitions for ABS, NBA, PCT, Paris priority, TKDL, prior art, Section 3(p), Schedule T, Rule 158B, Ayurveda Aahara, proprietary medicine, biological resource. With a source_id it links to provenance; without one it is labelled "plain-language explainer".
6. Create docs/upgrade/COPY_STYLE.md and apply it: sentence case; active voice; buttons say what happens ("Prepare for Expert Review", "Run analysis again"); an action keeps the same name through the whole flow; errors say what happened and how to fix it, without apologising; empty states invite an action; explain acronyms on first use.
7. States: loading skeletons; network timeout -> "Retry" and "Ask a shorter question"; partial failures show what did succeed.
8. First-visit hints: at most 3 dismissible hints (where to start, what the escalation level means, how to open a source).
9. Accessibility: keyboard reachable; visible focus with existing tokens; aria-live for pipeline events; landmarks and labels; alt text; AA contrast over the video (add a scrim token if needed); prefers-reduced-motion; tap targets at least 44px.
10. Clean-up from the Phase 0 map:
    - Scan-badge login off the primary sign-in (scanBadgeLogin=false); if OpenCV is only used there, make it an optional dependency.
    - Ask available without login; login only for saving, workspace and export. Add an anonymous rate limit that does not persist IP addresses. If auth coupling makes this risky, keep it behind publicAsk and document why.
    - Move the 15-step patent timeline into a "Learn" section below the decision-support features.
    - Remove duplicate chatbots, duplicate source views, dead controls and decorative widgets.
    - Background video: reduced motion -> poster image; pause when the tab is hidden; skip on Save-Data or slow connections.

## Usability check (browser agent, 360px and 1280px, screenshots to docs/upgrade/screens/phase5/)
Tasks: 1) ask whether a classical formulation can be patented; 2) check a product with two unknown fields; 3) open the source behind one statement; 4) find what the system cannot conclude; 5) prepare a case for expert review. Record friction in PROGRESS.md and fix the top issues.

## Tests to add
Simple/Expert toggle; "I don't know" -> missing fact; glossary source link; automated accessibility check (axe or the existing tool) on home, result and Case Brief with zero serious violations.

## Gate
Full gate green. Commit "phase 5: clarity". Report in 15 lines or fewer.
