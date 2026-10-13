# Security and privacy

This repository holds a discussion pack, open data, a static site generator and a synthetic
case-workflow prototype. It runs no server and stores no case data. Even so, two things matter:
the code should be safe to run, and no personal data should ever land here.

## Reporting a vulnerability

Please report privately. Do not open a public issue with details.

1. Preferred: use GitHub's private vulnerability reporting on this repository, if it is enabled
   (Security tab, "Report a vulnerability").
2. Otherwise: open a **Private channel request** issue from the issue chooser
   (`.github/ISSUE_TEMPLATE/private-channel.yml`). It asks for nothing but the kind of matter and
   the privacy checkbox. Give no details. The repository owner will reply with a way to send the
   report privately.

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
  and rejects personal-data patterns (identity-number-like and phone-number-like digits, email
  addresses, and keys such as name, phone, address, aadhaar, voterId). Do not weaken these guards.
  Do not point the engine at real data.
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
