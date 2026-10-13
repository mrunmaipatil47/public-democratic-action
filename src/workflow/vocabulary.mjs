/**
 * Sentences from the discussion pack that the engine attaches to records and
 * surfaces as next actions. Keeping them in one place makes every string
 * traceable to the pack (section numbers in comments).
 *
 * @module workflow/vocabulary
 */

/** Pack §5 refusal responses, phrased as short imperatives. */
export const NEXT_ACTIONS = Object.freeze({
  // Silence: preserve filing time, notify the responsible supervisor and enable review; record overdue status safely.
  silenceNotify: 'Notify the responsible supervisor and enable review',
  silenceRecord: 'Record overdue status safely; filing time is preserved',
  // Wrong office: coordinate a verified transfer; do not call a referral a resolved problem.
  wrongOffice: 'Coordinate a verified transfer; a referral is not a resolution',
  // Boilerplate closure: request case-specific reasons, evidence and appeal information; preserve the challenge.
  boilerplate: 'Request case-specific reasons, evidence and appeal information',
  // Denied entitlement: use the applicable administrative, specialist or legal remedy after checking jurisdiction and deadlines.
  deniedEntitlement: 'Use the applicable administrative, specialist or legal remedy after checking jurisdiction and deadlines',
  // Systemic failure: seek a hearing, representative scrutiny, eligible petition or audit review; retain lawful organising outside the platform.
  systemicSeekHearing: 'Seek a hearing, representative scrutiny, eligible petition or audit review; retain lawful organising outside the platform',
  systemicDeclined: 'Seek representative scrutiny, eligible petition or audit review; retain lawful organising outside the platform',
  // Retaliation or credible harm: use protected referrals and appropriate rights/legal support; do not expose the person on a dashboard.
  protectedReferral: 'Use protected referrals and appropriate rights/legal support; do not expose the person on a dashboard',
  // Alleged corruption: preserve evidence and use competent vigilance/investigation channels. Allegations are not findings of guilt.
  vigilance: 'Preserve evidence and use competent vigilance/investigation channels; allegations are not findings of guilt',
  // §3: Immediate safety threats need appropriate emergency or protection services. This project is not an emergency responder.
  urgent: 'Direct immediate safety threats to emergency or protection services; this project is not an emergency responder',
  // §2 Evidence of change / §1 "a promise labelled as a completed remedy".
  verifyChange: 'Verify the outcome independently before treating a promise as a completed remedy',
  // §4 process targets (ordinary process steps, shown when nothing is overdue yet).
  issueReceipt: 'Issue a receipt (immediately for digital filings; within two working days with assistance)',
  setOwner: 'Set a verified lead office, co-owners, applicable rules and an accountable response date',
  reasonedResponse: 'Give a reasoned response: evidence, jurisdiction, proposed action or refusal, and how to challenge it',
});

/** Notes recorded on referrals and events, quoted from the pack. */
export const NOTES = Object.freeze({
  // §5 Alleged corruption
  allegationsNotFindings: 'Allegations are not findings of guilt.',
  // §5 Retaliation or credible harm
  protectedReferral:
    'Use protected referrals and appropriate rights/legal support; do not expose the person on a dashboard.',
  // §3
  notAnEmergencyResponder:
    'Immediate safety threats need appropriate emergency or protection services. This project is not an emergency responder.',
  // §5 Wrong office
  referralNotResolution: 'Do not call a referral a resolved problem.',
  // §5 Silence
  silence: 'Preserve filing time, notify the responsible supervisor and enable review; record overdue status safely.',
  // §5 Boilerplate closure
  preserveChallenge: 'Request case-specific reasons, evidence and appeal information; preserve the challenge.',
  // Appendix A
  ownersNeedValidation: 'Owners require current state/sector validation.',
  // §2 Affected-person deliberation
  preservedDissent: 'Serious systemic issues receive a fair hearing, including counterarguments and preserved dissent.',
  // §3 Policy or law
  pollNotAuthority: 'A poll does not create legal authority.',
  // §4
  designTargets: 'These are design targets. Applicable law and urgent safety procedures take precedence.',
  // §5 closing line
  noInventedConsequence:
    'No automatic fine, removal, court order or mandatory hearing is invented by this proposal.',
});
