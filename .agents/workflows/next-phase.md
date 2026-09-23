---
description: Run the next IP-SAKTI upgrade phase with plan, gate and handoff
---

1. Read docs/upgrade/PROGRESS.md. Find "Current phase" and the "Handoff" section.
2. Open only the next file in docs/upgrade/phases/. Do not open other phase files.
3. Write an implementation plan of 25 lines or fewer: files to touch, schema changes, tests to add, risks. Wait for the user's approval.
4. Implement in small steps. Run only the tests affected by each step.
5. Run the full gate using the commands recorded in PROGRESS.md.
6. Update PROGRESS.md: status, capability coverage rows, decisions, manual steps, handoff.
7. Commit with message "phase N: <title>".
8. Report in 15 lines or fewer: done, not done, test counts, anything the user must do. Stop.
