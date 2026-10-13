---
title: How to re-import the pack
type: sop
project: public-democratic-action
tags: [type/sop, project/public-democratic-action]
source: claude-conversation
created: 2026-10-12
updated: 2026-10-13
status: growing
---

# How to re-import the pack

Use this when a new version of the Google Doc is published, or when a correction has been accepted
and applied to the document. `data/` and `content/pack/` are generated. Never edit them by hand.

You need Python 3.11 or newer, Node 22 or newer, and git. No packages.

## Steps

1. **Export the Google Doc as markdown.** In Google Docs: File → Download → Markdown (.md). Do not
   use "Plain text"; the importer relies on the `#` headings and the `  - ` list markers that the
   markdown export produces.

2. **Place the file in `content/source/`.** Name it `public-voice-between-elections-v<version>.md`,
   for example `public-voice-between-elections-v0.2.md`. Keep the previous version's file; it is
   provenance.

3. **Run the importer.**

   ```sh
   python3 -I tools/import-pack.py content/source/public-voice-between-elections-v0.2.md data content/pack
   ```

   `npm run import` runs the same command but is pinned to the v0.1 filename in `package.json`.
   Update that script in the same pull request when the version changes. The `reimport` job in
   `.github/workflows/ci.yml` reads the filename from that script, so it follows automatically;
   nothing else should pin the path.

   The importer prints a one-line count on success: issues, domains, routes, organisations,
   sources, prose sections. If it prints a Python traceback instead, stop and read "Gotchas".

4. **Review the diff.**

   ```sh
   git status
   git diff --stat
   git diff data/ content/pack/
   ```

   Every change should trace to a change in the document. If something changed that the document
   did not, the importer has a bug or the export format changed. Do not commit until you understand
   each hunk.

5. **Run the checks.**

   ```sh
   npm run check      # validate, test, build
   ```

   The validator checks ids, slugs, ranges, route codes, agenda links, URLs, counts and schemas,
   process-target coverage (one receipt, routing and response target for every channel and
   participation route), blank strings, pack fidelity of quoted fields and the personal-data
   patterns, and prints every problem. The tests include data invariants and every synthetic
   scenario.

6. **Update what reads the version.** Search for the old version string and date:

   ```sh
   grep -rn "v0.1\|13 October 2026\|2026-10-13" README.md CONTRIBUTING.md SECURITY.md docs/ i18n/ src/ scripts/ tests/ .github/ package.json
   ```

   Update `pack.json`'s `date` if the importer still hard-codes it (it does in v0.1; see Gotchas).
   Expect hits under `tests/`: the suites pin the pack version, the ISO date and the source filename
   (see Gotchas), so `npm test` stays red until they are updated too.

7. **Open a pull request.** Title it "Import pack v0.2". In the description list the document
   changes in plain words, link the source document, and paste the tail of `npm run check`. CI
   re-runs the importer and fails if the committed output differs from it.

## Gotchas

- **The importer fails loudly if the structure changes.** It expects exactly nine numbered sections,
  three appendices, 100 issue cards each with three lines in a fixed form, 13 organisations each
  with five lines in a fixed form, and route names matching Appendix B. A moved heading, a renamed
  label like "Documented relevance:" or a new bullet style stops the import with a message naming
  the line. This is deliberate: silently importing a changed document would be worse. Fix the
  document or extend the importer, then re-run.

- **The process-targets sentence is pinned.** Section 4's "Suggested process targets: …" sentence is
  compared against a fixed prefix in `tools/import-pack.py`. If the authors change the targets, the
  importer stops with "Process targets sentence changed; update the structured targets below." Update
  the `process_targets` block in the importer to match the new sentence, update the pinned prefix,
  and re-run. Then check `docs/workflow-engine.md` and the engine's tests, which encode the same
  numbers.

- **The round-trip check.** The importer rebuilds every issue card from the structured data and
  compares it with the source lines. A mismatch means a card has an unusual separator (a comma
  inside a route name, a semicolon inside a "Raise" list). Fix the document or extend the parser.

- **`date` is hard-coded.** The importer writes `"date": "2026-10-13"` into `pack.json` because the
  document gives the date as text ("13 October 2026"). When the date changes, update the importer.

- **The tests pin the version too.** `tests/data.test.mjs` asserts `pack.version` and `pack.date`
  literally, `tests/site.test.mjs` builds its own path to the v0.1 source file and names "Draft
  v0.1" in test titles, and `tests/fixtures/broken-section.md` carries `source_version: v0.1`. A
  version bump that skips them ends with a red `npm test` whose first failure is an unequal version
  string. The step 6 grep covers `tests/` so you find them first; deriving the expected values from
  `data/pack.json` and `package.json`'s `import` script instead is to be confirmed.

- **Agenda links must parse.** "Agenda links: 004–008, 037" uses an en dash for ranges. A hyphen also
  works. Anything else ("004 to 008") fails.

- **Escaped characters.** The Google export escapes `.`, `[` and `]` after numbers (`001\.`). The
  importer unescapes them. If a future export stops escaping, the regexes still match; if it starts
  escaping something new, you will see it in the diff as a stray backslash.

- **Trailing blank lines** are stripped. Blank lines inside the document are ignored.

## Related

- [[data-model]]
- [[decision-log]]
- [[architecture]]
- [[2026-10-12-build-log]]
