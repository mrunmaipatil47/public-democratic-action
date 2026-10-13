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
| `routeCase(kase, { at, leadOffice, coOwners, applicableRules, validatedBy })` | `received` or `routed` (re-route after a verified `transfer()`) | `routed` | `validatedBy === 'human'` (`HumanValidationRequiredError`). Sets `owner.responseDueAt`. |
| `respond(kase, { at, decision, evidence, jurisdiction, reasons, challengeRoutes })` | any state except `received` and `closed` | `responded` from `routed` or `responded`, for any decision (`interim` included); unchanged from `admission-pending`, `admitted`, `declined`, `hearing-scheduled`, `heard` and `decided`, where the response is appended to the record only | An owner exists (named responsibility: route first). Appends the response with its `assessResponse()` result. The decision is not consulted for the state change; it matters for closure and for the response target, which only `action` or `refusal` satisfies. |
| `transfer(kase, { at, toOffice, verified, acknowledgedAt })` | any open | unchanged | `verified === true` and `acknowledgedAt` present (`UnverifiedTransferError`). Never closes. |
| `challengeClosure(kase, { at, grounds })` | any with a response, decision, refusal or closure to challenge | reopened to the state before closure, if closed | Preserves the challenge; records `case-specific-reasons-requested`. |
| `recordChange(kase, { at, kind, description, verifier })` | any | unchanged | `kind: 'verified'` needs an independent `verifier` role (`verifier` or `reviewer`). |
| `requestAdmission(kase, { at })` | `received`, `routed` or `responded` | `admission-pending` | Participation route is `systemic-review`. |
| `decideAdmission(kase, { at, admitted, reasons })` | `admission-pending` | `admitted` or `declined` | Reasons required. |
| `scheduleHearing(kase, { at, hearingAt })` | `admitted` | `hearing-scheduled` | |
| `recordHearing(kase, { at, evidence, counterarguments, agreement, dissent })` | `hearing-scheduled` | `heard` | Dissent is copied into `kase.dissent`, never summarised away. |
| `decide(kase, { at, decision, reasons })` | `heard` | `decided` | Reasons required. |
| `markProtected(kase, { at, reason })` | any | unchanged | `reason` is `retaliation` or `credible-harm`. Sets `flags.protected`; records a protected referral. |
| `referToVigilance(kase, { at, body })` | any | unchanged | Records the referral with the note "Allegations are not findings of guilt." |
| `flagUrgent(kase, { at })` | any | unchanged | Records the emergency-services notice. The engine is not a responder. |
| `close(kase, { at, reason })` | `responded`, `decided` or `declined` | `closed` | A response exists and is not interim or boilerplate (`BoilerplateClosureError`); `reason` is one of `action-completed`, `refused-with-reasons`, `withdrawn-by-filer`, `duplicate`. `action-completed` needs a completed or verified change on the ledger, not only a promise. `refused-with-reasons` needs a refusal decision or a declined admission. Anything like transfer, referral or forwarding is refused. |
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

The pack also quotes existing timelines for context: DARPG's August 2024 guidelines generally use a
21-day framework; RTI ordinarily has a 30-day rule and a 48-hour life-or-liberty provision. These
are quoted, not asserted as universal guarantees, and the engine does not enforce them.

## Refusal responses, mapped to functions

Section 5 of the pack, one row per bullet.

| Situation | The pack's response | Engine |
|-----------|---------------------|--------|
| Silence | Preserve filing time, notify the responsible supervisor and enable review; record overdue status safely. | `status()` reports overdue stages. `onSilence()` appends `supervisor-notified` and `review-enabled` with `filingTimePreserved: true` when a stage is overdue and no final response exists (an interim response does not count). |
| Wrong office | Coordinate a verified transfer; do not call a referral a resolved problem. | `transfer()` requires `verified: true` and an acknowledgement date. State is unchanged. `close()` refuses any transfer-like reason. |
| Boilerplate closure | Request case-specific reasons, evidence and appeal information; preserve the challenge. | `assessResponse()` flags boilerplate (empty or generic reasons, or missing evidence, jurisdiction or challenge routes). `close()` throws on a boilerplate response. `challengeClosure()` preserves the challenge and records `case-specific-reasons-requested`. |
| Denied entitlement | Use the applicable administrative, specialist or legal remedy after checking jurisdiction and deadlines. | `respond()` with `decision: 'refusal'` must carry `jurisdiction` and `challengeRoutes`. `status().nextActions` points to the remedy. |
| Systemic failure | Seek a hearing, representative scrutiny, eligible petition or audit review; retain lawful organising outside the platform. | `requestAdmission()`, `decideAdmission()`, `scheduleHearing()`, `recordHearing()`, `decide()`. A declined admission still records reasons and leaves the other routes open. |
| Retaliation or credible harm | Use protected referrals and appropriate rights/legal support; do not expose the person on a dashboard. | `markProtected()` sets `flags.protected` and records a protected referral. `toPublicSummary()` returns `null`. |
| Alleged corruption | Preserve evidence and use competent vigilance/investigation channels. Allegations are not findings of guilt. | `referToVigilance()` records the referral with that note. State is unchanged; nothing is closed. |

Section 3's caveat has its own function: immediate safety threats need appropriate emergency or
protection services. `flagUrgent()` records the notice and sets `flags.urgent`. This project is not
an emergency responder.

The caveat at the end of section 5 is enforced by omission: there is no function that fines,
removes, orders or compels. Any text that reads like an invented consequence is refused.

## Privacy guards

From `src/workflow/guards.mjs`.

- `assertSynthetic(kase)`: throws `SyntheticOnlyError` unless `synthetic === true` and the id starts
  with `SYN-`. Called by every function.
- `rejectPersonalData(obj)`: throws `PersonalDataError` on keys such as `name`, `phone`, `mobile`,
  `email`, `aadhaar`, `aadhar`, `uid`, `address`, `dob`, `dateOfBirth`, `voterId`, `epic`, `pan`, or
  on values matching a 12-digit number, a 10-digit number starting 6–9, or an email address. Called
  on creation and on free-text fields.
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
| 2026-12-08 | `case-closed` | lead-office | `reason: 'action-completed'`. Allowed because a non-boilerplate response exists. |

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
