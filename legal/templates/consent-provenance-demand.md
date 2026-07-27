<!--
  TEMPLATE: CONSENT PROVENANCE DEMAND — the headline instrument.
  "You allegedly agreed. Prove it." — but drafted for a privacy officer, not a poster.

  AUDIENCE: corporate privacy officer / legal department. This is the letter the whole
  project exists to send. It must be unimpeachably professional. No jokes, no bluster,
  no asserted rights the sender does not hold. Its force comes from precision: it asks
  only for records a diligent controller should possess, and it makes "we do not have
  that record" a written, dated admission.

  MERGE FIELDS:
    {{FULL_NAME}} {{EMAIL}} {{POSTAL_ADDRESS}} {{PHONE}} {{PRIOR_ADDRESSES}}
    {{COMPANY_LEGAL_NAME}} {{COMPANY_ADDRESS}} {{REQUEST_DATE}}
    {{RESPONSE_DEADLINE}}   = per jurisdiction: GDPR one month; CA/state laws 45 days
    {{JURISDICTION}}        = human-readable basis line, e.g. "California" or
                              "the European Union" or "Oregon"
    {{STATE_OF_RESIDENCE}}  {{REFERENCE_ID}}

  CONDITIONAL BLOCKS — generator includes only the blocks matching the user's
  jurisdiction and strips the rest (markers included). At least one MUST be included;
  if none applies, do not generate this letter:
    IF:GDPR        — user is in the EU/EEA/UK, or controller has EU establishment /
                     targets EU residents. (UK: read references as UK GDPR; regulator
                     is the ICO.)
    IF:CALIFORNIA  — user is a California resident.
    IF:OREGON      — Oregon resident.        IF:MINNESOTA — Minnesota resident.
    IF:COLORADO    — Colorado resident.
    IF:OTHER_STATE — resident of another state with a comprehensive privacy law;
                     fields {{STATE_LAW_NAME}} {{STATE_LAW_CITATION}} {{STATE_AG_COMPLAINT_URL}}.

  HONESTY CONSTRAINT (DESIGN.md R2/R6): no US state law imposes a general Art. 7(1)
  demonstrate-consent duty. The letter therefore asserts Art. 7(1) only inside the
  GDPR block, and grounds the US demands in disclosure-of-source/recipient and
  consent-documentation provisions that actually exist. Overclaiming kills the letter.

  STAMP: generator appends legal/DISCLAIMER.md block at the end.
  Citations verified 2026-07-27 — see legal/LEGAL-BASIS.md.
-->

{{FULL_NAME}}
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

<!-- STAMP:DISCLAIMER — generator appends the full block from legal/DISCLAIMER.md below this line -->
