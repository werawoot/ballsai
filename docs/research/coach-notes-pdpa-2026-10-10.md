# Coach notes about athletes: what Thailand's PDPA requires (10 Oct 2026)

> **Research, not legal advice.** This note collects what the Personal Data Protection
> Act B.E. 2562 (2019) ("PDPA") and the PDPC's subordinate rules appear to require for a
> feature where a team's coach writes short free-text notes about individual athletes,
> many of them minors and some under 10. It must be reviewed by a Thai lawyer before the
> feature ships to real users. Nothing here has been applied to the database.

Question: a coach writes development/coaching notes about an athlete on their team. What
does the PDPA require (consent and minors, sensitive data, data subject rights, controller
duties, PDPC guidance), and how should BallDoenSai.com design the feature?

## How far the sources could be verified

Every Thai host was unreachable from this environment: the Royal Gazette
(`ratchakitcha.soc.go.th`), the PDPC (`pdpc.or.th`), the Office of the Council of State
(`krisdika.go.th`, `ocs.go.th`) and the university mirrors of the Act all returned a proxy
policy refusal (HTTP 403 on CONNECT) or failed DNS. Only GitHub was reachable, and the one
Thai-law dataset found there (`PyThaiNLP/thai-law`) holds URLs, not text.

So **no statement below was read from the Gazette or the PDPC site in this session.** Each
claim is labelled:

| Label | Meaning |
| --- | --- |
| **[A]** | Section wording as published (Royal Gazette vol. 136, part 69 ก, 27 May 2019; unofficial English translation used by the PDPC/OCS). Quoted from the researcher's knowledge of that text **and** independently corroborated in this session by at least one search extract of the same wording. Still to be checked against the Gazette PDF. |
| **[B]** | Only reached through secondary sources (law firms, universities, vendors), named inline. Used only to locate or corroborate primary text. |
| **[K]** | Section wording from the researcher's knowledge of the published text only; **no** corroborating extract was found in this session. Treat as unverified. |
| **[C]** | Design inference by the researcher. Not a legal conclusion. |

Primary texts to check, in this order, when a machine with access is available:

1. Royal Gazette PDF of the Act: `https://ratchakitcha.soc.go.th/DATA/PDF/2562/A/069/T_0052.PDF`
   (vol. 136, part 69 ก, p. 52, 27 May 2019).
2. PDPC unofficial English translation on `https://www.pdpc.or.th/` (laws page).
3. PDPC Guideline on consent and Guideline on privacy notices, both issued 7 Sep 2022.
4. PDPC Notification on access requests (Section 30), Gazette 16 Jul 2026, in force
   14 Sep 2026.
5. PDPC Notification on erasure/destruction/anonymisation criteria (in force 11 Nov 2024).
6. PDPC Notification on minimum security measures (B.E. 2565 / 2022).

## 1. Consent and minors

**Section 19 – consent form. [A]** Consent must be given before or at the time of
collection; it must be requested "explicitly … in a written statement, or via electronic
means"; the purpose must be stated; and the request must be "clearly distinguishable from
other matters, in an easily accessible and intelligible form … using clear and plain
language, and does not deceive or mislead". Consent must be "freely given", and a service
must not be made conditional on consent to processing "not necessary or relevant" to it.
The data subject "may withdraw his or her consent at any time", and withdrawal "shall be as
easy as giving consent". A request that does not follow these rules "shall not be binding"
(Thai, last paragraph: การขอความยินยอมที่ไม่เป็นไปตามที่กำหนดในหมวดนี้ไม่มีผลผูกพันเจ้าของข้อมูลส่วนบุคคล).
Corroborated: [pdpathailand.com §19](https://pdpathailand.com/pdpa/content_eng/article19_eng.php)
(private site, unofficial translation), [LawPlus notice & consent](https://www.lawplusltd.com/2019/10/data-protection-law-thailand-notice-consent/).

**Section 20 – minors. [A]** Where the data subject is a minor (under 20 and not sui juris
by marriage, Civil and Commercial Code s. 27):

- (1) if giving consent is not an act the minor may do alone under CCC ss. 22, 23 or 24,
  consent of "the holder of parental responsibility" (ผู้ใช้อำนาจปกครอง) is also required;
- (2) if the minor is "below the age of ten years" (Thai: อายุไม่เกินสิบปี, literally
  "not over ten"), consent is requested from the holder of parental responsibility.

The last paragraph applies the same rules "mutatis mutandis" to **withdrawal of consent,
notices, exercise of rights, complaints** and other acts under the Act. So for a child
under 10 the guardian receives the notice and exercises the child's rights; for ages
10–19 the guardian is involved whenever the act is not one the minor may do alone.
Corroborated: [pdpathailand.com §20](https://pdpathailand.com/pdpa/content_eng/article20_eng.php);
Chulalongkorn thesis on minors' consent ([cuir.car.chula.ac.th 81800](https://cuir.car.chula.ac.th/dspace/bitstream/123456789/81800/1/6380067134.pdf)),
which notes the age rule and the CCC ss. 22–24 link are unclear in practice.

The CCC acts a minor may do alone are, in summary **[B]**: acts by which the minor merely
acquires a right or is freed from a duty (s. 22), strictly personal acts (s. 23), and acts
suitable to the minor's condition in life and required for reasonable needs (s. 24). The
PDPC consent guideline (7 Sep 2022) is reported to set out the two age tiers, to require
"easily understandable" language, age verification, identification of the parent, and
records of consent — reached only through [Tilleke & Gibbins](https://www.tilleke.com/insights/thailand-issues-guidelines-on-pdpa-consent-and-notification-requirements/)
and [Securiti](https://securiti.ai/blog/consent-requirements-under-thailands-data-protection-framework). **[B]**

**Section 24 – lawful bases other than consent. [A]** Collection without consent is
allowed where it is: (1) for archives, research or statistics with safeguards; (2) to
prevent a danger to life, body or health; (3) "necessary for the performance of a contract
to which the data subject is a party, or in order to take steps at the request of the data
subject prior to entering into a contract"; (4) a public-interest task or official
authority; (5) "necessary for legitimate interests of the Data Controller or any other
persons … except where such interests are overridden by the fundamental rights of the
data subject"; (6) to comply with a law. Corroborated:
[Nishimura & Asahi](https://www.nishimura.com/en/knowledge/publications/consent-or-exception-which-way-is-better-under-the-thai-personal-data-protection-act).
The PDPC has a draft lawful-basis guideline that asks controllers to document a legitimate
interest assessment ([Tilleke](https://www.tilleke.com/insights/thailand-releases-new-draft-pdpa-guidance-on-lawful-bases-and-marketing/)). **[B]**

Which basis fits coach notes **[C]**:

| Basis | Fit for coach development notes | Minor-specific problem |
| --- | --- | --- |
| Consent (s. 19/20) | Possible, but consent must be freely given and withdrawable at any time; withdrawal would have to delete or stop the notes. | Under 10: guardian must consent. 10–19: guardian consent unless the act is one the minor may do alone, which is unsettled for data consent. |
| Contract (s. 24(3)) | Weak. The coaching is between the team/coach and the family, not a contract with the platform for notes; notes are not *necessary* to perform the platform's terms. | A minor's capacity to contract has the same CCC limits, so it does not avoid the guardian question. |
| Legitimate interest (s. 24(5)) | Most plausible for short, development-only notes inside an existing team relationship, if the content is limited and the athlete/guardian can see and object. | The balancing test weighs more heavily for children; the controller must document it. Objection right (s. 32(1)) applies. |

Practical consequence: legitimate interest only holds if the design keeps the intrusion
small (content limits, visibility to the family, short retention, easy objection). Any
content that is **sensitive data** cannot use s. 24 at all — see section 2.

## 2. Sensitive data (Section 26)

**[A]** Collecting personal data concerning "racial, ethnic origin, political opinions,
cult, religious or philosophical beliefs, sexual behavior, criminal records, **health
data, disability**, trade union information, genetic data, biometric data, or of any
data which may affect the data subject in the same manner" is prohibited **without the
explicit consent** of the data subject (ความยินยอมโดยชัดแจ้ง), except under the listed
exceptions: vital interest where the person cannot consent; legitimate activities of
non-profit political/religious/philosophical/trade-union bodies for their members; data
the subject made public with explicit consent; legal claims; and processing necessary to
comply with a law for specific purposes (preventive/occupational medicine and health care,
public health, employment and social protection, research, substantial public interest),
each with safeguards. Corroborated: [pdpathailand.com §26](https://pdpathailand.com/pdpa/content_eng/article26_eng.php),
[iLaw](https://www.ilaw.or.th/articles/3630), [Mahidol infographic](https://stang.sc.mahidol.ac.th/Lib-Infographic/pdf/sensitive_data.pdf).

So an injury, illness, medication, allergy, mental-health remark, disability or similar
is **health data** under s. 26. None of the exceptions fits a coach's development note
**[C]**: the vital-interest exception needs the person to be unable to consent, and the
law-compliance exception needs a specific law requiring the processing. Recording it would
need explicit consent, and for a child under 10 explicit consent from the guardian
(s. 20 applies to the consent request). "Criminal records" is also listed, so notes about
police matters or offences are equally excluded.

Two further consequences:

- **DPO duty. [K, s. 41]** A controller must appoint a data protection officer where its
  core activity consists of collecting, using or disclosing sensitive data under s. 26.
  A platform that invites coaches to write injury notes about hundreds of thousands of
  minors moves towards that threshold. Not collecting health data keeps it out.
- **Small-business record exemption. [B]** The PDPC's record-of-processing exemptions for
  small enterprises (2022, replaced by 2024 notifications in force 2025) are reported not
  to apply where processing risks the data subject's rights and freedoms or is not
  occasional ([Legal500 / ILAW Asia](https://www.legal500.com/firms/236004-ilawasia-coltd/c-thailand/news-and-developments/key-guidelines-on-ropa-exemptions-for-small-enterprises)).
  Do not count on the exemption.

Design implications for a free-text box **[C]**:

1. Do not offer a health/injury/medical category. Say in the box that injuries, illness,
   medicine and similar must not be written; tell the coach to speak to the guardian
   directly instead.
2. Prefer fixed categories with a short optional text, so the box is not a general diary.
3. Before saving, check the text against a Thai/English word list (for example บาดเจ็บ,
   เจ็บ, ป่วย, ไข้, โรค, ยา, แพ้, หมอ, โรงพยาบาล, ผ่าตัด, กระดูก, เอ็น, ซึมเศร้า, สมาธิสั้น,
   injury, injured, sick, medicine, allergy, asthma, ADHD, hospital, surgery, concussion)
   and ask the coach to remove it. This is a nudge that will miss things, not a guarantee.
4. Give the athlete/guardian a "this note contains health information — remove it" report
   that an admin acts on, and let the coach delete their own note at any time.
5. Never store notes where search engines, previews, notification texts or public
   provenance rows can reach them.

## 3. Data subject rights

| Section | Right [A] | Effect on coach notes [C] |
| --- | --- | --- |
| 30 | Access to and a copy of personal data "relating to him or her", and disclosure of how data obtained without consent was acquired. The controller must comply unless refusal is permitted "by law or pursuant to a court order" and access "would adversely affect the rights and freedoms of others"; it must act within 30 days, and record refusals under s. 39. | A note about an athlete is that athlete's personal data. A guardian (for a minor, via s. 20) can ask for it, and a "private coach-only" note would have to be handed over unless a refusal ground applies. The only obvious ground is third-party data, e.g. a comparison naming another child, which would be redacted, not withheld wholesale. |
| 32 | Objection, including to processing based on s. 24(5); the controller must stop unless it shows "compelling legitimate grounds" or needs it for legal claims. | If notes rely on legitimate interest, the athlete/guardian can object. The product needs a way to stop notes for that athlete. |
| 33 | Erasure, destruction or anonymisation when the data is no longer necessary, consent is withdrawn, an objection succeeds, or processing is unlawful. | Erase notes on request when no ground to keep them remains; there is no legal-retention reason for development notes. |
| 34 | Restriction of use while accuracy is checked, an objection is pending, or data that should be erased is kept at the subject's request. | A disputed note should be hidden from the coach view (not deleted) until resolved. |
| 35 / 36 | The controller keeps data "accurate, up-to-date, complete and not misleading"; the subject may ask for correction, and a refused correction is recorded with reasons (s. 39). | A judgement like "lazy" is hard to keep accurate. The athlete/guardian needs a "this is wrong" request and the coach a way to amend. |

Corroboration: [Mahidol MUIC on s. 30](https://muic.mahidol.ac.th/th/news/siththikaarekhaathuengkh-muulswnbukhkhl-right-to-access-maatraa-30),
[Formichella & Sritawat on s. 32](https://www.legal500.com/developments/thought-leadership/pdpa-thailand-exception-to-rule-of-section-19/),
[LawPlus on accuracy and correction](https://www.lawplusltd.com/wp-content/uploads/kalins-pdf/singles/personal-data-protection-law-of-thailand-accuracy-access-and-correction-of-personal-data.pdf).

**Access Request Notification (2026). [B]** The PDPC published a notification on s. 30
requests in the Gazette on 16 Jul 2026, in force 14 Sep 2026. Reported content: requests
may be made by the data subject, **the person exercising parental power for a minor**, a
custodian, curator or authorised representative; controllers must verify the requester;
offer at least in-person and postal channels (electronic welcome); acknowledge within 15
days and answer within 30 days (extendable by 30); refusals must be documented with
reasons; refusal where disclosure would reveal another person's data is recognised. Sources:
[Baker McKenzie, Aug 2026](https://www.bakermckenzie.com/en/insight/publications/2026/08/thailand-notification-on-data-subject-access-requests),
[Tilleke](https://www.tilleke.com/insights/thailand-issues-new-rules-on-data-subject-access-requests/),
[HLC](https://hlc.com/en/publications/thailand-refines-rules-on-data-subject-access-requests).
Sources disagree on 30 vs 60 days to entry into force; the Gazette text decides.

**Who exercises rights for a minor. [A, s. 20 last paragraph]** The same split as consent:
under 10, the holder of parental responsibility; 10–19, the guardian whenever the act is
not one the minor can do alone. **[C]** For this app that means an **accepted guardian**
(`guardian_links.status = 'accepted'`, `public.is_accepted_guardian_for`) must be able to
see and act on notes, and the athlete aged 10+ should also see them. Whether a guardian
link accepted inside the app is enough proof of "parental responsibility" for the 2026
notification's identity check is an open legal question.

Conclusion **[C]**: "private, coach-only" notes do not create privacy in law. They would
have to be disclosed on request, and each request would be a manual job that grows with
users (AGENTS.md target 4). Making notes visible to the athlete and guardian by default
answers access in the product, removes most manual requests, and makes the
legitimate-interest balance more defensible.

## 4. Controller duties

| Section | Duty (label per row) | Implication [C] |
| --- | --- | --- |
| 21 [K] | Use only for the purpose notified; a new purpose needs notice and consent unless permitted. | Notes are for the athlete's development within the team. Not for scouting, ranking, sponsorship or Hall of Fame, and never shown publicly. |
| 22 [K] | "The collection of Personal Data shall be limited to the extent necessary in relation to the lawful purpose of the Data Controller." | Short, categorised, development-only. Family, financial, contact and other-child details are not necessary. |
| 23 [K] | Before or at collection, inform the subject of the purpose and lawful basis, the data collected and **the retention period** (or the expected period), the categories of recipients, the controller's contact details, and the subject's rights. For a minor under 10 the notice goes to the guardian (s. 20). | A notice to the athlete/guardian when a team coach can first write notes, naming categories, who reads them, retention, and how to object or correct. |
| 37(1) [A] | Appropriate security measures to prevent unauthorised loss, access, use, alteration or disclosure, reviewed when needed, following PDPC minimum standards. The 2022 security notification is reported to require access control, user access management and authentication, and awareness for staff **[B]** ([Tilleke](https://www.tilleke.com/insights/first-set-of-subordinate-regulations-enacted-for-thailands-pdpa/)). | RLS on every row; no anon access; admin reads logged. |
| 37(3) [A] | A system to erase or destroy data when the retention period ends, when the data is irrelevant or beyond the purpose, or on request/withdrawal. The PDPC's erasure criteria notification is in force from 11 Nov 2024 **[B]** ([Tilleke](https://www.tilleke.com/insights/thailand-issues-criteria-for-deletion-destruction-and-de-identification-of-personal-data)). | Retention must be automatic (scheduled delete), not a manual admin task. |
| 37(4) [K] | Notify the Office of a breach within 72 hours unless no risk; notify the subject too when the risk is high. | Notes about minors raise the risk level of any breach. |
| 39 [A] (refusal records, retention) / [K] (full list) | Records of processing: data collected, purpose, controller details, **retention period**, rights and how to exercise them, refused requests with reasons, security measures. | Add a "coach notes" row to the record of processing; log refused access/correction/objection requests. |

The PDPA sets **no fixed retention number** for this kind of data. It requires the
controller to choose a period, tell the subject (s. 23), record it (s. 39) and enforce it
(s. 37(3)). **[K]**

## 5. PDPC guidance specific to children, education or sports

Searched in Thai and English for a PDPC notification or guideline on children's data,
schools, or sports clubs. **None was found.** Because `pdpc.or.th` itself could not be
opened, this is "not found in search results", not a confirmed absence. Related items:

- PDPC Guideline on consent (7 Sep 2022) has a section on minors (two age tiers, age and
  parent verification, record keeping). **[B]**
- PDPC Access Request Notification (2026) names the parental-power holder as a requester. **[B]**
- Search returned Singapore's PDPC advisory guidelines on children's data; that is a
  different country's regulator and does not apply. Academic work in Thailand recommends
  sector guidance for schools because none exists
  ([CNU Journal](https://so19.tci-thaijo.org/index.php/cnujournal/article/view/2639)). **[B]**
- No PDPA guidance from the Sports Authority of Thailand (กกท.) or the Ministry of
  Education on coaching notes was found.

## Recommendation for BallDoenSai.com coach notes [C]

**Who can read a note**

| Reader | Access |
| --- | --- |
| Coach who wrote it | Read, edit, delete own notes, only while the athlete is an accepted member of that coach's team. |
| Other coaches/staff of the team | Not in the first version. |
| Athlete (account owner) | Read all notes about themself by default; request correction; hide/object; request deletion. For under-10s the guardian does this; still show the athlete a read-only view if age-appropriate is agreed with the lawyer. |
| Accepted guardian (`is_accepted_guardian_for`) | Same as the athlete. Gets a notification that a new note exists (title/category only, never the note text in the push/email). |
| Admins | Only to handle a report, correction, objection or access request; every admin read is logged with a reason. |
| Public, scouts, organisers, sponsors | Never. Not in the Player Card, profile, ranking, search, provenance metadata or exports. |

**Visible to athlete and guardian by default.** No secret notes. A coach who needs a
private reminder keeps it off the platform.

**Content allowed** (fixed categories): Technical skill, Tactical understanding, Physical
work (training load/effort in non-medical words: "worked on sprint starts"), Team play and
communication, Goals for next period. Write about observable actions in training or
matches, positive or constructive, about this athlete only.

**Content forbidden** (stated next to the box and in the coach notice):

- Health, injury, illness, medicine, allergies, disability, mental health, body weight or
  appearance (s. 26). Tell the guardian directly instead.
- Discipline, criminal or police matters (s. 26 criminal records), and character labels
  ("lazy", "bad attitude"). Describe the behaviour and the agreed next step instead, if
  needed at all.
- Family, home, money, fees owed, school grades, religion, ethnicity.
- Comparisons with or names of other children (another child's data; would have to be
  redacted on an access request).
- Contact details, addresses, social media handles, photos or links.

**Length and form.** One category (required) plus free text up to **280 characters**
(the existing `team_events.note` cap is 300). A coach may write at most one note per
athlete per category per 7 days, enforced in the database, so notes stay a summary, not a
diary, and a retried save does not create a duplicate (idempotency key on insert). Show a
counter and the forbidden-content reminder; run the health word check before save.

**Retention and deletion.**

- Keep a note for the **current season plus 12 months**, or **12 months after the athlete
  leaves the team**, whichever comes first; then delete automatically (scheduled job,
  no manual step). These numbers are a product proposal for the lawyer to confirm.
- Athlete leaves or is removed from the team: the coach loses access at once; notes stay
  visible to athlete/guardian until the deletion date.
- Athlete or guardian requests deletion or objects: delete (or hide pending a decision),
  log the request.
- Athlete account erasure (`delete_my_athlete_data()`): delete all notes about the athlete
  in the same transaction, not deferred.
- Coach account deleted: delete the coach's notes or keep them under "former coach"
  without the coach's identity — decide before building (affects the foreign key; the
  `coach_attestations` table uses `on delete restrict`).
- Guardian link revoked: that guardian loses access immediately.

**Engineering for national scale (AGENTS.md targets).** Separate table with RLS; index
`(athlete_id, created_at desc)` and `(team_id, coach_id, created_at desc)`; paginated
reads; writes through a `SECURITY DEFINER` RPC with `search_path = ''` that checks accepted
membership, the rate limit and the length in the database; a new numbered SQL file, never
an edit of an applied one; tests with real JWTs for coach, other coach, athlete, guardian,
unrelated user and anon.

**Notice to the coach** (shown once, then a short line under the box):

> TH: บันทึกนี้นักกีฬาและผู้ปกครองของนักกีฬาจะเห็นทุกข้อความ เขียนเฉพาะเรื่องการพัฒนาฝีมือในการฝึกและการแข่ง ห้ามเขียนเรื่องสุขภาพ อาการบาดเจ็บ ยา ความพิการ เรื่องครอบครัว การเงิน คดีความ การเปรียบเทียบกับเด็กคนอื่น หรือข้อมูลติดต่อ เรื่องสุขภาพให้คุยกับผู้ปกครองโดยตรง บันทึกจะถูกลบอัตโนมัติเมื่อครบกำหนดเก็บ
>
> EN: The athlete and their guardian can read every note. Write only about development in
> training and matches. Do not write about health, injuries, medicine, disability, family,
> money, legal matters, comparisons with other children, or contact details. Talk to the
> guardian directly about health. Notes are deleted automatically when the retention period
> ends.

**Notice to the athlete and guardian** (when the athlete joins a team whose coach can write
notes; for under-10s addressed to the guardian):

> TH: โค้ชของทีม [ชื่อทีม] สามารถเขียนบันทึกสั้น ๆ เรื่องการพัฒนาฝีมือของนักกีฬา (ทักษะ แท็กติก การทำงานเป็นทีม เป้าหมาย) เพื่อช่วยการฝึกซ้อม บันทึกนี้อ่านได้เฉพาะโค้ชผู้เขียน นักกีฬา ผู้ปกครองที่ยืนยันแล้ว และผู้ดูแลระบบเมื่อมีคำร้อง ไม่แสดงต่อสาธารณะ เก็บไว้ไม่เกิน [ระยะเวลา] แล้วลบอัตโนมัติ คุณขอดู ขอแก้ไข คัดค้าน หรือขอลบบันทึกได้ที่หน้าโปรไฟล์ หรือติดต่อ [ช่องทางติดต่อผู้ควบคุมข้อมูล]
>
> EN: Your team coach at [team] can write short development notes about the athlete
> (skills, tactics, teamwork, goals) to support training. Only the coach who wrote a note,
> the athlete, a confirmed guardian, and admins handling a request can read them. Notes are
> never public and are deleted automatically after [period]. You can view, correct, object
> to, or delete notes from the profile page, or contact [controller contact].

## Open questions for a Thai lawyer

1. Who is the data controller for a note: BallDoenSai.com, the team/club, or the coach?
   Does the s. 4 personal/household exemption ever cover a volunteer coach? This decides
   who answers requests and who signs the notice.
2. Is legitimate interest (s. 24(5)) acceptable for development notes about children,
   including under-10s, or does the PDPC expect guardian consent? Is the balancing record
   in this note sufficient?
3. Section 20(2) says อายุไม่เกินสิบปี ("not over ten") while the English reads "below ten":
   is a child aged exactly 10 in the guardian-only tier?
4. For ages 10–19, is viewing and objecting to notes an act the minor may do alone
   (CCC ss. 22–24), or must the guardian be involved each time?
5. Is a guardian link accepted inside the app (`guardian_links`) adequate proof of
   "parental responsibility" for consent and for the 2026 Access Request Notification's
   identity check? What verification is "appropriate" at nationwide scale without a manual
   check per family?
6. If a coach writes health data despite the warning, what must the platform do (delete,
   notify, record)? Does incidental receipt count as "collection" requiring explicit consent?
7. Can a coach's honest but negative remark be refused correction under s. 36, and how
   must the refusal be recorded?
8. Are the proposed retention periods (season + 12 months, or 12 months after leaving)
   defensible, and must anything be kept longer (e.g. for safeguarding complaints)?
9. Do the 2024 small-enterprise record-of-processing notifications exempt the operator,
   given minors' data at scale?
10. Does the platform need a DPO under s. 41 if health data is excluded by design?

## Checks before building

- Read the Gazette text of ss. 19–41 and the 2022/2024/2026 PDPC instruments and update
  every **[A]**/**[B]** label above.
- Agree controller role and lawful basis with the lawyer (questions 1–2) before writing SQL.
- Write the data-flow and retention row into the record of processing (s. 39).
