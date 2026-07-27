<!--
  TEMPLATE: CCPA Request to Delete — Cal. Civ. Code §1798.105
  AUDIENCE: corporate privacy officer. Professional and firm. No jokes here.
  APPLIES TO: California residents only. Do not generate for non-CA users.
  MERGE FIELDS:
    {{FULL_NAME}} {{EMAIL}} {{POSTAL_ADDRESS}} {{PHONE}} {{PRIOR_ADDRESSES}}
    {{COMPANY_LEGAL_NAME}} {{COMPANY_ADDRESS}} {{REQUEST_DATE}}
    {{ACKNOWLEDGMENT_DEADLINE}}  = REQUEST_DATE + 10 business days
    {{RESPONSE_DEADLINE}}        = REQUEST_DATE + 45 calendar days
    {{REFERENCE_ID}}
  CONDITIONAL BLOCK: lines between "IF:DATA_BROKER" and "ENDIF:DATA_BROKER" comment
  markers are included only when the recipient appears on the CPPA data broker
  registry (worker/src/brokers.js carries the flag); otherwise the generator strips
  the block, markers included.
  R2 COMPLIANCE: this letter uses "delete" because §1798.105 uses "delete" — quoting
  the statutory verb in a demand TO a company is not a claim WE delete anything.
  STAMP: generator appends legal/DISCLAIMER.md block at the end.
  Citations verified 2026-07-27 — see legal/LEGAL-BASIS.md.
-->

{{FULL_NAME}}
{{POSTAL_ADDRESS}}
{{EMAIL}}
{{PHONE}}

{{REQUEST_DATE}}

Privacy Officer / CCPA Compliance
{{COMPANY_LEGAL_NAME}}
{{COMPANY_ADDRESS}}

**Re: Verifiable Consumer Request to Delete — Cal. Civ. Code §1798.105
Reference: {{REFERENCE_ID}}**

To the Privacy Officer of {{COMPANY_LEGAL_NAME}}:

I am a California resident. Pursuant to **Cal. Civ. Code §1798.105**, I hereby direct
{{COMPANY_LEGAL_NAME}} to **delete all personal information you have collected about
me**, from all systems, backups subject to your retention schedule, and derived
records, except only to the extent a specific statutory exception under §1798.105(d)
applies.

I further direct you, as §1798.105(c) requires, to **notify all service providers,
contractors, and third parties** to whom you have sold, shared, or disclosed my
personal information that they are likewise required to delete it, unless an
enumerated exception applies.

**If you claim an exception, itemize it.** If you retain any of my personal
information in reliance on §1798.105(d), your response must identify, in writing:
(a) each category of information retained; (b) the specific statutory exception
claimed for it; and (c) the retention period you assert. A generalized assertion that
"some data may be retained as required by law" is not a compliant response.

**Confirmation.** Please provide written confirmation that deletion has been carried
out, including confirmation that the §1798.105(c) notice was transmitted to your
service providers, contractors, and third-party recipients.

<!-- IF:DATA_BROKER -->
**Notice — Delete Act obligations.** {{COMPANY_LEGAL_NAME}} appears on the California
Privacy Protection Agency's data broker registry and is therefore subject to the
Delete Act, Cal. Civ. Code §1798.99.80 et seq. Beginning **August 1, 2026**, you are
required to access the CPPA's Deletion Request and Opt-out Platform (DROP) at least
once every 45 days and to process verified consumer deletion requests submitted
there, with penalties of $200 per deletion request per day of noncompliance. This
letter is independent of, and in addition to, any deletion request directed to you
through DROP; compliance with one does not excuse the other.
<!-- ENDIF:DATA_BROKER -->

**Identity and verification.** Name {{FULL_NAME}}; email {{EMAIL}}; current address
{{POSTAL_ADDRESS}}; prior addresses {{PRIOR_ADDRESSES}}; phone {{PHONE}}. I will
respond to reasonable verification requests consistent with 11 CCR §§7060–7063.
Verification does not extend the statutory response period (§1798.130(a)(2)(A)).

**Deadlines.** You are required to confirm receipt within **10 business days** — by
{{ACKNOWLEDGMENT_DEADLINE}} (11 CCR §7021) — and to respond substantively within
**45 calendar days** — by {{RESPONSE_DEADLINE}} (Cal. Civ. Code §1798.130(a)(2)(A)).
An extension of up to 45 additional days is available only with notice to me,
including the reason, within the first 45 days.

**If you do not respond.** Failure to respond, an incomplete response, or an
unsupported denial will result in a complaint to the California Privacy Protection
Agency (https://cppa.ca.gov/webapplications/complaint) and the California Attorney
General (https://oag.ca.gov/contact/consumer-complaint-against-business-or-company).
This request and your response or non-response are preserved as part of a dated record.

Please respond in writing to {{EMAIL}} or the postal address above.

I make this request on my own behalf, in my own name. No agent is involved.

Respectfully,

{{FULL_NAME}}
{{REQUEST_DATE}}

<!-- STAMP:DISCLAIMER — generator appends the full block from legal/DISCLAIMER.md below this line -->
