---
title: Log — 2026-10-13 — review, fixes and first push
type: log
project: public-democratic-action
tags: [type/log, project/public-democratic-action, from/claude]
source: claude-conversation
created: 2026-10-13
updated: 2026-10-13
status: evergreen
---

# Log — 2026-10-13

## Done today

- Finished the holistic review that the 12 October build log left open. Six reviewers each took
  one lens: pack fidelity, correctness, accessibility (axe in headless Chromium), privacy and
  harmful automation, completeness, design quality. They reported 77 findings: 5 high, 22 medium,
  50 low.
- Verified the high and medium findings adversarially. Two independent skeptics per batch, with
  the rule that a finding survives only if neither can refute it. Result: 14 confirmed, 4 disputed
  (fixed only where the fixer could reproduce them), 6 refuted, 4 earlier pack-fidelity findings
  refuted by three votes in the first attempt. Refuted findings were mostly "specified behaviour,
  not a defect": the always-visible disclaimer, the English-only default build, the human
  validation marker as a plain string compare, the home page order.
- Fixed by area, one area at a time: workflow engine (re-routing after a verified transfer,
  silence detection shared between status and onSilence, grouped and prefixed mobile numbers,
  PAN, EPIC and Aadhaar VID patterns, no closure while a transfer awaits re-routing, protected
  cases withheld from the CLI), validator (process-target coverage the engine depends on,
  whitespace-only strings, personal-data pattern parity), site (keyboard-reachable scrolling
  tables, disclaimer inside the header landmark, table titles outside the scroll region,
  print page breaks, markdown emphasis inside links, no-referrer policy, organising cycle in the
  main navigation, route badge rendered once, footer wording, type check passes), docs (private
  reporting route without a labelling dropdown, translation fallback described correctly,
  stale troubleshooting removed, glossary quotes the pack before the repository reading,
  README and templates use the pack's own words).
- Importer: the DARPG/RTI sentence no longer carries export backslashes, and `data/pack.json`
  now publishes the appendix titles and the Appendix A caveat so the site quotes them from data.
- Caught a silent loss: the `.gitignore` pattern `site/` also matched `src/site/`, so the site
  generator had never been committed. Anchored the patterns and tracked the files.
- Final state: `npm run check` green (376 tests), `npm run typecheck` OK, 120 English pages built,
  360 pages across en/hi/mr, CSV exports written.
- Pushed `claude/build-session-rfvgfg`. Because the repository had no branch at all, GitHub made it
  the default branch.

## Thinking about

- Three engine rules are contract decisions, not bugs, and were left as specified: the 12-word
  floor for boilerplate detection, the requirement of a reasoned response before a filer withdraws
  or intake marks a duplicate, and hearing postponement. Change `docs/architecture.md` first if
  these should move.
- Hindi and Marathi interface strings are still drafts by the AI assistant. They need review by
  speakers before the language roots are deployed.
- Private reporting: GitHub private vulnerability reporting should be enabled in repository
  settings so SECURITY.md's preferred route exists.

## Captured from

- [[2026-10-12-build-log]]
- [[decision-log]]
- [[architecture]]

## Tomorrow

- Create `main` from this branch (or rename the branch) so pull requests and the Pages workflow
  can run; set Pages source to GitHub Actions.
- Confirm the licence choice (MIT for code, CC BY-SA 4.0 for content).
- Pick the three pilot issues from section 9 and start the first issue briefs.
