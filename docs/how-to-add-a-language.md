---
title: How to add a language
type: sop
project: public-democratic-action
tags: [type/sop, project/public-democratic-action]
source: claude-conversation
created: 2026-10-12
updated: 2026-10-13
status: seed
---

# How to add a language

The pack asks for translation of issue briefs into Marathi, Hindi or another relevant language, with
meaning checked with users (section 6). We do this in two steps. First the site's UI strings, so a
reader sees navigation, labels and notices in their language. Then, separately, the content.

This is written from the module contract in [[architecture]]. The file format itself is documented
in `i18n/README.md`, which is authoritative where the two differ. Check the key list against
`i18n/en.json` before you start.

## How i18n works

- `i18n/en.json` holds every UI string the site generator uses, as flat `"key": "text"` pairs with
  dotted keys such as `site.name` and `site.skipLink`. It is complete and is the default build.
- Three keys starting with an underscore are metadata, not strings: `_language` (the language's
  name in that language), `_status`, and `_note`.
- `i18n/<code>.json` holds the same keys for another language. `<code>` is the language's BCP 47
  code (`hi`, `mr`, `ta`, `pa-Guru`). It becomes the output folder `site/<code>/` and the page's
  `lang` attribute, so use a correct code. A key missing from a translation file fails the build,
  which lists every missing key; there is no fallback to English, so copy `en.json` and keep every
  key.
- A translation file carries `"_status": "draft-unreviewed"` until a meaning check with users has
  been done and recorded. The site shows a visible notice while the status is draft.
- `npm run build -- --lang en --lang hi` writes the English site and `site/hi/` with translated
  chrome and English content, plus a notice that content translation is pending. The header gains a
  language switcher as soon as more than one language is built. The default build is English only.

## Steps

1. **Open a `translation` issue** naming the language and the scope "UI strings". This is where the
   meaning check is recorded later.

2. **Copy the English file.**

   ```sh
   cp i18n/en.json i18n/<code>.json
   ```

   Set `"_language"` to the language's own name and `"_status"` to `"draft-unreviewed"` at the top.
   Keep every key. Do not add keys; if a string is missing from `en.json`, that is a bug in the
   generator and belongs in a separate issue.

3. **Translate the values.** Keep placeholders like `{count}` or `{title}` exactly as they are. Keep
   the pack's hedges ("proposed", "indicative", "suggested", "not confirmed") and the repository's
   own ("not legal advice"). Where a term has no clean
   equivalent, choose one, use it consistently, and list it in the issue under "Terms that need a
   decision". The glossary in [[glossary]] gives the English definitions.

4. **Build and look.**

   ```sh
   npm run build -- --lang en --lang <code>
   npm run serve
   ```

   Build English too: with one language only there is no root `index.html` and no language
   switcher. Open `http://localhost:8080/<code>/`. Check that nothing overflows at 320px width,
   that the `lang` attribute is right, that the draft notice shows, and that the switcher lists
   both languages.

5. **Run the checks.** `npm run validate && npm test`. The tests build the site and check every page.

6. **Meaning check with users.** Ask speakers of the language to use the site and say what each label
   means to them. Record what was checked, how many people, and what changed, in the translation
   issue. No names. The pack's words: check meaning with users. Until this is done the file stays
   `draft-unreviewed`.

7. **Open a pull request** with the new file. State the meaning-check status honestly in the PR.
   A maintainer changes `_status` to `reviewed` only when the issue records the check.

## Content translation is a later step

UI strings are a few dozen short phrases. Content is 100 issue cards, nine sections and three
appendices, all of which carry legal hedges that must survive translation. Translate content one
issue brief at a time, through the `translation` issue form with scope "One issue brief", and have
each checked with users before it is published. The content pipeline (where translated briefs live
and how the generator picks them up) is to be confirmed; see the open questions in
[[2026-10-12-build-log]].

## Current state

| Language | File | Status |
|----------|------|--------|
| English | `i18n/en.json` | complete |
| Hindi | `i18n/hi.json` | `draft-unreviewed`; in the tree, written with AI assistance; needs a meaning check |
| Marathi | `i18n/mr.json` | `draft-unreviewed`; in the tree, written with AI assistance; needs a meaning check |

Both draft files carry an `_note` saying they have not been reviewed by speakers of the language.
The meaning check (step 6) is the next step for each; until it is recorded, `_status` stays
`draft-unreviewed`.

## Related

- [[glossary]]
- [[decision-log]]
- [[architecture]]
- [[2026-10-12-build-log]]
- `i18n/README.md` (file format and key rules; outside `docs/`, so not a wikilink)
