# Security and privacy

This repository holds a discussion pack, open data, a static site generator and a synthetic
case-workflow prototype. It runs no server and stores no case data. Even so, two things matter:
the code should be safe to run, and no personal data should ever land here.

## Reporting a vulnerability

Please report privately. Do not open a public issue with details.

1. Preferred: use GitHub's private vulnerability reporting on this repository, if it is enabled
   (Security tab, "Report a vulnerability").
2. Otherwise: open a **Private channel request** issue from the issue chooser
   (`.github/ISSUE_TEMPLATE/private-channel.yml`). It asks for nothing but the privacy checkbox and
   an optional kind of matter. Give no details. The repository owner will reply with a way to send
   the report privately.

Opening a Private channel request is itself public: anyone can see that your account asked for a
private channel, and the kind of matter if you chose one. If that visibility is a risk for you (for
example, a conduct report about someone who watches this repository), leave the kind blank, use the
private vulnerability form if it is enabled, or contact the repository owner through the links on
their GitHub profile. Every request gets the same reply at the same speed whether or not you say
what kind of matter it is. Until a dedicated contact is published, these are the routes there are;
see open question 7 in `docs/log/2026-10-12-build-log.md`.

Include: what you found, how to reproduce it, which files or commands are involved, and what you
think the impact is. You will get an acknowledgement, and a fix or an explanation. There is no bug
bounty. Credit is given if you want it; say so in the report.

Things in scope: the scripts under `scripts/` and `src/`, the importer in `tools/`, the generated
site in `site/`, the GitHub Actions workflows, and anything that could cause personal data to be
accepted, stored or published.

## Privacy rules

These follow the pack. Section 2: collect only necessary personal information; obtain consent for
attribution; protect people from exposure and retaliation. Section 9: this discussion pack contains
no private complainant data.

- No PII in issues, pull requests, discussions or commit messages. No names, phone numbers, email
  addresses, identity numbers, addresses, dates of birth, or case numbers of real people.
- No real cases. Do not describe a real complaint in enough detail to identify a household, even
  anonymised. Use a synthetic scenario instead.
- No personal activist contact details. The pack uses institutional public routes only.
- The workflow engine is synthetic-only. It refuses any record that is not marked `synthetic: true`
  and rejects personal-data patterns: 12-digit identity-number-like and 16-digit VID-like numbers,
  plain or grouped with spaces, dots or hyphens; 10-digit mobile-like numbers starting 6–9, plain,
  grouped 5-5 or behind `+91`, `0091` or a trunk `0`; PAN-like and voter-EPIC-like codes; email
  addresses; and keys such as name, phone, mobile, email, address, aadhaar, voterId, pan, their
  common variants and any key ending in "name" that does not name a thing. `npm run validate`
  checks the same patterns (plus `mailto:` and `tel:` links) over `data/` and `content/pack/`. Do
  not weaken these guards. Do not point the engine at real data.
- Owners are offices, never officials. Lead offices, co-owners, receiving offices and vigilance
  bodies are named as institutions; a person's name in an owner field is personal data even in a
  synthetic scenario, and the pattern guard cannot catch every name. Synthetic scenarios invent
  wards, offices and records, never persons.
- Published summaries never carry free text or traceable ids. A protected case is not published at
  all.

## If someone posts personal data by accident

Tell a maintainer straight away through the private route above. Do not quote the data when you do.

Maintainers will:

1. Delete or edit the issue, comment or file to remove the data.
2. Purge it from history where possible. For git history this means rewriting the affected commits
   and force-pushing; GitHub support may be asked to clear cached views. For issues and comments,
   GitHub's edit history is cleared through the delete-revision option.
3. Tell the person who posted it what was removed, without re-posting it.
4. Record the incident in the maintainers' log without the data itself.

If the data concerns you and you want it removed, the same route applies. You do not have to
explain why.

## Supported versions

Only the current default branch is maintained. Generated output in `site/` and `exports/` is
rebuilt from source and is not patched independently.
