---
title: Glossary
type: reference
project: public-democratic-action
tags: [type/reference, project/public-democratic-action]
source: claude-conversation
created: 2026-10-12
updated: 2026-10-12
status: growing
---

# Glossary

The pack's terms, as the pack uses them, with the section they come from. Where this repository adds
a technical term, it says so. Keep to these words in code, data, docs and the site.

## Terms from the pack

**Issue family** (section 1, Appendix A). One of the 100 public-interest issues. A starting agenda
for deliberation, not a nationally validated ranking or a claim that every problem is present
everywhere. Each has a stable three-digit id.

**Issue card** (Appendix A). The entry for one issue family: who can raise it, an indicative owner,
possible lawful changes, evidence to collect and conditional refusal routes.

**Domain** (Appendix A). One of the ten groups of ten issue families, for example "Agriculture,
rural livelihoods and food systems" (071–080). Repository term for the Appendix A headings.

**The four questions** (section 1). Who can raise an issue? Who must answer? What can change? What
happens when power refuses to listen?

**Open intake** (section 2). People can raise concerns through assisted, offline, telephone, postal
and accessible digital channels. No mandatory Aadhaar, smartphone or English proficiency.

**Named responsibility** (section 2). Every case has a verified lead office, relevant co-owners,
applicable rules and an accountable response date.

**Lead office** (section 2). The verified office responsible for answering a case. On the issue
cards the "Answer" is indicative; it becomes a lead office only after human validation.

**Co-owner** (section 2). Another office with a share of the responsibility, recorded alongside the
lead office.

**Reasoned response** (section 2). A response that explains evidence, jurisdiction, proposed action
or refusal, and how to challenge the decision.

**Boilerplate closure** (section 5). A closure without case-specific reasons, evidence or appeal
information. The response is to request them and preserve the challenge.

**Affected-person deliberation** (section 2). Serious systemic issues receive a fair hearing,
including counterarguments and preserved dissent.

**Preserved dissent** (sections 2, 4). Disagreement recorded in the dissenter's words and kept with
the decision, never summarised away.

**Evidence of change** (section 2). Distinguish action promised, action completed and outcome
independently verified. The engine's change ledger uses these three kinds.

**Protection** (section 2). Collect only necessary personal information; obtain consent for
attribution; protect people from exposure and retaliation.

**Rights before popularity** (section 2). Low-volume harms are not discarded because they lack
signatures, followers or media attention.

**Participation route** (section 3). One of three: individual remedy, systemic review, policy or
law. Each has a different expected result.

**Individual remedy** (section 3). Expected result: a lawful case decision, correction or reasoned
refusal and a usable appeal. A public debate must not delay an available individual remedy.

**Systemic review** (section 3). Expected result: evidence gathering, affected-person participation,
alternative designs, a decision and an implementation review.

**Policy or law** (section 3). Expected result: a consultation, explicit tradeoffs, a reasoned
institutional response and the appropriate rule-making or legislative process. A poll does not
create legal authority.

**Process targets** (section 4). Suggested timings: receipt immediately digitally or within two
working days with assistance; routing within seven calendar days; ordinary response within 21
calendar days unless governing law specifies otherwise; systemic admission decision within 30 days;
hearing/decision normally within 60/90 days of admission. These are design targets. Applicable law
and urgent safety procedures take precedence.

**Existing foundations** (section 4). CPGRAMS/state grievance routes where admissible; departmental
and statutory appeals; RTI for existing records; eligible parliamentary petitions; regulators and
rights bodies within their mandates; qualified legal assistance and courts/tribunals under
applicable procedure.

**Proposed additions** (section 4). An accessible cross-channel intake record; verified ownership;
a systemic-issue hearing pathway; public reasons for admission/refusal; implementation evidence;
independent review; and preserved dissent. Proposed, not existing.

**Refusal response** (section 5). What to do when power refuses to listen, for each of seven
situations: silence, wrong office, boilerplate closure, denied entitlement, systemic failure,
retaliation or credible harm, alleged corruption.

**Verified transfer** (section 5). Moving a case to the right office with confirmation that it was
received. Do not call a referral a resolved problem. A transfer never closes a case.

**Protected referral** (section 5). A referral for retaliation or credible harm, made without
exposing the person on a dashboard.

**Vigilance referral** (section 5, route V). Referral to a competent vigilance, anti-corruption,
social-audit or audit process. Allegations are not findings of guilt.

**Challenge route** (Appendix B). One of seven options for challenging a refusal. Options, not a
compulsory ladder. Urgent protection and individual relief must not wait for a public hearing.

**Bounded contribution** (section 6). One task with agreed scope: a technical correction, an
anonymised case example or a review of one issue family. Does not imply coalition membership.

**Contribution form** (section 6). Issue ID; proposed correction/task; evidence link; method;
effort and availability chosen by the contributor; privacy needs; reviewer; expected output;
credit/consent preference.

**Issue brief** (section 9). A one-page brief with a verified owner, relevant procedure, evidence,
counterargument, proposed change and safe challenge route. Template in [[issue-brief-template]].

**Organising record** (section 9). A separately controlled record of explicit consent, scope and
minimum necessary contact details. Not a movement-membership registry.

**Synthetic record** (section 9). An invented case used to test the process before handling
sensitive complaints. The engine accepts nothing else.

## Route codes (Appendix B)

| Code | Route | Meaning and limits |
|------|-------|--------------------|
| A | Administrative review | Relevant service complaint, supervisor, statutory departmental appeal or CPGRAMS/state system where admissible. Check exclusions and deadlines. |
| I | Information / RTI | Existing records through lawful disclosure or RTI for eligible citizens, with appropriate appeals. Information access does not itself enforce a remedy. |
| R | Regulator or specialist redress | Competent regulator, ombudsman or statutory grievance body only within its remit and after applicable prerequisites. |
| H | Rights or protection route | Appropriate commission, protection service or specialist authority, subject to mandate and confidentiality. A recommendation is not necessarily a binding executable order. |
| J | Qualified legal review / competent court or tribunal | Qualified advice, eligible legal aid and proper judicial/tribunal procedure. No guaranteed admission, relief or timing. |
| P | Policy hearing / legislative scrutiny / lawful advocacy | Proposed affected-person hearing, eligible petition, representative scrutiny, consultation or lawful advocacy. Automatic hearings require institutional adoption. |
| V | Vigilance or audit referral | Competent vigilance, anti-corruption, social-audit or audit process. A referral is not a finding of guilt or a guarantee of compensation. |

## Repository terms

**Importer.** `tools/import-pack.py`, which turns the exported Google Doc into `data/` and
`content/pack/`. The only writer of those directories.

**Case.** The engine's record of one synthetic filing. Id starts `SYN-`.

**State.** Where a case is in the lifecycle: received, routed, responded, admission-pending,
admitted, declined, hearing-scheduled, heard, decided, closed. See [[workflow-engine]].

**Event.** One appended entry on a case: `at`, `type`, `actorRole`, `data`. Never a person.

**Actor role.** filer, assistant, intake, lead-office, supervisor, reviewer, hearing-panel,
verifier, system.

**Public summary.** The only publishable view of a case: issue id, participation route, state,
overdue stages, change counts, whether a challenge is preserved. Null for a protected case.

**Draft-unreviewed.** The status of a translation file whose meaning has not yet been checked with
users.

## Related

- [[data-model]]
- [[workflow-engine]]
- [[issue-brief-template]]
- [[invitation-letter]]
