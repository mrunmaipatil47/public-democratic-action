# Public Voice Between Elections

**A discussion pack, open data, accessible website and synthetic case-workflow prototype for
continuous public participation in India.**

> A vote should not be the last time the public is heard. People need ways to raise an issue,
> obtain a competent answer, challenge refusal and verify what changed, between elections and
> across constituency boundaries.

This repository is the working home of the pack *Public Voice Between Elections* (draft v0.1,
13 October 2026). It is **a proposal, not an endorsed movement platform**. No organisation
listed here has agreed to participate. Nothing here is legal advice.

## What is in the box

| Part | Where | What it gives you |
|------|-------|-------------------|
| The pack | `content/pack/` | Sections 1–9 as markdown: why, commitments, routes, foundations, refusal handling, contributions, organisations, invitation, first cycle |
| Open data | `data/` | 100 issue families, 10 domains, 7 challenge routes, 13 organisations, process targets, refusal responses, sources, as JSON with schemas in `schema/` |
| Website | `npm run build` → `site/` | Accessible static site: browse and filter the 100 issues, read every card, see which organisations touch which issue, copy the invitation |
| Workflow prototype | `src/workflow/`, `npm run simulate` | A synthetic intake, routing, response, challenge and review engine that encodes the pack's process targets and refusal rules |
| Importer | `tools/import-pack.py` | Re-creates `data/` and `content/pack/` from the exported Google Doc, so the next version of the pack can be imported and diffed |

## Quick start

Requires Node 22 or newer. No `npm install`; there are no dependencies.

```sh
git clone https://github.com/mrunmaipatil47/public-democratic-action.git
cd public-democratic-action
npm run validate     # check data integrity and cross-references
npm test             # run the test suites
npm run build        # generate the site into site/
npm run serve        # preview at http://localhost:8080
npm run simulate -- ration-denial   # walk a synthetic case through the process
```

Python 3.11+ is only needed to re-run the importer: `npm run import`.

## The four questions the pack asks

1. Who can raise an issue?
2. Who must answer?
3. What can change?
4. What happens when power refuses to listen?

Each of the 100 issue cards answers the first three for one issue family and names the
challenge routes for the fourth. The routes are options, not a compulsory ladder:

| Code | Route |
|------|-------|
| A | Administrative review |
| I | Information / RTI |
| R | Regulator or specialist redress |
| H | Rights or protection route |
| J | Qualified legal review / competent court or tribunal |
| P | Policy hearing / legislative scrutiny / lawful advocacy |
| V | Vigilance or audit referral |

## How to contribute

Bounded, remote contributions are welcome and do not imply endorsement or membership. The pack
lists eight kinds: evidence checks, law and jurisdiction maps, research and data, translation,
accessibility review, design and software testing, remote deliberation, on-ground correction.
See `CONTRIBUTING.md` and the issue forms under `.github/ISSUE_TEMPLATE/`.

Please do not submit real complainant data, personal activist contact details or anything that
could expose a person to retaliation. The workflow prototype only accepts synthetic records.

## Provenance

- Source: the Google Doc export in `content/source/`, imported by `tools/import-pack.py`.
- The pack was prepared with AI assistance. Check substantive claims, legal routes,
  translations and participant consent before adopting any text as a movement statement.
- Institutional sources were checked by the pack's authors on 13 October 2026; see `data/sources.json`.

## Licences

Code: MIT (`LICENSE`). Content and data: CC BY-SA 4.0 (`LICENSE-CONTENT.md`).

## Documentation

Start with `docs/architecture.md`. The `docs/` folder follows a simple convention: kebab-case
filenames and YAML frontmatter with `title`, `type`, `tags`, `created`, `updated`, `status`.
