#!/usr/bin/env python3
"""Import the "Public Voice Between Elections" discussion pack into structured data.

Usage:
    python3 -I tools/import-pack.py content/source/public-voice-between-elections-v0.1.md data content/pack

The input is the Google Doc exported as markdown (the Drive text export). The script is
deterministic: the same input always yields the same JSON and markdown. Re-run it when a new
version of the pack is published, then review the diff.

No network access, no third-party packages. Python 3.11+.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROUTE_CODES = {
    "Administrative review": "A",
    "Information / RTI": "I",
    "Regulator or specialist redress": "R",
    "Rights or protection route": "H",
    "Qualified legal review / competent court or tribunal": "J",
    "Policy hearing / legislative scrutiny / lawful advocacy": "P",
    "Vigilance or audit referral": "V",
}

SECTION_SLUGS = {
    1: "why-this-proposal-exists",
    2: "public-commitments-to-test",
    3: "three-routes",
    4: "existing-foundations-and-proposed-additions",
    5: "when-power-refuses-to-listen",
    6: "a-useful-first-contribution",
    7: "existing-organisations-to-approach",
    8: "a-short-invitation",
    9: "first-organising-cycle",
}


def unescape(s: str) -> str:
    return s.replace("\\.", ".").replace("\\[", "[").replace("\\]", "]")


def slugify(s: str) -> str:
    s = unescape(s).lower()
    s = re.sub(r"[’'`]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def split_list(s: str, sep: str) -> list[str]:
    return [p.strip() for p in s.split(sep) if p.strip()]


def expand_ids(spec: str) -> list[str]:
    """Expand '001–005, 022, 071–080' into zero-padded id strings."""
    out: list[str] = []
    for part in re.split(r",\s*", spec.strip().rstrip(".")):
        part = part.strip()
        if not part:
            continue
        m = re.fullmatch(r"(\d{3})\s*[–-]\s*(\d{3})", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            out.extend(f"{i:03d}" for i in range(a, b + 1))
        else:
            if not re.fullmatch(r"\d{3}", part):
                raise ValueError(f"Unparseable id spec part: {part!r} in {spec!r}")
            out.append(part)
    return out


def take_url(line: str, label: str) -> str:
    m = re.fullmatch(rf"{re.escape(label)}:\s*<([^>]+)>", line.strip())
    if not m:
        raise ValueError(f"Expected '{label}: <url>' but got {line!r}")
    return m.group(1)


def parse(lines: list[str]) -> dict:
    i = 0
    n = len(lines)

    def peek() -> str:
        return lines[i] if i < n else ""

    # ---- front matter (first 5 lines) ----
    title = lines[0].lstrip("# ").strip()
    subtitle = lines[1].lstrip("# ").strip()
    tagline = lines[2].strip()
    draft_line = lines[3].strip()
    disclaimer = lines[4].strip()
    m = re.fullmatch(r"Draft (v[\d.]+) \| (\d{1,2} \w+ \d{4}) \| (.*)", draft_line)
    if not m:
        raise ValueError(f"Unexpected draft line: {draft_line!r}")
    version, date_text, purpose = m.groups()
    i = 5

    # ---- top-level sections ----
    sections: list[dict] = []
    appendices: dict[str, list[str]] = {}
    current: dict | None = None
    while i < n:
        line = lines[i]
        hm = re.fullmatch(r"# (\d)\\\. (.*)", line)
        am = re.fullmatch(r"# Appendix ([ABC])\. (.*)", line)
        if hm:
            current = {"number": int(hm.group(1)), "title": unescape(hm.group(2)).strip(), "lines": []}
            sections.append(current)
        elif am:
            current = {"appendix": am.group(1), "title": unescape(am.group(2)).strip(), "lines": []}
            appendices[am.group(1)] = current["lines"]
            current["_appendix"] = True
            sections.append(current)
        else:
            if current is None:
                raise ValueError(f"Content before first section: {line!r}")
            current["lines"].append(line)
        i += 1

    prose_sections = [s for s in sections if "number" in s]
    app_sections = {s["appendix"]: s for s in sections if "appendix" in s}
    if [s["number"] for s in prose_sections] != list(range(1, 10)):
        raise ValueError("Expected sections 1..9")

    # ---- Section 2: commitments ----
    commitments = []
    s2 = prose_sections[1]
    for line in s2["lines"]:
        if line.startswith("  - "):
            body = line[4:].strip()
            name, _, desc = body.partition(": ")
            commitments.append({"id": slugify(name), "name": name, "description": desc})
    s2_caveat = [l for l in s2["lines"] if not l.startswith("  - ")]

    # ---- Section 3: three routes ----
    routes3 = []
    s3 = prose_sections[2]
    cur = None
    s3_trailer: list[str] = []
    for line in s3["lines"]:
        if line.startswith("## "):
            cur = {"id": slugify(line[3:]), "name": line[3:].strip(), "text": ""}
            routes3.append(cur)
        elif cur is not None and not s3_trailer and not line.startswith("Immediate safety"):
            cur["text"] = (cur["text"] + " " + line.strip()).strip()
        else:
            s3_trailer.append(line.strip())
    for r in routes3:
        em = re.match(r"Example: (.*?)\. The expected result is (.*?)(\. .*)?$", r["text"])
        if em:
            r["example"] = em.group(1)
            r["expectedResult"] = em.group(2).rstrip(".")
            r["note"] = (em.group(3) or "").lstrip(". ").strip() or None

    # ---- Section 4: foundations, targets ----
    s4 = prose_sections[3]
    s4_lines = [l.strip() for l in s4["lines"]]
    targets_line = next(l for l in s4_lines if l.startswith("Suggested process targets:"))

    # ---- Section 5: refusal responses ----
    refusals = []
    s5 = prose_sections[4]
    for line in s5["lines"]:
        if line.startswith("  - "):
            body = line[4:].strip()
            name, _, desc = body.partition(": ")
            refusals.append({"id": slugify(name), "situation": name, "response": desc})
    s5_caveat = [l.strip() for l in s5["lines"] if not l.startswith("  - ")]

    # ---- Section 6: contribution types ----
    contributions = []
    s6 = prose_sections[5]
    for line in s6["lines"]:
        if line.startswith("  - "):
            body = line[4:].strip()
            name, _, desc = body.partition(": ")
            contributions.append({"id": slugify(name), "name": name, "description": desc})
    form_line = next(l.strip() for l in s6["lines"] if l.strip().startswith("A simple contribution form:"))
    fm = re.match(r"A simple contribution form: (.*?)\. (Do not .*)$", form_line)
    form_fields = [f.strip() for f in fm.group(1).split(";")]
    form_caveat = fm.group(2)

    # ---- Section 7: organisations ----
    orgs = []
    s7 = prose_sections[6]
    s7_intro: list[str] = []
    s7_trailer: list[str] = []
    j = 0
    L = s7["lines"]
    while j < len(L) and not L[j].startswith("## "):
        s7_intro.append(L[j].strip())
        j += 1
    while j < len(L):
        line = L[j]
        om = re.fullmatch(r"## (\d{2})\\\. (.*)", line)
        if om:
            org = {"id": f"org-{om.group(1)}", "number": int(om.group(1)), "name": unescape(om.group(2)).strip()}
            rel = L[j + 1].strip()
            agenda = L[j + 2].strip()
            status = L[j + 3].strip()
            ev = L[j + 4].strip()
            route = L[j + 5].strip()
            if not rel.startswith("Documented relevance: "):
                raise ValueError(rel)
            org["documentedRelevance"] = rel[len("Documented relevance: "):]
            agm = re.fullmatch(r"Agenda links: (.*?)\. Suggested remote contribution: (.*)", agenda)
            if not agm:
                raise ValueError(agenda)
            org["agendaLinksText"] = agm.group(1)
            org["agendaIssueIds"] = expand_ids(agm.group(1))
            org["suggestedRemoteContribution"] = agm.group(2)
            if not status.startswith("Status: "):
                raise ValueError(status)
            org["status"] = status[len("Status: "):]
            org["officialEvidenceUrl"] = take_url(ev, "Official evidence")
            org["publicRouteUrl"] = take_url(route, "Public institutional route")
            org["slug"] = slugify(org["name"])
            orgs.append(org)
            j += 6
        else:
            s7_trailer.append(line.strip())
            j += 1

    # ---- Appendix A: issues and domains ----
    A = app_sections["A"]["lines"]
    domains = []
    issues = []
    cur_domain = None
    k = 0
    appendix_a_intro: list[str] = []
    while k < len(A):
        line = A[k]
        dm = re.fullmatch(r"## (\d{3})–(\d{3})\. (.*)", line)
        im = re.fullmatch(r"### (\d{3})\\\. (.*)", line)
        if dm:
            cur_domain = {
                "id": f"d{len(domains) + 1:02d}",
                "slug": slugify(dm.group(3)),
                "name": dm.group(3).strip(),
                "range": [dm.group(1), dm.group(2)],
                "issueIds": [],
            }
            domains.append(cur_domain)
            k += 1
        elif im:
            if cur_domain is None:
                raise ValueError("Issue before domain")
            issue_id = im.group(1)
            issue_title = unescape(im.group(2)).strip()
            l1, l2, l3 = (A[k + 1].strip(), A[k + 2].strip(), A[k + 3].strip())
            m1 = re.fullmatch(r"Raise: (.*?)\. Answer: (.*?)\.?", l1)
            m2 = re.fullmatch(r"Possible change: (.*?)\.?", l2)
            m3 = re.fullmatch(r"Evidence: (.*?)\. Challenge routes: (.*?)\.?", l3)
            if not (m1 and m2 and m3):
                raise ValueError(f"Issue {issue_id} card malformed: {l1!r} {l2!r} {l3!r}")
            route_names = [r.strip() for r in m3.group(2).split(", ")]
            # Route names contain commas only inside slashes; validate each is known.
            codes = []
            for rn in route_names:
                if rn not in ROUTE_CODES:
                    raise ValueError(f"Unknown route {rn!r} in issue {issue_id}")
                codes.append(ROUTE_CODES[rn])
            issue = {
                "id": issue_id,
                "slug": slugify(issue_title),
                "title": issue_title,
                "domainId": cur_domain["id"],
                "raise": split_list(m1.group(1), ", "),
                "answer": split_list(m1.group(2), "; "),
                "possibleChange": m2.group(1),
                "evidence": split_list(m3.group(1), ", "),
                "challengeRoutes": codes,
            }
            issues.append(issue)
            cur_domain["issueIds"].append(issue_id)
            k += 4
        elif line.startswith("## Route key"):
            k += 1
        else:
            appendix_a_intro.append(line.strip())
            k += 1

    # ---- Appendix B: routes ----
    B = app_sections["B"]["lines"]
    routes = []
    b_trailer: list[str] = []
    k = 0
    while k < len(B):
        line = B[k]
        rm = re.fullmatch(r"## ([A-Z]) — (.*)", line)
        if rm:
            code, name = rm.group(1), rm.group(2).strip()
            if ROUTE_CODES.get(name) != code:
                raise ValueError(f"Route code mismatch {code} {name}")
            routes.append({"code": code, "name": name, "slug": slugify(name), "description": B[k + 1].strip()})
            k += 2
        else:
            b_trailer.append(line.strip())
            k += 1

    # ---- Appendix C: sources ----
    C = app_sections["C"]["lines"]
    sources = []
    c_intro: list[str] = []
    c_trailer: list[str] = []
    k = 0
    while k < len(C):
        line = C[k].strip()
        sm = re.fullmatch(r"(\d+)\\\. (.*)", line)
        if sm:
            sources.append({"number": int(sm.group(1)), "title": sm.group(2).strip(), "url": take_url("x: " + C[k + 1].strip(), "x")})
            k += 2
        elif not sources:
            c_intro.append(line)
            k += 1
        else:
            c_trailer.append(line)
            k += 1

    # ---- process targets (structured by hand from the targets sentence, verified against text) ----
    expected_targets_prefix = "Suggested process targets: receipt immediately digitally or within two working days with assistance; routing within seven calendar days; ordinary response within 21 calendar days unless governing law specifies otherwise; systemic admission decision within 30 days; hearing/decision normally within 60/90 days of admission."
    if not targets_line.startswith(expected_targets_prefix):
        raise ValueError("Process targets sentence changed; update the structured targets below.")
    process_targets = {
        "sourceText": targets_line,
        "caveat": "These are design targets. Applicable law and urgent safety procedures take precedence.",
        "targets": [
            {"id": "receipt-digital", "stage": "receipt", "description": "Receipt issued immediately for digital filings", "days": 0, "dayType": "calendar", "from": "received", "appliesTo": ["digital"]},
            {"id": "receipt-assisted", "stage": "receipt", "description": "Receipt issued within two working days when filing is assisted, offline, by telephone or by post", "days": 2, "dayType": "working", "from": "received", "appliesTo": ["assisted", "offline", "telephone", "postal"]},
            {"id": "routing", "stage": "routing", "description": "Verified lead office, co-owners, applicable rules and response date set within seven calendar days", "days": 7, "dayType": "calendar", "from": "received"},
            {"id": "ordinary-response", "stage": "response", "description": "Reasoned response within 21 calendar days unless governing law specifies otherwise", "days": 21, "dayType": "calendar", "from": "received", "overridableByLaw": True},
            {"id": "systemic-admission", "stage": "admission", "description": "Systemic admission decision within 30 days", "days": 30, "dayType": "calendar", "from": "received", "appliesTo": ["systemic-review"]},
            {"id": "systemic-hearing", "stage": "hearing", "description": "Hearing normally within 60 days of admission", "days": 60, "dayType": "calendar", "from": "admitted", "appliesTo": ["systemic-review"]},
            {"id": "systemic-decision", "stage": "decision", "description": "Decision normally within 90 days of admission", "days": 90, "dayType": "calendar", "from": "admitted", "appliesTo": ["systemic-review"]},
        ],
        "existingLawReference": {
            "text": next(l for l in s4_lines if l.startswith("DARPG")),
            "cpgramsDays": 21,
            "rtiDays": 30,
            "rtiLifeOrLibertyHours": 48,
            "note": "Existing statutory and administrative timelines are quoted from the pack's sources, not asserted as universal guarantees.",
        },
    }

    # ---- round-trip fidelity check: rebuild each issue card from structured data ----
    inv = {v: k for k, v in ROUTE_CODES.items()}
    card_lines = [l for l in A if l.startswith("Raise: ") or l.startswith("Possible change: ") or l.startswith("Evidence: ")]
    rebuilt_lines = []
    for it in issues:
        rebuilt_lines.append(f"Raise: {', '.join(it['raise'])}. Answer: {'; '.join(it['answer'])}.")
        rebuilt_lines.append(f"Possible change: {it['possibleChange']}.")
        rebuilt_lines.append(f"Evidence: {', '.join(it['evidence'])}. Challenge routes: {', '.join(inv[c] for c in it['challengeRoutes'])}.")
    if [l.strip() for l in card_lines] != rebuilt_lines:
        for a_, b_ in zip(card_lines, rebuilt_lines):
            if a_.strip() != b_:
                raise ValueError(f"Round-trip mismatch:\n  source: {a_.strip()!r}\n  rebuilt: {b_!r}")
        raise ValueError("Round-trip mismatch in card count")

    pack = {
        "title": title,
        "subtitle": subtitle,
        "tagline": tagline,
        "version": version,
        "dateText": date_text,
        "date": "2026-10-13",
        "purpose": purpose,
        "disclaimer": disclaimer,
        "workingContext": c_trailer[0] if c_trailer else None,
        "aiAssistedNotice": c_trailer[1] if len(c_trailer) > 1 else None,
        "sourceDocument": "https://docs.google.com/document/d/1An_lifVztuO6YpC2VEJX4jfV9z8WT7DjQ2RfXCGYAio/",
        "counts": {"issues": len(issues), "domains": len(domains), "routes": len(routes), "organisations": len(orgs), "sources": len(sources)},
    }

    return {
        "pack": pack,
        "sections": prose_sections,
        "appendix_titles": {k: v["title"] for k, v in app_sections.items()},
        "commitments": {"items": commitments, "caveat": " ".join(s2_caveat).strip()},
        "participationRoutes": {"items": routes3, "caveat": " ".join(s3_trailer).strip()},
        "refusalResponses": {"items": refusals, "caveat": " ".join(s5_caveat).strip()},
        "contributionTypes": {"items": contributions, "form": {"fields": form_fields, "caveat": form_caveat}},
        "organisations": {"selectionBasis": " ".join(s7_intro).strip(), "items": orgs, "additionalNetworkLead": " ".join(s7_trailer).strip()},
        "domains": domains,
        "issues": issues,
        "issuesIntro": " ".join(appendix_a_intro).strip(),
        "routes": {"items": routes, "caveat": " ".join(b_trailer).strip()},
        "sources": {"intro": " ".join(c_intro).strip(), "items": sources},
        "processTargets": process_targets,
    }


def md_to_clean(lines: list[str]) -> str:
    """Each source line is a block. Emit blank lines between blocks so Markdown renderers
    (GitHub, Obsidian) keep paragraphs separate; keep consecutive list items together."""
    out: list[str] = []
    prev_list = False
    for l in lines:
        l = unescape(l).rstrip()
        if not l.strip():
            continue
        is_list = l.startswith("  - ")
        text = "- " + l[4:] if is_list else l
        if out and not (is_list and prev_list):
            out.append("")
        out.append(text)
        prev_list = is_list
    return "\n".join(out).strip() + "\n"


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__)
        return 2
    src, data_dir, content_dir = Path(argv[1]), Path(argv[2]), Path(argv[3])
    lines = [l.rstrip("\n") for l in src.read_text(encoding="utf-8").splitlines()]
    lines = [l for l in lines]
    while lines and not lines[-1].strip():
        lines.pop()
    parsed = parse(lines)
    data_dir.mkdir(parents=True, exist_ok=True)
    content_dir.mkdir(parents=True, exist_ok=True)

    write_json(data_dir / "pack.json", parsed["pack"])
    write_json(data_dir / "issues.json", parsed["issues"])
    write_json(data_dir / "domains.json", parsed["domains"])
    write_json(data_dir / "routes.json", parsed["routes"])
    write_json(data_dir / "organisations.json", parsed["organisations"])
    write_json(data_dir / "commitments.json", parsed["commitments"])
    write_json(data_dir / "participation-routes.json", parsed["participationRoutes"])
    write_json(data_dir / "refusal-responses.json", parsed["refusalResponses"])
    write_json(data_dir / "contribution-types.json", parsed["contributionTypes"])
    write_json(data_dir / "sources.json", parsed["sources"])
    write_json(data_dir / "process-targets.json", parsed["processTargets"])

    pack = parsed["pack"]
    for s in parsed["sections"]:
        num = s["number"]
        slug = SECTION_SLUGS[num]
        fm = (
            "---\n"
            f"title: \"{s['title']}\"\n"
            "type: note\n"
            "project: public-democratic-action\n"
            f"section: {num}\n"
            f"slug: {slug}\n"
            "tags: [type/pack-section, from/google-doc]\n"
            f"source: {pack['sourceDocument']}\n"
            f"source_version: {pack['version']}\n"
            "created: 2026-10-12\n"
            "updated: 2026-10-12\n"
            "status: growing\n"
            "---\n\n"
        )
        body = f"# {num}. {s['title']}\n\n" + md_to_clean(s["lines"])
        (content_dir / f"{num:02d}-{slug}.md").write_text(fm + body, encoding="utf-8")

    c = parsed["pack"]["counts"]
    print(f"Imported {c['issues']} issues, {c['domains']} domains, {c['routes']} routes, {c['organisations']} organisations, {c['sources']} sources; {len(parsed['sections'])} prose sections.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
