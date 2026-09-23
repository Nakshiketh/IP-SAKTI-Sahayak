# IP-SAKTI Sahayak: upgrade prompt pack for Antigravity + Claude

Team TATTVA X, SIH26045. This pack replaces the single 45-part prompt with small files that Claude reads only when needed, so it spends tokens on building, not re-reading.

## What's inside and when Claude reads it
| File | Read when | Job |
|---|---|---|
| .agents/rules/ip-sakti-core.md | Automatically, every session | Non-negotiable rules: keep the UI, legal-safety wording, one pipeline, token discipline. About 7.6k characters, under Antigravity's 12,000-character rules limit. |
| docs/upgrade/PROGRESS.md | Start and end of every phase | Claude's memory: repo map, baseline, what's done, handoff. Stops it re-scanning the repo. |
| docs/upgrade/phases/PHASE_XX_*.md | Only during that phase | What to build, what not to do, tests to add, gate. |
| docs/upgrade/FLAGSHIP_CASE.md | Phases 2, 4, 10 | The jury demo case, real conflict examples to verify, 3-minute talk track. |
| docs/upgrade/SOURCES_TO_VERIFY.md | Phases 1 and 9 | Official source families, verification targets, host allowlist. |
| .agents/workflows/next-phase.md | When you type /next-phase | Optional shortcut for the plan -> build -> gate -> handoff routine. |

## One-time setup (5 minutes)
1. Copy `.agents/` and `docs/` into the repo root (next to backend/, frontend/, corpus/).
2. Make sure `.agents/` is not listed in `.gitignore`.
3. In Antigravity, open Customizations -> Rules and confirm `ip-sakti-core` shows as always on. (Older Antigravity builds use `.agent/` singular; rename the folder if the rule doesn't appear.)
4. Commit: `git add .agents docs && git commit -m "Add upgrade prompt pack"`. Every phase ends with its own commit, so you can always roll back.
5. Don't paste the old long prompt again. Phase 0 archives PROMPT.md.

## Every session
1. Start a new conversation for each phase. This is the single biggest token saver.
2. Pick the strongest Claude model you have for Phases 0-4 and 6; a faster model is fine for 5 and 7-9.
3. Use Planning mode, paste the kickoff line, approve the plan, let it build.
4. Read the 15-line report, check the app quickly, commit.

## Kickoff lines (copy and paste)
| Phase | Paste this into a new conversation |
|---|---|
| 0 | Run Phase 0. Follow @docs/upgrade/phases/PHASE_00_audit.md exactly, then stop for my review. |
| 1 | Run Phase 1. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_01_trust_foundation.md. Show a plan (25 lines max) before editing. |
| 2 | Run Phase 2. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_02_reasoning_pipeline.md. Plan first. |
| 3 | Run Phase 3. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_03_check_my_product.md. Plan first. |
| 4 | Run Phase 4. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_04_flagship_case_ui.md. Plan first. |
| 5 | Run Phase 5. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_05_easy_ux.md. Plan first. |
| 6 | Run Phase 6. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_06_multilingual.md. Plan first. |
| 7 | Run Phase 7. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_07_workspace_roadmap_chat.md. Plan first. |
| 8 | Run Phase 8. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_08_voice_helpline.md. Plan first. |
| 9 | Run Phase 9. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_09_admin_monitoring_docs.md. Plan first. |
| 10 | Run Phase 10. Read @docs/upgrade/PROGRESS.md, then follow @docs/upgrade/phases/PHASE_10_hardening_report.md. Plan first. |

## Rescue lines (when things drift)
- "Context is getting long. Write the handoff in PROGRESS.md and stop."
- "Continue Phase N from the handoff in @docs/upgrade/PROGRESS.md."
- "You're re-reading the repo. Use the repo map in PROGRESS.md and search instead."
- "Gate failed. Fix only the failing checks. Don't change a test unless you justify it in PROGRESS.md first."
- "That button doesn't work. Per the rules, make it work or remove it."

## Milestones
- A, after Phase 4: both jury recommendations work end to end. Demo-ready.
- B, after Phase 6: easy to understand, and multilingual across Indian and international languages.
- C, after Phase 10: hardened, fully tested, final report written.
Short on time before the finale? Do 0 -> 4, then 5 and 6. Phases 7-9 are extras.

## Jobs only your team can do
- Read and approve the Phase 0 map (about 5 minutes).
- Human-review key legal sources: open the official PDF, confirm the stored text matches, mark it with `scripts/registry_review.py`. Start with the ones the flagship demo uses.
- Review the Hindi and Telugu interface text (Tier 1).
- Put an LLM API key in `.env` if you want the translation script to draft the other languages.
- Rehearse the 3-minute talk track in FLAGSHIP_CASE.md.

## Fix in your SIH deck
- Slide 4 says "IP-SHAKTI"; the problem statement and other slides say "IP-SAKTI". Use IP-SAKTI everywhere.
- "IP Status", "Trademark/Patent conflicts" and "Patent APIs" imply live registry data. Unless Phase 0 finds a real integration, reword to "prior-art search strategy" and "registry checks you should run".
- Once Phase 6 is done, "10+ languages" becomes true, with honest Tier 1 / Beta labels.
