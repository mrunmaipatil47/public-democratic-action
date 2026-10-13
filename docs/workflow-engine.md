---
title: Workflow engine
type: reference
project: public-democratic-action
tags: [type/reference, project/public-democratic-action]
source: claude-conversation
created: 2026-10-12
updated: 2026-10-13
status: growing
---

# Workflow engine

`src/workflow/` is a synthetic case-workflow prototype. It encodes the pack's process targets
(section 4) and refusal responses (section 5) as pure functions over plain objects. Every function
takes a case and returns a new case with one appended event. The input is never modified.

What it is for: testing routing, privacy, failure recovery and harmful automation with synthetic
records, as section 6 asks. What it is not: a grievance portal, an emergency responder, or a source
of enforceable consequences. The engine records, reminds and escalates review. It never invents a
fine, removal, court order or mandatory hearing.

This document is written from the module contract in [[architecture]]. Where it describes
behaviour, check it against the code and `npm run simulate -- all`.

## States

| State | Meaning |
|-------|---------|
| `received` | Created. Receipt may or may not have been issued yet. |
| `routed` | A human has validated the lead office, co-owners, applicable rules and response date. |
| `responded` | A response is on record from the routed stage. Any decision, `interim` included, moves `routed` to `responded`; only an `action` or `refusal` response satisfies the response target and allows closure. |
| `admission-pending` | Systemic review requested; admission decision awaited. |
| `admitted` | Admitted to the systemic hearing pathway. |
| `declined` | Admission declined with reasons. |
| `hearing-scheduled` | Hearing date set. |
| `heard` | Hearing held; evidence, counterarguments, agreement and dissent recorded. |
| `decided` | Decision with reasons recorded. |
| `closed` | Closed for one of four reasons. Never by transfer or referral. |

## Transitions

| Function | From | To | Guard (throws unless) |
|----------|------|----|-----------------------|
| `createCase(params)` | — | `received` | `synthetic: true`; id starts `SYN-`; no personal-data patterns; `issueId` exists in `issues.json`. |
| `issueReceipt(kase, { at })` | any open | unchanged | Once per case. Records the receipt with its due date and whether it was late. |
| `suggestOwner(issueId)` | — | — | Not a transition. Returns the card's indicative owner with `requiresHumanValidation: true`. |
| `routeCase(kase, { at, leadOffice, coOwners, applicableRules, validatedBy })` | `received` or `routed`; after a verified `transfer()` that has not been re-routed yet, any state except `closed` | `routed` from `received` or `routed`; otherwise unchanged (a re-route after a response, or on the systemic path, replaces the owner only) | `validatedBy === 'human'` (`HumanValidationRequiredError`). Sets `owner.responseDueAt`, counted from the original filing on a re-route too. Without a pending verified transfer, routing after a response is refused (`InvalidTransitionError`). The event records `previousLeadOffice` and `afterTransfer`. |
| `respond(kase, { at, decision, evidence, jurisdiction, reasons, challengeRoutes })` | any state except `received` and `closed` | `responded` from `routed` or `responded`, for any decision (`interim` included); unchanged from `admission-pending`, `admitted`, `declined`, `hearing-scheduled`, `heard` and `decided`, where the response is appended to the record only | An owner exists (named responsibility: route first). Appends the response with its `assessResponse()` result. The decision is not consulted for the state change; it matters for closure and for the response target, which only `action` or `refusal` satisfies. |
| `transfer(kase, { at, toOffice, verified, acknowledgedAt })` | any open | unchanged | `verified === true` and `acknowledgedAt` present (`UnverifiedTransferError`). Never closes. |
| `challengeClosure(kase, { at, grounds })` | any with a response, decision, refusal or closure to challenge | reopened to the state before closure, if closed | Preserves the challenge; records `case-specific-reasons-requested`. |
| `recordChange(kase, { at, kind, description, verifier })` | any | unchanged | `kind: 'verified'` needs an independent `verifier` role (`verifier` or `reviewer`). |
| `requestAdmission(kase, { at })` | `received`, `routed` or `responded` | `admission-pending` | Participation route is `systemic-review`. |
| `decideAdmission(kase, { at, admitted, reasons })` | `admission-pending` | `admitted` or `declined` | Reasons required. |
| `scheduleHearing(kase, { at, hearingAt })` | `admitted` | `hearing-scheduled` | |
| `recordHearing(kase, { at, evidence, counterarguments, agreement, dissent })` | `hearing-scheduled` | `heard` | Dissent is copied into `kase.dissent`, never summarised away. |
| `decide(kase, { at, decision, reasons })` | `heard` | `decided` | Reasons required. The decision text may not name an enforcement consequence such as a fine, penalty, court order or mandatory hearing (`NoInventedConsequenceError`); the reasons may, because they record what the panel heard. |
| `markProtected(kase, { at, reason })` | any | unchanged | `reason` is `retaliation` or `credible-harm`. Sets `flags.protected`; records a protected referral. |
| `referToVigilance(kase, { at, body })` | any | unchanged | Records the referral with the note "Allegations are not findings of guilt." |
| `flagUrgent(kase, { at })` | any | unchanged | Records the emergency-services notice. The engine is not a responder. |
| `close(kase, { at, reason })` | `responded`, `decided` or `declined` | `closed` | A reasoned response exists that is not interim or boilerplate (`BoilerplateClosureError`), or, on the systemic route only, the case is `decided` or `declined` (a systemic decision or a reasoned refusal of admission stands in for the response); `reason` is one of `action-completed`, `refused-with-reasons`, `withdrawn-by-filer`, `duplicate`. `action-completed` needs a completed or verified change on the ledger, not only a promise (`PromiseNotRemedyError`, which leads with the section 2 Evidence-of-change rule). `refused-with-reasons` needs a refusal decision or a declined admission. A challenge recorded after the last response, decision or admission decision blocks closure until a new reasoned response addresses it (`BoilerplateClosureError`: preserve the challenge). A reason that reads like an invented consequence (a fine imposed, a court order, a mandatory hearing) is refused before the enum is checked (`NoInventedConsequenceError`). Anything like transfer, referral or forwarding is refused, and so is any closure other than `withdrawn-by-filer` while a verified transfer still awaits `routeCase()` to the receiving office (`ReferralNotResolutionError`, which leads with the section 5 Wrong-office rule). Both are subclasses of `BoilerplateClosureError`; every closure refusal ends with the section 1 sentence on silence, endless transfer, unexplained closure and promises labelled as completed remedies. |
| `onSilence(kase, { now })` | any open state with a stage overdue and no final response (no `action` or `refusal`, decision or admission refusal) | unchanged | Appends `supervisor-notified` and `review-enabled` with `filingTimePreserved: true`, once per overdue stage; returns the case untouched when nothing is newly overdue. Not a read-only helper: it adds events. |

Read-only helpers: `assessResponse(response)`, `deadlines(kase)`, `status(kase, { now })`,
`toPublicSummary(kase, { now })`.

Actor roles on events: `filer`, `assistant`, `intake`, `lead-office`, `supervisor`, `reviewer`,
`hearing-panel`, `verifier`, `system`. No personal identities anywhere.

## Deadlines

Derived from `data/process-targets.json`, which is derived from section 4 of the pack. The pack's
caveat applies to every row: these are design targets. Applicable law and urgent safety procedures
take precedence.

| Stage | Target id | Due | Counted from | Applies to |
|-------|-----------|-----|--------------|------------|
| receipt | `receipt-digital` | same day | received | channel `digital` |
| receipt | `receipt-assisted` | 2 working days | received | channels `assisted`, `offline`, `telephone`, `postal` |
| routing | `routing` | 7 calendar days | received | every case |
| response | `ordinary-response` | 21 calendar days, or `legalDeadlineDays` when governing law specifies otherwise | received | every case |
| admission | `systemic-admission` | 30 calendar days | received | `systemic-review` |
| hearing | `systemic-hearing` | 60 calendar days | admitted | `systemic-review` |
| decision | `systemic-decision` | 90 calendar days | admitted | `systemic-review` |

Working days use `kase.calendar` (`weekendDays`, default Saturday and Sunday, plus `holidays`).
All dates are ISO `YYYY-MM-DD` in UTC. `status(kase, { now })` returns `overdue[]` with
`{ stage, dueAt, daysOverdue }` for each stage past due and not satisfied.

The pack also quotes existing timelines for context, in section 4: "DARPG’s August 2024 grievance
guidelines generally use a 21-day framework with interim explanations where additional time is
needed. RTI ordinarily has a 30-day response rule and a 48-hour life-or-liberty information
provision, subject to the Act. Neither is a universal guarantee of a public hearing or policy
change." The data keeps that sentence in `process-targets.json` as `existingLawReference`; it is
quoted, not asserted, and the engine does not enforce it.

## Refusal responses, mapped to functions

Section 5 of the pack, one row per bullet.

| Situation | The pack's response | Engine |
|-----------|---------------------|--------|
| Silence | Preserve filing time, notify the responsible supervisor and enable review; record overdue status safely. | `status()` reports overdue stages. `status()` and `onSilence()` share one predicate, `isSilent(kase, now)`: the case is open, a stage is overdue and no final response exists (an interim response does not count). While silent, `status()` lists the notify-and-review actions and `onSilence()` appends `supervisor-notified` and `review-enabled` with `filingTimePreserved: true`. Once a final response exists, a stage that is still overdue (a late receipt, a systemic hearing or decision) stays in `overdue[]` with the plain action "Record overdue status safely; a response exists but a process target was missed", and `onSilence()` appends nothing. |
| Wrong office | Coordinate a verified transfer; do not call a referral a resolved problem. | `transfer()` requires `verified: true` and an acknowledgement date. State is unchanged. Until `routeCase()` names the receiving office, `status()` lists "Coordinate a verified transfer" and `close()` refuses every reason except `withdrawn-by-filer`; the re-route works from any open state, including after an interim or final response. `close()` also refuses any transfer-like reason. |
| Boilerplate closure | Request case-specific reasons, evidence and appeal information; preserve the challenge. | `assessResponse()` flags boilerplate (empty or generic reasons, or missing evidence, jurisdiction or challenge routes). `close()` throws on a boilerplate response. `challengeClosure()` preserves the challenge and records `case-specific-reasons-requested`. |
| Denied entitlement | Use the applicable administrative, specialist or legal remedy after checking jurisdiction and deadlines. | A refusal recorded without `evidence`, `jurisdiction` or `challengeRoutes` is accepted by `respond()` but assessed as boilerplate, and `close()` then refuses until a reasoned refusal is on record. Once one is, `status().nextActions` points to the remedy. |
| Systemic failure | Seek a hearing, representative scrutiny, eligible petition or audit review; retain lawful organising outside the platform. | `requestAdmission()`, `decideAdmission()`, `scheduleHearing()`, `recordHearing()`, `decide()`. A declined admission still records reasons and leaves the other routes open. |
| Retaliation or credible harm | Use protected referrals and appropriate rights/legal support; do not expose the person on a dashboard. | `markProtected()` sets `flags.protected` and records a protected referral. `toPublicSummary()` returns `null`. |
| Alleged corruption | Preserve evidence and use competent vigilance/investigation channels. Allegations are not findings of guilt. | `referToVigilance()` records the referral with that note. State is unchanged; nothing is closed. |

Section 3's caveat has its own function: immediate safety threats need appropriate emergency or
protection services. `flagUrgent()` records the notice and sets `flags.urgent`. This project is not
an emergency responder.

The caveat at the end of section 5 is enforced by omission: there is no function that fines,
removes, orders or compels. On top of that, the two texts the process itself produces as an outcome,
`decide().decision` and the `close()` reason, are refused when they read like an invented consequence
(`NoInventedConsequenceError`). The check deliberately stops there: `respond()`, `recordChange()`,
`decideAdmission()`, `decide().reasons` and the optional `close()` note are explanatory records of what an
office, reviewer or panel reports under existing law, where a lawful penalty order or court direction may
truthfully appear. Refusing those would erase true records (principle 7, "preserve, don't erase").

## Privacy guards

From `src/workflow/guards.mjs`.

- `assertSynthetic(kase)`: throws `SyntheticOnlyError` unless `synthetic === true` and the id starts
  with `SYN-`. Called by every function.
- `rejectPersonalData(obj)`: throws `PersonalDataError` on keys such as `name`, `phone`, `mobile`,
  `email`, `aadhaar`, `aadhar`, `uid`, `address`, `dob`, `dateOfBirth`, `voterId`, `epic`, `pan`, their
  common variants (`whatsapp`, `contactNo`, `altPhone`, `tel`, `passportNo`, `rationCardNo`,
  `bankAccount`, `ifsc`, `upiId`) and any key ending in `name` other than a short allow-list of
  things-not-persons (`hostname`, `filename`, `username`, `officeName`, `schemeName` and the like); and
  on values matching a 12-digit number (plain, or grouped 4-4-4 with spaces, dots or hyphens), a
  16-digit number (Aadhaar VID), a 10-digit number starting 6–9 (plain, grouped 5-5, or behind a
  `+91`, `0091` or trunk-`0` prefix), a PAN (`ABCDE1234F`), a voter EPIC (`ABC1234567`), or an email
  address. Separators are matched in place and never collapsed out of the text first, so lists of
  short numbers and adjacent dates do not merge into a false identifier. Called on creation, on every
  params object and on the whole record at every call. The patterns are a heuristic second layer;
  the first is that the engine accepts synthetic records only.
- Owner fields (`leadOffice`, `coOwners`, `toOffice`, `body`) name offices and bodies, never officials.
  The pack's named responsibility is "a verified lead office, relevant co-owners"; a person's name in an
  owner field is personal data even in a synthetic scenario, and the guard cannot detect every name.
- Events carry an `actorRole`, never a person.
- Consent is a field (`consent.attribution`: `anonymous`, `organisation` or `named`) so the record
  shows what was agreed, as section 2 asks: obtain consent for attribution.

## Public summary rules

`toPublicSummary(kase, { now })` is the only publication path.

- Returns `null` when `flags.protected` is true. A protected case disappears from public summaries.
- Otherwise returns exactly: `issueId`, `participationRoute`, `state`, `overdueStages`,
  `changeCounts` (`promised`, `completed`, `verified`), `hasPreservedChallenge`.
- Never free text. Never the case id, owner names, dates, channel or consent.
- Change counts keep the pack's three kinds apart: action promised, action completed, outcome
  independently verified. A promise is never counted as a completed remedy.

## Worked example: ration denial

Participation route `individual-remedy`, Issue 077, Ration access and food-security exclusions.
Section 3's example: a household is denied an existing ration entitlement. The expected result is a
lawful case decision, correction or reasoned refusal and a usable appeal.

To be checked against `npm run simulate -- ration-denial`.

Received 2026-11-03 (a Tuesday) through an `assisted` channel. Deadlines from the table above:

| Stage | Due |
|-------|-----|
| receipt | 2026-11-05 (two working days) |
| routing | 2026-11-10 (seven calendar days) |
| response | 2026-11-24 (21 calendar days; no governing-law override) |

Timeline:

| Date | Event | Actor | What the record shows |
|------|-------|-------|-----------------------|
| 2026-11-03 | `case-created` | assistant | Synthetic case `SYN-0001`, summary begins "SYNTHETIC CASE". Consent: anonymous. No mandatory Aadhaar, smartphone or English proficiency. |
| 2026-11-04 | `receipt-issued` | intake | Within the two-working-day target. |
| 2026-11-05 | note | intake | `suggestOwner('077')`: indicative owner "Food/civil-supplies department; statutory grievance bodies". Owners require current state/sector validation. |
| 2026-11-06 | `case-routed` | intake | `validatedBy: 'human'`. Lead office, one co-owner, applicable rules, `responseDueAt: 2026-11-24`. Within the seven-day target. |
| 2026-11-20 | `response-recorded` | lead-office | `decision: 'action'` with evidence, jurisdiction, case-specific reasons and challenge routes A, R, J. `assessResponse` → not boilerplate. State `responded`. |
| 2026-11-20 | `change-recorded` | lead-office | `kind: 'promised'`: entitlement to be restored. Not yet a remedy. |
| 2026-11-27 | `change-recorded` | lead-office | `kind: 'completed'`: entitlement restored. |
| 2026-12-04 | `change-recorded` | verifier | `kind: 'verified'` by an independent verifier. |
| 2026-12-08 | `case-closed` | lead-office | `reason: 'action-completed'`. Allowed because a non-boilerplate response exists and the ledger records a completed change that was independently verified; a promise alone would be refused (`PromiseNotRemedyError`). |

Status at 2026-12-08: state `closed`, nothing overdue, no next actions.

Public summary: `{ issueId: "077", participationRoute: "individual-remedy", state: "closed",
overdueStages: [], changeCounts: { promised: 1, completed: 1, verified: 1 },
hasPreservedChallenge: false }`.

What would have been refused along the way: routing without `validatedBy: 'human'`; closing after a
response that said only "forwarded for necessary action"; closing with reason "transferred";
recording the verification with the lead office as verifier.

## Scenarios and the CLI

One file per scenario in `src/workflow/scenarios/`, each exporting `{ id, title, run() }`:
`ration-denial`, `authentication-failures`, `portable-voting`, `silence`, `wrong-office`,
`boilerplate-closure`, `retaliation`, `alleged-corruption`. The first three follow section 3's three
routes; the rest exercise section 5.

```sh
npm run simulate -- ration-denial    # one scenario
npm run simulate -- all              # every scenario
node src/cli.mjs list                # scenario ids
node src/cli.mjs issue 077           # one issue card
node src/cli.mjs routes              # Appendix B
node src/cli.mjs org 4               # one organisation
```

To propose a scenario, use the `synthetic-case` issue form.

## Related

- [[architecture]]
- [[data-model]]
- [[glossary]]
- [[decision-log]]
