# Contributing

Thank you for looking at this. The pack says it plainly: an existing organisation need not become a
coalition member to improve this draft. A bounded technical correction, an anonymised case example
or a review of one issue family is useful. Remote contribution is an option, not evidence that a
group is inactive or stays indoors.

Contributing here does not imply endorsement, coalition membership or permission to use your name.
This is a proposal, not an endorsed movement platform. Nothing here is legal advice.

## Before you start

- Read `README.md` and, if you plan to touch code or data, `docs/architecture.md`.
- Pick one bounded task. One claim, one owner map, one issue brief, one page.
- Use the issue forms under `.github/ISSUE_TEMPLATE/`. They ask the questions below so you do not
  have to remember them.
- Never include real complainant data or personal contact details. See "What never to submit".

## The eight bounded contribution types

These come from section 6 of the pack. For each, here is what a good submission looks like.

| Type | The pack's words | A good submission |
|------|------------------|-------------------|
| Evidence | Verify one public claim, identify its source and denominator, and record what remains uncertain. | Quotes the claim as it appears (issue id or section). Names the source with a link to the official text. States the denominator and date. Says what the source does not settle. Uses the `evidence-check` form. |
| Law and jurisdiction | Correct one owner/remedy map and explain the governing procedure. | Names the issue id. States the current "Answer" and routes from the card, the proposed owner or remedy, and the governing procedure with its deadline, with a link to the official text. Says which state or sector it applies to. Uses the `legal-route-map` form. |
| Research and data | Audit public records, clean datasets or examine repeated service failures without exposing personal identities. | Works from aggregates and public records. Documents method and denominator. Contains no names, identifiers or locations fine enough to identify a household. Opens a `correction` or `evidence-check` issue first to agree scope. |
| Language and communication | Translate one issue brief into Marathi, Hindi or another relevant language; check meaning with users. | Names the language and scope (UI strings, one brief, one section). Says how the meaning was checked and with whom, in general terms. Flags terms that have no clean equivalent. Uses the `translation` form. See `docs/how-to-add-a-language.md`. |
| Accessibility | Review an intake journey or document with disabled participants and compensate specialist review where possible. | Says what was reviewed and with which assistive technology or settings. Describes what failed and what worked. Proposes a fix. Says whether disabled participants took part and whether specialist review was compensated. Uses the `accessibility-review` form. |
| Design and software | Test a synthetic intake/appeal workflow for routing, privacy, failure recovery and harmful automation. | Runs `npm run simulate -- <scenario>` or writes a new synthetic scenario. Reports where routing, privacy guards, deadlines or recovery behave wrongly. Includes a failing test where possible. Uses the `synthetic-case` form for new scenarios. |
| Deliberation | Facilitate a small remote session that records evidence, counterarguments, agreement and dissent. | Submits a session record with all four parts, in that order. Records dissent in the dissenter's words. Includes consent and attribution preferences for anyone named. Opens a `correction` issue per change proposed. |
| On-ground connection | Ask affected people what the draft misunderstands; relay their corrections with consent and attribution preferences. | Relays corrections, not identities. Records consent and attribution preference for each correction. Does not become a membership list. Uses the `correction` form per issue card. |

## The contribution form

Section 6 of the pack gives a simple contribution form. Every issue form in this repository maps
onto it: the task-specific fields cover 1–4 where they apply (a translation or an accessibility
review has no evidence link; an organisation suggestion's method is the official pages it links;
a synthetic scenario has neither), a shared block of optional fields asks for 5–8, and the credit
dropdown is 9. Fields 5–8 are optional because effort and availability are chosen by the
contributor, not demanded; fill them in where they matter to you. If you write to us another way,
cover these fields:

1. Issue ID (001–100), or the pack section
2. Proposed correction/task
3. Evidence link
4. Method
5. Effort and availability chosen by the contributor
6. Privacy needs
7. Reviewer (who should check this)
8. Expected output
9. Credit/consent preference (anonymous, organisation name, or your name)

The pack adds a caveat we follow:
"Do not imply that a volunteer promises unpaid professional legal representation or indefinite support."
A contribution is the task you describe, nothing more. Scope is agreed before anything is treated
as a commitment.

## Running the checks

You need Node 22 or newer. There is nothing to install.

```sh
npm run validate   # data integrity, cross-references and JSON Schemas
npm test           # node:test suites under tests/
npm run build      # generates the site into site/
npm run check      # all three in order
```

Other useful commands:

```sh
npm run serve                        # preview the site at http://localhost:8080
npm run simulate -- ration-denial    # walk a synthetic case through the process
npm run simulate -- all              # every scenario
npm run export:csv                   # CSV exports into exports/
npm run import                       # re-run the importer (needs Python 3.11+)
```

`npm test` runs `node --test`, which discovers `tests/*.test.mjs`; CI runs the same command.

Tests use `node:test` and `node:assert/strict` only. Scripts exit non-zero on failure and print every
problem, not only the first.

## Proposing a change to an issue card

Do not edit `data/*.json` or `content/pack/*.md` by hand. Both are generated by
`tools/import-pack.py` from the exported source document in `content/source/`. A hand edit would be
overwritten on the next import, and CI checks that the committed data matches the importer output.

Instead:

1. Open a `correction` issue. Quote the current text, give the proposed text, link the evidence,
   name the source and denominator, and say what remains uncertain.
2. A maintainer applies accepted corrections to the source document, re-exports it, and runs
   `npm run import`. See `docs/how-to-reimport-the-pack.md`.
3. The resulting diff to `data/` and `content/pack/` is reviewed in a pull request.

The pack says: issue numbers are stable references; local groups should correct, split, merge or add
issues based on evidence. This repository's rule, derived from that: an existing id never changes
meaning. How a split or merge is represented in the data is to be confirmed; see
`docs/data-model.md`.

## What never to submit

- Real complainant data: names, case numbers, addresses, phone numbers, identity numbers, dates of
  birth, or a story detailed enough to identify a household.
- Personal activist contact details. The pack includes no personal activist contact database. Use
  institutional public routes only.
- Anything that could expose a person to retaliation. The pack's refusal response for retaliation
  or credible harm is a protected referral, not a dashboard entry.
- Unsourced legal claims. If you cannot link the governing text, say so and mark it "to be
  confirmed".
- Anything that upgrades a proposed commitment into an existing legal guarantee. The pack's
  commitments are proposals requiring adoption.

The workflow prototype refuses records that are not marked synthetic and rejects personal-data
patterns (listed in `SECURITY.md`; `npm run validate` applies the same patterns to `data/` and
`content/pack/`). Keep it that way. In scenarios and issue briefs, owners are offices, never
officials: name a lead office, co-owner, receiving office or vigilance body as an institution, and
never invent a person, even a fictional one. If you post personal data by accident, see
`SECURITY.md`.

## Review and consent before names are published

Section 9 of the pack: record agreement, dissent and scope; obtain consent before publishing names.
We apply that to contributors too.

- Your credit and consent preference is asked on every contribution form. The default is no name.
  (The private channel request form asks for nothing; it is not a contribution.)
- A maintainer reviews every contribution before it is merged or published.
- Organisation names appear only as the pack already lists them, or with the organisation's
  explicit agreement. Reviewing the draft does not imply endorsement or permission to use a name.
- Dissent is preserved. If you disagree with how a contribution was handled, say so in the issue and
  it stays on record.

## Licences for contributions

By contributing you agree that:

- Code you submit is licensed under MIT (`LICENSE`).
- Content and data you submit (text, translations, issue briefs, scenario storylines proposed
  through the `synthetic-case` form, documentation) are licensed under CC BY-SA 4.0
  (`LICENSE-CONTENT.md`). Scenario files under `src/workflow/scenarios/` are code and fall under MIT.
- You have the right to license what you submit, and it contains no personal data of others.

Attribution for content goes to "Public Voice Between Elections (public-democratic-action
contributors)" unless you asked to be credited by name and a maintainer confirmed it.

## Code conventions

Read `docs/architecture.md` first. In short: Node 22, ES modules with `.mjs`, JSDoc types, no runtime
or dev dependencies, `node:test`, ISO dates in UTC, relative links in generated HTML, and the pack's
vocabulary: issue family, challenge route, lead office, co-owner, reasoned response, verified
transfer, preserved dissent, evidence of change.

## Code of conduct

Everyone taking part is bound by `CODE_OF_CONDUCT.md`.
