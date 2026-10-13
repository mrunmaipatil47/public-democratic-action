# Interface strings (`i18n/`)

The site generator separates **chrome** (navigation, labels, headings the site adds,
notices, footer) from **content** (the pack text in `content/pack/` and `data/`). Only the
chrome is translated here. Content stays English in every language build until a reviewed
translation of the pack itself exists; every non-English page shows the `lang.notice` line
in that language and in English.

| File | Status | Role |
|------|--------|------|
| `en.json` | `complete` | Reference. Every key the generator uses lives here; a key missing from any other language file fails the build, which lists every missing key. |
| `hi.json` | `draft-unreviewed` | Hindi draft. Needs review by Hindi speakers. |
| `mr.json` | `draft-unreviewed` | Marathi draft. Needs review by Marathi speakers. |

## File format

- Flat JSON object; keys are dot-separated (`nav.home`, `issue.raise`) and must be
  identical in every file. `tests/site.test.mjs` fails when a file is missing a key, has
  an extra key, or changes the `{placeholders}` of a value.
- Values are plain strings. `{name}` placeholders are substituted at build time
  (`issues.count` uses `{shown}` and `{total}`; `issue.route` uses `{code}` and `{name}`).
  Keep every placeholder; reorder them freely.
- Keys beginning with `_` are metadata, not UI strings:
  - `_language`: the language's name in that language (shown in the language switcher).
  - `_status`: `complete`, `draft-unreviewed` or `reviewed`.
  - `_note`: who produced the strings and what review they still need.
- Do not translate product or licence names (GitHub, MIT, CC BY-SA 4.0), file paths
  (`i18n/`, `tools/import-pack.py`), route codes (A I R H J P V) or issue numbers.

## Adding a language

1. Copy `en.json` to `i18n/<code>.json`, where `<code>` is the BCP 47 language code
   (`ta`, `bn`, `kn`, `pa-Guru`, …). The code becomes the output folder `site/<code>/`
   and the page `lang` attribute, so use a correct code.
2. Set `_language`, set `_status` to `draft-unreviewed` and write an honest `_note`.
3. Translate every value. Keep all keys and all `{placeholders}`.
4. Build and look at the result:

   ```sh
   node scripts/build-site.mjs --lang en --lang <code>
   node scripts/serve.mjs            # http://127.0.0.1:8080/<code>/
   ```

   Each language root is self-contained (its own `assets/`, `data/` and
   `search-index.json`), and the header gains a language switcher as soon as more than one
   language is built.
5. Run `node --test tests/site.test.mjs`. It checks the key set, the placeholders and
   that the built pages carry `<html lang="<code>">` and the pending-translation notice.
6. Ask speakers of the language to review the strings in the built site, not only in the
   JSON, so that length and context are checked. Record the review by changing `_status`
   to `reviewed` and updating `_note`.
7. Open a pull request, or submit the file through the **translation** issue form.

The default build (`npm run build`) is English only. CI and GitHub Pages decide which
languages to publish by passing `--lang` flags.

## Translating content

Translating the pack text is a different task: the pack says to "translate one issue brief
into Marathi, Hindi or another relevant language; check meaning with users" (section 6).
Content translations belong in a translated source document that is imported with
`tools/import-pack.py`, so that the data and the prose stay in step. See
`docs/how-to-add-a-language.md` for the content side.
