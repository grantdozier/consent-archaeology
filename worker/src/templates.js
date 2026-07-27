// GENERATED FILE — DO NOT EDIT.
//
// Source of truth: legal/templates/*.md and legal/DISCLAIMER.md.
// Regenerate:  node worker/scripts/build-templates.mjs
//
// Editing this file directly will be overwritten on the next build and will
// desync the deployed letters from the reviewed legal text.
//
// Conditional markers <!-- IF:X --> / <!-- ENDIF:X --> survive into these strings
// and are resolved per-request by worker/src/routes/demand.js, because the
// sender's jurisdiction is only known at request time.

/** Merge tokens appearing across all templates. demand.js must supply every one. */
export const TEMPLATE_TOKENS = [
  "ACKNOWLEDGMENT_DEADLINE",
  "COMPANY_ADDRESS",
  "COMPANY_LEGAL_NAME",
  "EMAIL",
  "FULL_NAME",
  "JURISDICTION",
  "PHONE",
  "POSTAL_ADDRESS",
  "PRIOR_ADDRESSES",
  "REFERENCE_ID",
  "REQUEST_DATE",
  "RESPONSE_DEADLINE",
  "STATE_AG_COMPLAINT_URL",
  "STATE_LAW_CITATION",
  "STATE_LAW_NAME",
  "STATE_OF_RESIDENCE"
];

/** Jurisdiction flags usable in IF:/ENDIF: blocks. */
export const JURISDICTION_FLAGS = ['GDPR', 'CALIFORNIA', 'OREGON', 'MINNESOTA', 'COLORADO', 'OTHER_STATE'];

export const DISCLAIMER = `---

## Required notice — read before sending

**This is not legal advice, and we are not your lawyers.** Consent Archaeology is a
self-help document generator operated by Dozier Tech Group. We are not a law firm, we
are not attorneys, and nothing in this document — its text, its citations, or the fact
that it was generated for you — creates an attorney-client relationship with anyone.

**We represent nobody.** Not you, not a class, not a group. This document is sent by
**you, in your own name, on your own behalf**. You are the requester. You sign it. The
company's response, if any, comes to you. Consent Archaeology is not a party to this
request, is not your agent or authorized representative, and does not send, receive,
negotiate, or settle anything for you.

**No outcome is promised.** We do not and cannot guarantee that the recipient will
respond, comply, delete anything, produce anything, or pay anything. We make no
representation about the strength of any claim you may or may not have, and we do not
suggest, estimate, or imply any monetary recovery — of any amount, ever. A statute
giving you the right to ask is not a promise about the answer.

**The law cited here can change, and your rights depend on where you live.** The
statutory citations in this document were verified as of the date shown in
\`legal/LEGAL-BASIS.md\`. Legislatures amend, regulators reinterpret, and courts overrule.
Most of the rights invoked here have residency or jurisdictional requirements; sending a
demand under a statute that does not apply to you may simply be refused. It is your
responsibility to confirm the law applies to your situation before you send this.

**You are responsible for what you send.** The accuracy of the information in this
document — your identity, your addresses, your factual statements — is yours. Knowingly
submitting a false or fraudulent request to a business or a regulator can itself carry
legal consequences.

**If you want legal advice, hire a lawyer.** If any part of this matters enough to
argue about, it matters enough to pay a licensed attorney in your jurisdiction to look
at it. Your evidence file is yours — export it and take it to any firm you choose.`;

export const TEMPLATES = {
  rtk: `{{FULL_NAME}}
{{POSTAL_ADDRESS}}
{{EMAIL}}
{{PHONE}}

{{REQUEST_DATE}}

Privacy Officer / CCPA Compliance
{{COMPANY_LEGAL_NAME}}
{{COMPANY_ADDRESS}}

**Re: Verifiable Consumer Request to Know — Cal. Civ. Code §1798.110
Reference: {{REFERENCE_ID}}**

To the Privacy Officer of {{COMPANY_LEGAL_NAME}}:

I am a California resident. Pursuant to the California Consumer Privacy Act, as
amended by the California Privacy Rights Act, I submit this verifiable consumer
request under **Cal. Civ. Code §1798.110** and direct you to disclose to me:

1. The **categories of personal information** you have collected about me
   (§1798.110(a)(1));
2. The **categories of sources** from which that personal information was collected
   (§1798.110(a)(2));
3. The **business or commercial purpose** for collecting, selling, or sharing that
   personal information (§1798.110(a)(3));
4. The **categories of third parties** to whom you disclose that personal information
   (§1798.110(a)(4)); and
5. The **specific pieces of personal information** you have collected about me
   (§1798.110(a)(5)).

This request covers the 12-month period preceding this request and, for personal
information collected on or after January 1, 2022, the full period of your retention,
as provided by Cal. Civ. Code §1798.130(a)(2)(B). If you contend that providing
information beyond 12 months is impossible or would involve disproportionate effort,
state the basis for that contention in writing.

**Identity and verification.** Identifying details to match your records: name
{{FULL_NAME}}; email {{EMAIL}}; current address {{POSTAL_ADDRESS}}; prior addresses
{{PRIOR_ADDRESSES}}; phone {{PHONE}}. I will respond to reasonable verification
requests consistent with 11 CCR §§7060–7063. Verification may not be used as a basis
to delay the statutory response period (§1798.130(a)(2)(A)), and I am not required to
create an account with you to make this request.

**Deadlines.** You are required to:

- **Confirm receipt of this request within 10 business days** — by
  {{ACKNOWLEDGMENT_DEADLINE}} — and describe your verification and processing steps
  (11 CCR §7021); and
- **Respond substantively within 45 calendar days** of receipt — by
  {{RESPONSE_DEADLINE}} (Cal. Civ. Code §1798.130(a)(2)(A)). Any extension of up to
  45 additional days is available only where reasonably necessary and only if you
  provide me notice and the reason within the first 45 days.

**If you do not respond.** If this request is ignored, denied without a lawful basis,
or answered incompletely, I will file a complaint with the California Privacy
Protection Agency (https://cppa.ca.gov/webapplications/complaint) and the California
Attorney General (https://oag.ca.gov/contact/consumer-complaint-against-business-or-company),
and this request and your response or non-response will be preserved as part of a
dated record.

Please deliver your response in writing to {{EMAIL}} or the postal address above, in a
readily useable, portable format.

I make this request on my own behalf, in my own name. No agent is involved.

Respectfully,

{{FULL_NAME}}
{{REQUEST_DATE}}

---

## Required notice — read before sending

**This is not legal advice, and we are not your lawyers.** Consent Archaeology is a
self-help document generator operated by Dozier Tech Group. We are not a law firm, we
are not attorneys, and nothing in this document — its text, its citations, or the fact
that it was generated for you — creates an attorney-client relationship with anyone.

**We represent nobody.** Not you, not a class, not a group. This document is sent by
**you, in your own name, on your own behalf**. You are the requester. You sign it. The
company's response, if any, comes to you. Consent Archaeology is not a party to this
request, is not your agent or authorized representative, and does not send, receive,
negotiate, or settle anything for you.

**No outcome is promised.** We do not and cannot guarantee that the recipient will
respond, comply, delete anything, produce anything, or pay anything. We make no
representation about the strength of any claim you may or may not have, and we do not
suggest, estimate, or imply any monetary recovery — of any amount, ever. A statute
giving you the right to ask is not a promise about the answer.

**The law cited here can change, and your rights depend on where you live.** The
statutory citations in this document were verified as of the date shown in
\`legal/LEGAL-BASIS.md\`. Legislatures amend, regulators reinterpret, and courts overrule.
Most of the rights invoked here have residency or jurisdictional requirements; sending a
demand under a statute that does not apply to you may simply be refused. It is your
responsibility to confirm the law applies to your situation before you send this.

**You are responsible for what you send.** The accuracy of the information in this
document — your identity, your addresses, your factual statements — is yours. Knowingly
submitting a false or fraudulent request to a business or a regulator can itself carry
legal consequences.

**If you want legal advice, hire a lawyer.** If any part of this matters enough to
argue about, it matters enough to pay a licensed attorney in your jurisdiction to look
at it. Your evidence file is yours — export it and take it to any firm you choose.
`,

  disclosure: `{{FULL_NAME}}
{{POSTAL_ADDRESS}}
{{EMAIL}}
{{PHONE}}

{{REQUEST_DATE}}

Privacy Officer / CCPA Compliance
{{COMPANY_LEGAL_NAME}}
{{COMPANY_ADDRESS}}

**Re: Verifiable Consumer Request — Disclosure of Sale and Sharing of Personal
Information, Cal. Civ. Code §1798.115 — Reference: {{REFERENCE_ID}}**

To the Privacy Officer of {{COMPANY_LEGAL_NAME}}:

I am a California resident. Pursuant to **Cal. Civ. Code §1798.115**, I submit this
verifiable consumer request and direct you to disclose to me:

1. The **categories of personal information** you have collected about me
   (§1798.115(a)(1));
2. The **categories of personal information you have sold or shared** about me, and
   **for each category, the categories of third parties to whom it was sold or
   shared** (§1798.115(a)(2)); and
3. The **categories of personal information you have disclosed about me for a
   business purpose**, and the categories of persons to whom it was disclosed
   (§1798.115(a)(3)).

If you have **not** sold, shared, or disclosed my personal information, §1798.115(a)(2)
requires you to state that fact expressly. A response that omits this statement will be
treated as unresponsive.

**Additional request — named recipients.** Beyond the categorical disclosures the
statute requires, I request that you voluntarily identify the **specific third
parties** to whom my personal information was sold, shared, or disclosed. I note that
equivalent named-recipient disclosure is already a statutory obligation you may carry
to residents of Oregon (ORS 646A.574(1)(a)(B)) and Minnesota (Minn. Stat. §325M.14,
subd. 1(h)); if you maintain that capability for those consumers, I ask that you
extend it to my request. If you decline, state so in writing.

**Downstream notice.** For any third party to whom my personal information was sold or
shared, please state whether that third party was contractually restricted from
further sale, and identify the mechanism by which you communicate opt-out and deletion
obligations downstream.

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

---

## Required notice — read before sending

**This is not legal advice, and we are not your lawyers.** Consent Archaeology is a
self-help document generator operated by Dozier Tech Group. We are not a law firm, we
are not attorneys, and nothing in this document — its text, its citations, or the fact
that it was generated for you — creates an attorney-client relationship with anyone.

**We represent nobody.** Not you, not a class, not a group. This document is sent by
**you, in your own name, on your own behalf**. You are the requester. You sign it. The
company's response, if any, comes to you. Consent Archaeology is not a party to this
request, is not your agent or authorized representative, and does not send, receive,
negotiate, or settle anything for you.

**No outcome is promised.** We do not and cannot guarantee that the recipient will
respond, comply, delete anything, produce anything, or pay anything. We make no
representation about the strength of any claim you may or may not have, and we do not
suggest, estimate, or imply any monetary recovery — of any amount, ever. A statute
giving you the right to ask is not a promise about the answer.

**The law cited here can change, and your rights depend on where you live.** The
statutory citations in this document were verified as of the date shown in
\`legal/LEGAL-BASIS.md\`. Legislatures amend, regulators reinterpret, and courts overrule.
Most of the rights invoked here have residency or jurisdictional requirements; sending a
demand under a statute that does not apply to you may simply be refused. It is your
responsibility to confirm the law applies to your situation before you send this.

**You are responsible for what you send.** The accuracy of the information in this
document — your identity, your addresses, your factual statements — is yours. Knowingly
submitting a false or fraudulent request to a business or a regulator can itself carry
legal consequences.

**If you want legal advice, hire a lawyer.** If any part of this matters enough to
argue about, it matters enough to pay a licensed attorney in your jurisdiction to look
at it. Your evidence file is yours — export it and take it to any firm you choose.
`,

  delete: `{{FULL_NAME}}
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

---

## Required notice — read before sending

**This is not legal advice, and we are not your lawyers.** Consent Archaeology is a
self-help document generator operated by Dozier Tech Group. We are not a law firm, we
are not attorneys, and nothing in this document — its text, its citations, or the fact
that it was generated for you — creates an attorney-client relationship with anyone.

**We represent nobody.** Not you, not a class, not a group. This document is sent by
**you, in your own name, on your own behalf**. You are the requester. You sign it. The
company's response, if any, comes to you. Consent Archaeology is not a party to this
request, is not your agent or authorized representative, and does not send, receive,
negotiate, or settle anything for you.

**No outcome is promised.** We do not and cannot guarantee that the recipient will
respond, comply, delete anything, produce anything, or pay anything. We make no
representation about the strength of any claim you may or may not have, and we do not
suggest, estimate, or imply any monetary recovery — of any amount, ever. A statute
giving you the right to ask is not a promise about the answer.

**The law cited here can change, and your rights depend on where you live.** The
statutory citations in this document were verified as of the date shown in
\`legal/LEGAL-BASIS.md\`. Legislatures amend, regulators reinterpret, and courts overrule.
Most of the rights invoked here have residency or jurisdictional requirements; sending a
demand under a statute that does not apply to you may simply be refused. It is your
responsibility to confirm the law applies to your situation before you send this.

**You are responsible for what you send.** The accuracy of the information in this
document — your identity, your addresses, your factual statements — is yours. Knowingly
submitting a false or fraudulent request to a business or a regulator can itself carry
legal consequences.

**If you want legal advice, hire a lawyer.** If any part of this matters enough to
argue about, it matters enough to pay a licensed attorney in your jurisdiction to look
at it. Your evidence file is yours — export it and take it to any firm you choose.
`,

  provenance: `{{FULL_NAME}}
{{POSTAL_ADDRESS}}
{{EMAIL}}
{{PHONE}}

{{REQUEST_DATE}}

Privacy Officer / Legal Department
{{COMPANY_LEGAL_NAME}}
{{COMPANY_ADDRESS}}

**Re: Demand for Records Demonstrating Consent and Data Provenance
Reference: {{REFERENCE_ID}}**

To the Privacy Officer of {{COMPANY_LEGAL_NAME}}:

I am writing regarding personal data concerning me that {{COMPANY_LEGAL_NAME}} holds,
processes, sells, shares, or has otherwise obtained. I submit this request as a
resident of {{JURISDICTION}}, under the authorities identified below, and I direct it
to a single question your records either answer or do not:

**On what documented basis do you hold my personal data, and can you produce the
record of it?**

## Records demanded

Please produce, in writing, the following records with respect to my personal data:

**1. Date and time of consent.** The date and, where logged, the time at which you
contend I consented to your collection or processing of my personal data. If you
contend that your basis for processing is something other than my consent, identify
that basis with specificity for each category of my personal data you process,
together with the records on which you rely for it.

**2. The exact consent instrument.** The exact text, form, interface, or notice
presented to me at the moment consent was allegedly given — the verbatim language,
a screenshot or archived markup of the interface, and the version identifier and
effective date of the terms of service or privacy notice then in force. A citation to
your current privacy policy is not responsive; the demand is for the instrument as it
existed at the moment of the alleged consent.

**3. Method of identity verification at collection.** The method by which you
verified, at the time of collection, that the person providing the alleged consent
was me — as opposed to another person submitting my information.

**4. Record of receipt, on both sides.** Your record evidencing receipt of the
alleged consent (log entry, database record, or equivalent, with its timestamp), and
any confirmation, receipt, or notice transmitted to me at the time. If no
confirmation was sent to me, state so.

**5. Chain of custody.** If any of my personal data was not collected from me
directly — including data obtained through a merger, acquisition, asset purchase,
data broker, list vendor, affiliate, or any other third party — identify, for each
such acquisition: (a) the source, by name; (b) the date of acquisition; (c) the
contractual instrument under which the data was transferred; and (d) whether records
of my alleged consent were transferred to you along with the data, and if so, produce
them per items 1–4 above.

**If any demanded record does not exist or cannot be located, your response must say
so expressly, in writing, for each item.** Silence, a citation to a current policy,
or a generalized assurance of compliance will be treated as an inability to produce
the record.

## Legal basis

<!-- IF:GDPR -->
**Regulation (EU) 2016/679 (GDPR).** To the extent the GDPR applies to your
processing of my personal data, **Article 7(1)** provides that where processing is
based on consent, *"the controller shall be able to demonstrate that the data subject
has consented."* The burden of demonstrating consent rests on you, not on me. Items
1–4 above request nothing more than the demonstration Article 7(1) already requires
you to be able to make. Further, **Article 15(1)(g)** entitles me, where personal
data has not been collected from me, to *"any available information as to their
source"* — the subject of item 5 — and **Article 15(3)** entitles me to a copy of the
personal data undergoing processing, free of charge. Under **Article 12(3)**, you
must respond within **one month** of receipt; any extension of up to two further
months requires notice to me, with reasons, within the first month. If your basis for
processing is legitimate interest rather than consent, Article 13(1)(d)/14(2)(b)
obliges you to identify the interest, and I hereby request that identification in
writing per item 1.
<!-- ENDIF:GDPR -->

<!-- IF:CALIFORNIA -->
**California Consumer Privacy Act (Cal. Civ. Code §1798.100 et seq.).** As a
California resident, I am entitled under **§1798.110(a)** to the categories of
personal information you have collected about me, the **categories of sources** from
which it was collected, the purposes of collection, and the **specific pieces** of
personal information held — which necessarily includes the consent and acquisition
records described in items 1–5 to the extent they contain my personal information.
Under **§1798.115(a)**, I am entitled to know the categories of my personal
information you have **sold or shared and the categories of third parties** to whom.
Under **§1798.130(a)(2)(A)**, your substantive response is due within **45 calendar
days**; 11 CCR §7021 requires confirmation of receipt within 10 business days. This
request covers the period permitted by §1798.130(a)(2)(B).
<!-- ENDIF:CALIFORNIA -->

<!-- IF:OREGON -->
**Oregon Consumer Privacy Act.** As an Oregon resident, I am entitled under
**ORS 646A.574(1)(a)(B)** to a list of the **specific third parties** — named
entities, not categories — to which you have disclosed my personal data. I invoke
that right here in support of item 5, and additionally request the corresponding
list of specific sources from which my personal data was obtained, to the extent
your records permit. Your response is due within **45 days**, extendable once by 45
days with notice.
<!-- ENDIF:OREGON -->

<!-- IF:MINNESOTA -->
**Minnesota Consumer Data Privacy Act.** As a Minnesota resident, I am entitled
under **Minn. Stat. §325M.14, subd. 1(h)** to *"a list of the specific third parties
to which the controller has disclosed the consumer's personal data."* I invoke that
right here in support of item 5. Your response is due within **45 days**, extendable
once by 45 days with notice.
<!-- ENDIF:MINNESOTA -->

<!-- IF:COLORADO -->
**Colorado Privacy Act (C.R.S. §6-1-1301 et seq.; CPA Rules, 4 CCR 904-3).** As a
Colorado resident, I exercise my access rights under **C.R.S. §6-1-1306(1)(b)**. I
draw your attention to the Colorado Privacy Act Rules, under which controllers are
required to **maintain documentation sufficient to demonstrate compliance with the
consent requirements** for the duration of processing and no fewer than 24 months
thereafter. To the extent you process my sensitive data, or rely on consent for any
processing of my data, the records demanded in items 1–4 are records the Rules
require you to possess. Your response is due within **45 days**, extendable once by
45 days with notice.
<!-- ENDIF:COLORADO -->

<!-- IF:OTHER_STATE -->
**{{STATE_LAW_NAME}} ({{STATE_LAW_CITATION}}).** As a resident of
{{STATE_OF_RESIDENCE}}, I exercise my rights of access and disclosure under
{{STATE_LAW_NAME}}, including the right to confirm whether you process my personal
data and to access it. The records demanded above are requested to the extent they
constitute or contain my personal data or disclosures the statute requires. Your
response is due within **45 days**, extendable once by 45 days with notice.
<!-- ENDIF:OTHER_STATE -->

## Response deadline and escalation

Your response is due no later than **{{RESPONSE_DEADLINE}}**, per the authority cited
above. If I receive no response, an incomplete response, or a response that does not
address each numbered item individually, I will:

<!-- IF:GDPR -->
- Lodge a complaint with the competent supervisory authority under **Article 77
  GDPR** (EU authority directory:
  https://edpb.europa.eu/about-edpb/about-edpb/members_en; for the United Kingdom,
  the Information Commissioner's Office: https://ico.org.uk/make-a-complaint/);
<!-- ENDIF:GDPR -->
<!-- IF:CALIFORNIA -->
- File a complaint with the **California Privacy Protection Agency**
  (https://cppa.ca.gov/webapplications/complaint) and the **California Attorney
  General**
  (https://oag.ca.gov/contact/consumer-complaint-against-business-or-company);
<!-- ENDIF:CALIFORNIA -->
<!-- IF:OREGON -->
- File a complaint with the **Oregon Department of Justice, Consumer Protection**
  (https://www.doj.state.or.us/consumer-protection/);
<!-- ENDIF:OREGON -->
<!-- IF:MINNESOTA -->
- File a complaint with the **Minnesota Attorney General**
  (https://www.ag.state.mn.us/Office/Complaint.asp);
<!-- ENDIF:MINNESOTA -->
<!-- IF:COLORADO -->
- File a complaint with the **Colorado Attorney General**
  (https://coag.gov/file-complaint/);
<!-- ENDIF:COLORADO -->
<!-- IF:OTHER_STATE -->
- File a complaint with the Attorney General of {{STATE_OF_RESIDENCE}}
  ({{STATE_AG_COMPLAINT_URL}});
<!-- ENDIF:OTHER_STATE -->
- Preserve this demand, its delivery record, and your response or non-response as
  part of a dated, tamper-evident record.

I further request that you **preserve** all records described in items 1–5, and all
communications concerning this request, and that you not destroy, purge, or migrate
them in a manner that impairs their availability while this request is pending.

**Identity and verification.** Name {{FULL_NAME}}; email {{EMAIL}}; current address
{{POSTAL_ADDRESS}}; prior addresses {{PRIOR_ADDRESSES}}; phone {{PHONE}}. I will
respond promptly to reasonable, proportionate identity-verification requests.
Verification does not suspend the response deadline stated above.

Please respond in writing to {{EMAIL}} or the postal address above.

I make this demand on my own behalf, in my own name. No agent is involved, and no one
represents me in this matter.

Respectfully,

{{FULL_NAME}}
{{REQUEST_DATE}}

---

## Required notice — read before sending

**This is not legal advice, and we are not your lawyers.** Consent Archaeology is a
self-help document generator operated by Dozier Tech Group. We are not a law firm, we
are not attorneys, and nothing in this document — its text, its citations, or the fact
that it was generated for you — creates an attorney-client relationship with anyone.

**We represent nobody.** Not you, not a class, not a group. This document is sent by
**you, in your own name, on your own behalf**. You are the requester. You sign it. The
company's response, if any, comes to you. Consent Archaeology is not a party to this
request, is not your agent or authorized representative, and does not send, receive,
negotiate, or settle anything for you.

**No outcome is promised.** We do not and cannot guarantee that the recipient will
respond, comply, delete anything, produce anything, or pay anything. We make no
representation about the strength of any claim you may or may not have, and we do not
suggest, estimate, or imply any monetary recovery — of any amount, ever. A statute
giving you the right to ask is not a promise about the answer.

**The law cited here can change, and your rights depend on where you live.** The
statutory citations in this document were verified as of the date shown in
\`legal/LEGAL-BASIS.md\`. Legislatures amend, regulators reinterpret, and courts overrule.
Most of the rights invoked here have residency or jurisdictional requirements; sending a
demand under a statute that does not apply to you may simply be refused. It is your
responsibility to confirm the law applies to your situation before you send this.

**You are responsible for what you send.** The accuracy of the information in this
document — your identity, your addresses, your factual statements — is yours. Knowingly
submitting a false or fraudulent request to a business or a regulator can itself carry
legal consequences.

**If you want legal advice, hire a lawyer.** If any part of this matters enough to
argue about, it matters enough to pay a licensed attorney in your jurisdiction to look
at it. Your evidence file is yours — export it and take it to any firm you choose.
`,

  gdpr: `{{FULL_NAME}}
{{POSTAL_ADDRESS}}
{{EMAIL}}
{{PHONE}}

{{REQUEST_DATE}}

Data Protection Officer / Privacy Office
{{COMPANY_LEGAL_NAME}}
{{COMPANY_ADDRESS}}

**Re: Subject Access Request under Article 15 GDPR — Reference: {{REFERENCE_ID}}**

Dear Data Protection Officer:

I am a data subject located in {{JURISDICTION}}. Pursuant to **Article 15 of
Regulation (EU) 2016/679** (the GDPR), I request confirmation as to whether
{{COMPANY_LEGAL_NAME}} processes personal data concerning me and, where that is the
case, access to that personal data and all of the following:

1. The **purposes** of the processing (Art. 15(1)(a));
2. The **categories** of personal data concerned (Art. 15(1)(b));
3. The **recipients or categories of recipient** to whom the personal data have been
   or will be disclosed — in particular recipients in third countries or
   international organisations (Art. 15(1)(c)); where recipients are identified only
   by category, I ask that you state whether named recipients can be provided and,
   if not, why not;
4. The envisaged **storage period**, or the criteria used to determine it
   (Art. 15(1)(d));
5. Confirmation of my rights to rectification, erasure, restriction, and objection
   (Art. 15(1)(e)) and of my right to lodge a complaint with a supervisory authority
   (Art. 15(1)(f));
6. **Where the personal data were not collected from me: any available information
   as to their source (Art. 15(1)(g)).** I draw particular attention to this item.
   If any of my personal data was obtained from a third party — including a data
   broker, list vendor, corporate affiliate, or through a merger or acquisition —
   please identify the source by name, together with the date and circumstances of
   acquisition, to the full extent of the information available to you. If no
   information as to source is available for any category of my data, state that
   expressly, per category;
7. The existence of any **automated decision-making, including profiling** (Art.
   22(1) and (4)), and meaningful information about the logic involved and the
   envisaged consequences for me (Art. 15(1)(h)); and
8. Where personal data are transferred to a third country, the **appropriate
   safeguards** relied upon (Art. 15(2)).

Please also provide a **copy of the personal data undergoing processing**, free of
charge, as required by **Article 15(3)**, in a commonly used electronic form.

**Basis of processing.** For each category of my personal data, please identify the
legal basis relied upon under Article 6(1). Where the basis is consent, I remind you
that under **Article 7(1)** you must be able to demonstrate that consent; I reserve
the right to request that demonstration.

**Identity and verification.** Identifying details to locate my records: name
{{FULL_NAME}}; email {{EMAIL}}; postal address {{POSTAL_ADDRESS}}; prior addresses
{{PRIOR_ADDRESSES}}; phone {{PHONE}}. If you have reasonable doubts as to my
identity, Article 12(6) permits you to request additional information necessary to
confirm it; I will respond promptly to proportionate requests. Verification requests
do not restart the response period.

**Deadline.** Under **Article 12(3)**, you must provide the requested information
**without undue delay and in any event within one month** of receipt of this request
— by **{{RESPONSE_DEADLINE}}**. That period may be extended by up to two further
months only where necessary, taking into account the complexity and number of
requests, and only if you inform me of the extension and its reasons within the
first month. Under Article 12(5), this information must be provided free of charge.

**If you do not respond.** If I receive no response, a refusal without adequate
grounds, or an incomplete response by the deadline, I will lodge a complaint with
the competent supervisory authority under **Article 77 GDPR** (directory of EU
authorities: https://edpb.europa.eu/about-edpb/about-edpb/members_en; for the United
Kingdom, the Information Commissioner's Office:
https://ico.org.uk/make-a-complaint/), and this request together with your response
or non-response will be preserved as part of a dated record.

Please respond in writing to {{EMAIL}} or the postal address above.

I make this request on my own behalf, in my own name. No agent is involved.

Yours faithfully,

{{FULL_NAME}}
{{REQUEST_DATE}}

---

## Required notice — read before sending

**This is not legal advice, and we are not your lawyers.** Consent Archaeology is a
self-help document generator operated by Dozier Tech Group. We are not a law firm, we
are not attorneys, and nothing in this document — its text, its citations, or the fact
that it was generated for you — creates an attorney-client relationship with anyone.

**We represent nobody.** Not you, not a class, not a group. This document is sent by
**you, in your own name, on your own behalf**. You are the requester. You sign it. The
company's response, if any, comes to you. Consent Archaeology is not a party to this
request, is not your agent or authorized representative, and does not send, receive,
negotiate, or settle anything for you.

**No outcome is promised.** We do not and cannot guarantee that the recipient will
respond, comply, delete anything, produce anything, or pay anything. We make no
representation about the strength of any claim you may or may not have, and we do not
suggest, estimate, or imply any monetary recovery — of any amount, ever. A statute
giving you the right to ask is not a promise about the answer.

**The law cited here can change, and your rights depend on where you live.** The
statutory citations in this document were verified as of the date shown in
\`legal/LEGAL-BASIS.md\`. Legislatures amend, regulators reinterpret, and courts overrule.
Most of the rights invoked here have residency or jurisdictional requirements; sending a
demand under a statute that does not apply to you may simply be refused. It is your
responsibility to confirm the law applies to your situation before you send this.

**You are responsible for what you send.** The accuracy of the information in this
document — your identity, your addresses, your factual statements — is yours. Knowingly
submitting a false or fraudulent request to a business or a regulator can itself carry
legal consequences.

**If you want legal advice, hire a lawyer.** If any part of this matters enough to
argue about, it matters enough to pay a licensed attorney in your jurisdiction to look
at it. Your evidence file is yours — export it and take it to any firm you choose.
`,
};
