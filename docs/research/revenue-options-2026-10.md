# Revenue options: facts that bear on the choice — 20 Oct 2026

> **Research, not legal, tax or financial advice.** This note gathers published facts the
> owner needs before choosing how BallDoenSai.com earns money. Today the platform earns
> nothing: the sponsor board is free (`docs/sponsor-brand-flow-v1.md`), the BDS Wallet is an
> internal ledger with no money value (`sql/29-bds-wallet-v1.sql`), and team registration
> slips are paid straight to organizers. A Thai lawyer and a Thai accountant must review
> this note before any paid feature ships. Nothing here changed code or the database.

## สรุปภาษาไทย (สำหรับเจ้าของ)

- **ข้อจำกัดของการวิจัยครั้งนี้:** เครือข่ายของ environment บล็อกการเปิดหน้าเว็บทุกแห่ง (pdpc.or.th,
  rd.go.th, bot.or.th, support.google.com, stripe.com, omise.co ฯลฯ ได้ HTTP 403) ข้อมูลทั้งหมดอ่านจาก
  ข้อความที่เครื่องมือค้นหาดึงมาจากหน้าต้นทาง ไม่ได้เปิดหน้าเต็ม ต้องมีคนเปิดลิงก์ตรวจซ้ำก่อนตัดสินใจ
- **โฆษณาแบบ Google AdSense ไม่เหมาะกับเว็บที่ผู้ใช้ส่วนใหญ่เป็นเด็ก:** ต้องติดแท็ก "เด็ก" ซึ่งปิดโฆษณาตามความสนใจ
  และรีมาร์เก็ตติ้ง Google เองไม่ยิงโฆษณาเฉพาะบุคคลให้ผู้ใช้อายุต่ำกว่า 18 รายได้จึงต่ำ และยังเสี่ยงเรื่อง PDPA
- PDPA: ผู้เยาว์คือคนอายุต่ำกว่า 20 ปี อายุไม่เกิน 10 ปีต้องให้ผู้ปกครองยินยอมแทน ยังไม่พบแนวทาง สคส.
  เรื่องการตลาดกับเด็กโดยเฉพาะ (ร่างแนวทางการตลาด ก.ค. 2026 ยังไม่ใช่ฉบับจริง)
- **ช่องทางรับเงิน:** Opn Payments (Omise) ประกาศราคาชัดเจน: บัตร 3.65% พร้อมเพย์ 1.65% (+VAT 7%)
  ถอนเงินเข้าบัญชีครั้งละ 30 บาท มีระบบตัดเงินรายเดือนผ่านบัตร Stripe เปิดให้บริษัทไทยใช้แล้ว แต่ไม่พบ
  อัตราค่าธรรมเนียมไทยจากหน้าทางการ และพร้อมเพย์ตัดเงินอัตโนมัติรายเดือนไม่ได้ ส่วน 2C2P กับ GB Prime Pay ต้องขอใบเสนอราคา
- **ถ้าแพลตฟอร์มรับเงินแทนผู้จัดแข่งแล้วโอนต่อ** อาจเข้าข่ายธุรกิจบริการชำระเงินที่ต้องมีใบอนุญาตจาก ธปท.
  ทางที่ปลอดภัยกว่าคือให้ผู้จัดรับเงินเองต่อไป แล้วบริษัทเก็บค่าบริการแยก หรือใช้ผู้ให้บริการที่มีใบอนุญาตแบบ marketplace
- **ภาษี:** ต้องจด VAT ภายใน 30 วันเมื่อรายรับเกิน 1.8 ล้านบาทต่อปี อัตรา 7% ขยายถึง 30 ก.ย. 2027
  บริษัทที่ยังไม่จด VAT ออก "ใบกำกับภาษี" ไม่ได้ ซึ่งลูกค้าธุรกิจ (ผู้จัด สนาม แบรนด์) มักต้องการ
- **ตัวอย่างราคาซอฟต์แวร์จัดแข่งต่างประเทศ:** Tournify ฟรีถึง 8 ทีม แล้ว €40 ต่อรายการ (ไม่เกิน 60 ทีม);
  Jersey Watch เริ่ม $29/เดือน + 3.5% + $1 ต่อรายการชำระ; ส่วนใหญ่เก็บจากผู้จัด ไม่ใช่จากเด็ก
- **การขายให้เด็ก:** นิติกรรมของผู้เยาว์ที่ไม่ได้รับความยินยอมจากผู้แทนโดยชอบธรรมเป็นโมฆียะ (ป.พ.พ. ม.21)
  สินค้าสำหรับครอบครัว เช่น การ์ดพิมพ์ ควรให้ผู้ปกครองเป็นผู้ซื้อ

## How the sources were verified

Every host returned a proxy policy refusal from this sandbox on 20 Oct 2026 (HTTP 403 on
CONNECT for `pdpc.or.th`, `rd.go.th`, `bot.or.th`, `itmx.co.th`, `ratchakitcha.soc.go.th`,
`etax.rd.go.th`, `support.google.com`, `stripe.com`, `omise.co`, `opn.ooo`, `2c2p.com`,
`gbprimepay.com`). WebFetch failed too. Only the web search tool worked, which returns
extracts of indexed pages. **No page below was opened in full.** Labels follow
`coach-notes-pdpa-2026-10-10.md`, plus one new label:

| Label | Meaning |
| --- | --- |
| **[E]** | Search extract of the page owned by the body that makes the rule or sets the price (Google, Stripe, Opn, Revenue Department, a bank). Page not opened. |
| **[A]** | Researcher's knowledge of the published text, corroborated by an extract (carried over from the PDPA note). |
| **[B]** | Secondary source only (law firm, vendor, review site, press). |
| **[K]** | Researcher's knowledge only. Unverified. |
| **[C]** | Inference by the researcher. Not a legal conclusion. |

All sources were accessed on **2026-10-20**; the numbers in brackets point to the list at the end.

## 1. Advertising and minors

**PDPA.** Consent must be explicit, separate from other matters, freely given and as easy
to withdraw as to give (s. 19). A minor is under 20; under 10 the holder of parental
responsibility consents; 10–19 the guardian also consents unless the act is one the minor
may do alone (s. 20) [A, 1]. A PDPC draft guideline on marketing and direct marketing
(consultation from 7 Jul 2026) covers separating marketing consent from the core service,
opt-out, and safeguards for profiling and online tracking; it is **not final**, and no
child-specific rule was found in summaries of it [B, 10].

**Google.** Tagging a site, or a single ad request, for child-directed treatment turns off
interest-based and remarketing ads for that content [E, 2][E, 3]. On 18 May 2026 Google
announced TFAT, which replaces the child-directed (TFCD) and under-age-of-consent (TFUA)
tags: `CHILD` equals the old tags set to true, and a new `TEEN` value exists; when settings
conflict Google applies the most conservative one [E, 4]. TFUA also blocks requests to
third-party ad vendors such as measurement pixels [E, 5]. Since 2021 Google blocks ad
targeting by age, gender or interests for users under 18 [B, 9]. In apps, the Play
Families Ads Program requires self-certified ad SDKs and ads suitable for all audiences
[E, 6]; child-directed AdMob requests also need max ad rating G [E, 8]; the SDK
self-certification window closed on 31 Oct 2024 [E, 7]. Google says these tags help
compliance but do not relieve the publisher of its legal duties [E, 2]. **No Google page
found quantifies the revenue effect** of child-directed treatment.

**Thai advertising rules.** No Thai statute specific to advertising to children was found;
the Advertising Association of Thailand code (Statement No. 10) bars ads that exploit young
people's lack of knowledge [B, 35].

**Conclusion [C].** Most viewers would have to be tagged `CHILD` or `TEEN`, which removes
the personalised and remarketing demand that pays most display revenue, while cookie or
device-identifier tracking of minors would need guardian consent under s. 19–20. Display
ads would earn little and add PDPA risk on the platform's most sensitive users.

## 2. Payment providers

| Provider | Thai card fee | PromptPay fee | Onboarding | Recurring | Payout |
| --- | --- | --- | --- | --- | --- |
| **Opn Payments (Omise)** | 3.65% + 7% VAT [E, 11] | 1.65% + 7% VAT [E, 11] | Company: DBD certificate (≤ 6 months), Bor.Or.Jor. 3 and 5, IDs of > 25% shareholders and directors, VAT Por.Por. 20 optional; individual: ID + selfie; certified copies, no e-signatures; review up to 15 business days [E, 13] | Card charge schedules via Schedule API [E, 14] | 30 THB per transfer (< 2M THB), next business day [E, 12] |
| **Stripe** | Percentage + 11 THB fixed per charge, percentage not found [B, 20] | Not published in extracts; "cheaper than cards" [E, 17] | Company, partnership, sole proprietor or individual located in Thailand; Thai address [E, 16] | Billing available [E, 15]; PromptPay **cannot** be charged automatically, only via `send_invoice` [E, 17] | Thai accounts: funds 7 business days after payment [E, 18] |
| **2C2P** | Quote only [B, 21] | Quote only [B, 21] | Not found | Recurring Payment Plan + card tokens [E, 21] | Not found |
| **GB Prime Pay** | 3.2% (AMEX 3.5%) per Shopify listing [B, 22] | QR Cash 0.8% [B, 22] | Not found | Not found | Not found |
| **Bank Thai QR (e.g. SCB gateway)** | 3.00% standard tier [E, 23] | Thai QR fee waived **until 31 Dec 2026**, then per BOT notice [E, 23] | Bank merchant account | No | Bank account |

Stripe Connect lets a platform take a fee on each payment; its published US price is $2 per
monthly active account plus 0.25% + 25¢ per payout; Thai prices were not found [E, 19].

**Licensing.** Under the Payment Systems Act B.E. 2560 (in force 16 Apr 2018) [E, 24],
"receiving payments on behalf of sellers or service providers" is a designated service
needing a licence before operation [B, 24]. Whether a platform that collects entry fees and
pays organizers falls inside it was not answered by any source found [C]. Using a licensed
gateway's marketplace product, or leaving the money with organizers and charging the
platform fee separately, avoids holding the funds.

## 3. Thai tax

- An operator whose regular sales of goods or services exceed **1.8 million THB a year**
  must apply for VAT registration within **30 days** of exceeding it [E, 25].
- The 7% rate (statutory 10%) was extended to **30 Sep 2027** by Royal Decree No. 807
  [B, 26].
- Only a VAT registrant issues a full tax invoice, and only that lets a buyer claim input
  VAT; a non-registered company issues an ordinary invoice or receipt [B, 28]. Business
  customers registered for VAT therefore lose input VAT when buying from an unregistered
  company [C]. Voluntary registration below the threshold was reported only by a vendor [B, 25].
- e-Tax Invoice & e-Receipt is **voluntary**. A business with income up to 30 million THB
  may use "e-Tax Invoice by Email" (PDF/A-3 copied to the Revenue Department, time-stamped
  instead of digitally signed); no B2B e-invoicing mandate for 2026–2027 was found [B, 27].

## 4. Comparable pricing and selling to minors

- **Tournify:** free up to 8 teams; €40 per tournament up to 60 teams (includes sponsor
  listings); €120 above 60; a yearly plan for 10+ tournaments [E, 30].
- **Jersey Watch:** from $29/month plus 3.5% + $1 per online payment, which the club may
  pass to families; no setup fee [E, 31].
- **TeamSnap clubs & leagues:** from $599/year, quote-based; 3.25% + $1.50 per transaction
  reported [B, 32]. **LeagueApps:** percentage of registration volume plus setup fee,
  rates unpublished [B, 33].
- **OpenSponsorship** (athlete–brand marketplace): brands pay a subscription and the
  platform takes a commission on the athlete's cash deals [E, 34]; managed campaigns from
  $2,000/month per its blog [E, 34].
- **Minors buying.** A juristic act by a minor without the legal representative's consent
  is voidable (CCC s. 21), except acts in ss. 22–24 (e.g. suited to the minor's
  condition and reasonable needs) [B, 29].

## Options for the owner

| Model | Facts that bear on it |
| --- | --- |
| **Organizer SaaS fee** (per tournament, per team, or subscription) | Comparables charge the organizer, with a free tier (§4). Charging the organizer a separate fee keeps entry money with organizers and avoids the licensing question (§2). Buyers are businesses who will want tax invoices once the company is VAT-registered (§3). Card subscriptions work on Opn and Stripe; PromptPay is one-off only on Stripe (§2). |
| **Platform fee on entry fees** | Collecting on organizers' behalf may need a BOT licence or a licensed marketplace product (§2). Payer is usually a guardian or club, not the child (§4). |
| **Paid sponsorship placements** | Buyer is an adult brand; OpenSponsorship uses subscription + commission (§4). The v1 board shows no athlete data; any fee tied to a minor's profile brings s. 19–20 consent and the "human review with guardian" rule in `sponsor-brand-flow-v1.md` (§1). |
| **Family premium items** (printed cards, certificates) | Guardian should be the buyer (CCC s. 21). PromptPay at 1.65% (Opn) or bank Thai QR is the cheapest rail (§2). Physical goods count towards the 1.8M THB VAT threshold (§3). |
| **Venue booking commission** | Same collect-and-pay-out question as entry fees (§2). Venue owners are businesses wanting tax invoices (§3). |
| **Display ads** | Child/teen tags remove personalised demand; Google gives no revenue figure; tracking minors needs guardian consent (§1). The facts do not support it on athlete-facing pages. |

## Open questions

1. Open each [E] page in a normal browser and confirm the figure, especially Stripe's
   Thai price page and the SCB/BOT Thai QR fee after 31 Dec 2026.
2. Ask a Thai lawyer whether collecting entry or booking fees for organizers or venues
   needs a Payment Systems Act licence.
3. Ask a Thai accountant whether to register for VAT voluntarily before B2B sales start.
4. Check the final PDPC marketing guideline once issued.

## Sources (all accessed 2026-10-20)

1. `docs/research/coach-notes-pdpa-2026-10-10.md` (PDPA ss. 19–20, in-repo)
2. https://support.google.com/adsense/answer/3248194
3. https://support.google.com/admanager/answer/3671211
4. https://support.google.com/adsense/answer/17042704
5. https://support.google.com/adsense/answer/9009582
6. https://support.google.com/googleplay/android-developer/answer/9283445
7. https://support.google.com/googleplay/android-developer/answer/12918983
8. https://support.google.com/admob/answer/6223431
9. https://searchengineland.com/google-ads-will-soon-block-ad-targeting-based-on-age-gender-or-interests-of-people-under-18-351133
10. https://www.tilleke.com/insights/thailand-releases-new-draft-pdpa-guidance-on-lawful-bases-and-marketing/
11. https://www.omise.co/pricing/thailand
12. https://www.omise.co/en/how-much-does-omise-cost/thailand ; https://docs.opn.ooo/dashboard-transfers
13. https://docs.omise.co/how-do-i-enable-live-account/thailand ; https://www.opn.ooo/th-en/faq/onboarding/how-do-i-enable-live-account
14. https://docs.omise.co/charge-schedule-api ; https://docs.omise.co/how-to-do-recurring-payments
15. https://stripe.com/en-in/newsroom/news/thailand
16. https://support.stripe.com/questions/what-information-is-required-to-open-a-stripe-account-in-thailand ; https://stripe.com/th/legal/deutsche-bank
17. https://docs.stripe.com/payments/promptpay ; https://stripe.com/payment-method/promptpay
18. https://support.stripe.com/questions/payout-schedule-and-currency-for-stripe-accounts-in-thailand
19. https://stripe.com/connect/pricing
20. https://www.dhl.com/discover/en-th/e-commerce-advice/e-commerce-best-practice/payment-gateways-for-e-commerce
21. https://developer.2c2p.com/docs/redirect-api-rpp-recurring-payment-plan ; https://us.fitgap.com/products/2c2p
22. https://apps.shopify.com/gbprimepay-checkout
23. https://www.scb.co.th/th/personal-banking/payment/for-merchant/payment-gateway.html
24. https://www.bot.or.th/en/our-roles/payment-systems/payment-act-oversight.html ; https://assets.kpmg.com/content/dam/kpmg/th/pdf/2023/03/legal-news-update-issue-23.pdf
25. https://rd.go.th/7061.html ; https://rd.go.th/46529.html ; https://flowaccount.com/blog/vat-basic-knowledge/
26. https://www.hlbthai.com/cabinet-approves-1-year-extension-of-7-vat-rate-until-30-september-2027/
27. https://forvismazars.com/th/en/insights/doing-business-in-thailand/tax/e-tax-filing-and-documentation-in-thailand
28. https://invoicedataextraction.com/blog/thailand-tax-invoice-requirements
29. https://www.thailawonline.com/thai-civil-code/section-21/
30. https://tournifyapp.com/pricing ; https://help.tournifyapp.com/en/articles/9159084-pay-per-tournament-our-single-use-upgrades
31. https://www.jerseywatch.com/why-jersey-watch
32. https://www.capterra.co.uk/software/123208/teamsnap
33. https://capterra.com/p/127065/LeagueApps/
34. https://help.opensponsorship.com/en/articles/763139-why-does-opensponsorship-take-a-commission-when-i-am-already-a-member-and-pay-a-monthly-subscription-fee ; https://opensponsorship.com/blog/cost-to-partner-with-athletes
35. https://avia.org/wp-content/uploads/2024/11/Thailand-2024-Advertising-Matrix_Final.pdf
