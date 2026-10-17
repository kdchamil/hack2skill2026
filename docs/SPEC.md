# Five Seconds — Product Requirements Specification

Oct 16, 2026 · @Chamil Jeewantha

## 1. Executive summary

Five Seconds is a camera-first AI shopping companion. It turns any food, cosmetic or personal-care pack into a spoken, visual, evidence-graded answer in about five seconds, in the shopper's own language. It does not hand out a single opaque score. Instead it explains *why*, says *how sure it is*, and suggests *what to do next*, for the shopper and for every member of their household.

**Problem.** Labels across Asia-Pacific are dense, multilingual, often imported, and written for regulators rather than shoppers. Existing scanner apps rely on barcode databases that are thin outside Europe and North America, give one verdict per product, and cannot read a pack they have never seen.

**Solution.** Gemini multimodal models read the pack itself (front, back, ingredient list, dates, batch code), whether or not a barcode match exists. They then fuse that reading with open product, recall and regulatory datasets. Every finding is labelled **Verified**, **Label-stated**, **Inferred** or **Unknown**.

**Why it matters.** It helps households managing allergies, diets or skin concerns, along with low-literacy and older shoppers and carers buying for others. Better information at the shelf is one of the cheapest public-health levers available.

### Competition alignment (AI Builder Cup 2026)

| Requirement (public listings) | How Five Seconds meets it |
| --- | --- |
| Working AI prototype addressing a real-world problem | Scan → explain → listen for food, deployed live (17 Oct cut); cosmetics, recalls and the diary at the 4 Dec finale |
| Built and deployed on Google Cloud | Cloud Run, Firebase Hosting, Vertex AI (Gemini) orchestrated with ADK, Gemini-TTS via Cloud Text-to-Speech. Firestore holds consent records only (finale). No Cloud Storage: photos are never stored. |
| JAPAC relevance | Reads labels in any script; speaks English, Sinhala and Tamil at the cut and 7 languages at MVP; reporting routes per JAPAC market |
| Prize: Best use of Google Cloud AI tools | An ADK agent using Gemini vision, structured output and tool calls; Gemini-TTS; grounding with Google Search for evidence discovery |
| Prize: Most impactful solution | Allergen safety, household verdicts, claims honesty and a packaging signal; recall checks and a product-use diary at the finale |

### Judging criteria and where this spec answers them

Our track is **Sustainability & Social Impact**. Weights are from a public listing of the official rubric.

| Criterion (weight) | Where Five Seconds answers it |
| --- | --- |
| Technical Merit & Gen AI Implementation (40%) | Section 6.0 shows exactly where AI is needed and where plain code is cheaper. ADK orchestrates the scan (Section 9). A rules-only baseline measures the AI uplift (Section 12). |
| Problem Alignment & Impact (25%) | Allergen safety for households, voice in Sinhala and Tamil for low-literacy shoppers, packaging and recycling codes (US-22), consumer reporting (E12) |
| Innovation & Creativity (25%) | Label-first reading, per-member verdicts computed on the phone, evidence tiers, product-use diary (Section 5) |
| User Experience & Solution Design (10%) | Six glance cards, one-tap Listen, WCAG 2.2 AA (Section 2) |

### Assumptions to confirm

- The submission cut ships on 17 Oct (one public listing says 18 Oct); the finale is on 4 Dec in Singapore. The full MVP in this spec is the finale target.
- The client is a mobile-first Progressive Web App, so judges and users can scan with no install. Native apps come later. Browser storage can be evicted, so profiles get an encrypted export and a recovery code (Section 9.1).
- MVP languages are English, Sinhala, Tamil, Simplified Chinese, Japanese, Hindi and Bahasa Indonesia. Korean, Thai and Vietnamese follow in R2. Packs in any language are read at no extra cost.
- Five Seconds is decision support, not medical advice. It never states that a product is "safe" for an individual.

## 2. Product vision and design principles

**Vision:** point, reveal, listen, explore. Any shopper, in any language, can understand any pack in five seconds and make a choice that fits their household's body, budget and values.

### What is novel

1. **Label-first, not barcode-first.** Gemini reads the physical pack, including ingredient lists, nutrition panels, dates, batch codes and claims, in any script. Products missing from databases still get a full answer. That gap is common for local and imported goods across JAPAC.
2. **Explain, don't score.** Each finding carries a reason, an evidence tier and a next step. No unexplained number decides for the shopper. The deck's six factors become the six summary cards, each with a plain verdict and a tier instead of a letter grade.
3. **One scan, whole household.** Each family member gets their own verdict chip on the same scan, for example "Avoid for Amaya: contains sesame." The match runs on the phone, so profiles never reach our servers.
4. **Voice-first and conversational.** The shopper can listen to the summary and ask follow-ups aloud: "Can my dad have this with his low-salt diet?" This serves low-literacy and older users as first-class users.
5. **Claims truth check.** Words like "natural", "clean", "sugar-free" and "dermatologically tested" are tested against the ingredient list and any available evidence. The gap is shown plainly.
6. **Commercially neutral by design.** There are no sponsored rankings. Price appears only after the shopper declares a budget, and then as 3–5 options nearest to it.
7. **Shelf compare in one photo.** The shopper can photograph 2–4 products side by side and compare them on their own priorities.
8. **Remember what happened after.** A private, dated product-use diary links a skin reaction, an odd taste or smell, or a damaged pack to the products used before it. It then guides a report to the right authority, such as the Consumer Affairs Authority in Sri Lanka (finale).

### Design principles

| Principle | Rule the product follows |
| --- | --- |
| Glance first | Summary screen = icons, colour and at most 12 words per card. Detail sits behind a tap. |
| Say why | Every flag shows its reason in one sentence. |
| Show certainty | Every finding carries one tier: Verified, Label-stated, Inferred or Unknown. |
| Keep risk types apart | Prohibited, Restricted, Allergen and Debated online are never merged into one colour. |
| Suggest, never diagnose | Use "may" and "consider" wording; never "safe for you". |
| Neutral | No brand push, no price unless a budget is declared, no ads in results. |
| Accessible by default | WCAG 2.2 AA, screen-reader labels, colour plus icon plus text, audio for every card. |
| Private by default | Photos are processed in memory and never stored. Household profiles live only on the phone, encrypted and unlocked with biometrics. Delete-all is one tap. |
| AI only where it earns its compute | Gemini reads, normalises the long tail and writes. Plain code looks up, calculates, matches and decides (Section 6.0). |

## 3. Personas

The six personas below drive the user stories. Mei and Nimal define the MVP; the others define the full vision.

| Persona | Context | Primary need | Key constraint |
| --- | --- | --- | --- |
| **Mei, 34, parent (Singapore)** | Buys for two children; one has a peanut and sesame allergy | Instant allergen certainty for each child | Shops fast with a child in tow; one hand free |
| **Nimal, 61, retiree (Colombo)** | On a low-sodium diet; reads Sinhala comfortably, English slowly | Understand salt and sugar without reading small print | Low vision, limited English |
| **Aiko, 27, skincare enthusiast (Tokyo)** | Sensitive, acne-prone skin; buys imported cosmetics | Know which actives and irritants a product has and how they combine | Labels in Korean, French or English |
| **Ravi, 40, carer (Bengaluru)** | Shops for an elderly parent | Check suitability against the parent's needs, not his own | Switches between household profiles |
| **Siti, 22, conscious student (Jakarta)** | Tight budget; cares about halal, labour and packaging | Honest ethics and halal signals, plus cheaper alternatives | Price matters only when she says so |
| **Inspector Lee, regulator / NGO analyst** | Monitors label compliance and recalls | Aggregate, anonymised label-literacy and recall-match trends | Needs auditable evidence trails |

## 4. User stories

There are 45 stories across 12 epics; 29 are tagged MVP. MVP is the 4 Dec finale target; the 17 Oct submission cut is a smaller, prioritised subset (Section 11). Each story has testable acceptance criteria that become automated tests (Section 12). The Release column is a dropdown, so stories can be moved between releases as the team decides.

### E1 · Scan and recognise

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-01 | As a shopper, I want to point my camera at a pack and get a result without pressing a shutter, so that I can decide in seconds. | Auto-capture fires when the frame is stable and text is legible. The first summary card shows in ≤ 5 s at p75 on 4G. It works with no barcode visible. | MVP |
| US-02 | As a shopper, I want to capture the front and back of a pack, so that the answer is complete. | The app prompts "Turn to the ingredient side" when ingredients or nutrition are missing. Captures merge into one product record. | MVP |
| US-03 | As a shopper, I want the barcode matched to known product records, so that label data is cross-checked. | EAN/UPC is decoded on the device. A match is shown with its evidence tier. A conflict between the barcode record and the label is flagged. | MVP |
| US-04 | As a shopper in a store with poor signal, I want recent scans available offline, so that I can re-check them. | The last 50 results are cached on the device and open with no network. | R2 |
| US-05 | As a shopper, I want clear guidance when a photo is unreadable, so that I am never given a guess. | Blur and glare are detected and a specific retake tip is shown. Illegible fields are marked Unknown, never inferred. | MVP |

### E2 · Food: your body

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-06 | As a shopper, I want the nutrition profile per serving and per 100 g, so that I understand what I am eating. | Shows calories, total and added sugar, saturated and trans fat, sodium and salt, protein, fibre and carbohydrate. %RI uses a named regional reference. One plain-language commentary sentence is shown. | MVP |
| US-07 | As a parent, I want declared allergens and "may contain" warnings shown separately, so that I can judge the risk. | Contains and May-contain are distinct cards. Allergens are matched against each household profile. | MVP |
| US-08 | As a shopper, I want diet compatibility (vegan, vegetarian, gluten-free, lactose-free, halal, kosher), so that I can shop by my values. | Halal and kosher are shown as Verified only when a certification mark or registry match is found. Otherwise they are Inferred, with the reason given. | MVP |
| US-09 | As a shopper, I want unfamiliar ingredients and E-numbers explained, so that I am not alarmed or misled. | Each additive shows its function, its regulatory status and one line of context. Ingredient count and processing level are shown. | MVP |
| US-10 | As a shopper, I want manufacture and best-before dates read for me, so that I avoid expired stock. | Dates are parsed in any common format. An expired or near-expiry banner shows with the date read. | MVP |
| US-11 | As a health-conscious shopper, I want the protein-to-calorie ratio and whole-food content, so that I can compare quality. | Computed only from Label-stated or Verified values. | R2 |

### E3 · Cosmetics and personal care

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-12 | As a skincare buyer, I want the ingredient list broken down, so that I can spot actives, fragrance, preservatives and allergens. | INCI names are normalised. Actives, fragrance/parfum, preservatives and known fragrance allergens each get their own group. The ingredient count is shown. | MVP |
| US-13 | As someone with sensitive skin, I want suitability for my skin type and concerns, so that I avoid irritation. | Flags irritants, photosensitising ingredients and risky active combinations, matched to the profile. | R2 |
| US-14 | As a pregnant or breastfeeding user, I want relevant precautions, so that I can talk to my clinician. | Each precaution cites a clinical or regulatory source and advises consulting a professional. | R2 |
| US-15 | As a buyer, I want efficacy claims and expiry read, so that I know what is promised. | SPF/PA and concentrations are shown as Label-stated. The period-after-opening symbol and expiry are detected. | MVP |
| US-16 | As a buyer of imported cosmetics, I want restricted-ingredient checks for my market, so that I know what is legal where I live. | Checked against the user's market rules, with the rule and its source named. | R2 |

### E4 · Trust: the truth behind the claims

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-17 | As a shopper, I want to know if this product or batch has been recalled, so that I don't buy something unsafe. | Matches on product name, brand and batch. Match confidence is shown, with "Verify the match before acting." A link to the official notice is given. | MVP |
| US-18 | As a shopper, I want claims like "natural" or "sugar-free" tested, so that marketing doesn't mislead me. | Each claim is shown as Supported, Unsupported, Contradicted or Unverifiable, with the evidence. | MVP |
| US-19 | As a shopper, I want an authenticity confidence score with its reasons, so that I can spot likely fakes. | The score is 0–100 with listed signals. The app states that a barcode alone cannot prove a product is genuine. | R2 |
| US-20 | As a shopper, I want a label-literacy score, so that I can reward transparent brands. | Scores whether ingredients, nutrition, manufacturer, expiry and required warnings are disclosed, with a checklist. | R2 |
| US-21 | As a shopper, I want to know about verified legal actions against the product, so that I see the full picture. | Only public court or regulator records are used, each with source and date. | R3 |

### E5 · Your planet and the people behind it

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-22 | As a shopper, I want packaging materials and recyclability shown, so that I can cut waste. | Materials and recycling codes read from the pack are shown as Label-stated. Local guidance is given where data exists. Carbon shows "No reliable data" unless a published source exists. | MVP |
| US-23 | As a shopper, I want verified environmental evidence, so that I can judge the footprint. | Only certified or published data is used. Gaps are shown as "No reliable data". | R3 |
| US-24 | As a conscious shopper, I want supply-chain and labour-risk information, so that I avoid exploitation. | Verified findings, unverified claims and data gaps are visually distinct. | R3 |

### E6 · Personalisation and household

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-25 | As a first-time user, I want full results without an account, so that I can try it instantly. | All MVP scan features work anonymously. | MVP |
| US-26 | As a parent, I want to opt in to profiles for each household member, so that one scan shows a verdict for everyone. | Up to 8 members, each a meta-profile (alias, allergies, diets, skin type, goals) stored only on the phone. One chip per member: None found, Check or Avoid. | MVP |
| US-27 | As a parent, I want to share a member's profile with family or carers only with consent, so that they shop safely for that person. | The owner sends an invite and the recipient accepts explicitly. Content travels end-to-end encrypted. The recipient can leave at any time. | MVP |
| US-40 | As a profile owner, I want to see who holds my shared profiles and ask for removal, so that I stay in control. | A Shared-with list shows each recipient's device label, date shared and status. Revoke stops updates at once. Request removal shows Pending, Removed or Not confirmed. The app states that a copy already received cannot be recalled by force. | MVP |
| US-41 | As a family member holding a shared profile, I want to know when it changes, so that my verdicts stay current. | After each edit the owner's app publishes a keyed version hash. Only recipients with active consent are notified. Their app fetches, decrypts and checks the hash before replacing its copy. | MVP |

### E7 · Your best next choice

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-28 | As a shopper, I want to compare 2–4 products from one photo or my history, so that I can pick on my priorities. | The user chooses the priorities. The criteria and their weights are visible. | R2 |
| US-29 | As a shopper, I want better alternatives suggested only when I ask, so that I get no brand push. | Never shown unsolicited. No sponsored placement. Ranking criteria are disclosed. | R2 |
| US-30 | As a budget shopper, I want options near my declared budget, so that price helps only when I want it. | Price is hidden until a budget is declared, then 3–5 options closest to the budget are shown. | R2 |

### E8 · Daily exposure tracking

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-31 | As a shopper on a diet, I want to log what I consume from scans, so that I can track daily sugar and sodium. | Serving size can be adjusted. A running total is shown against a named reference. Opt-in only. | R2 |

### E9 · Voice, language and accessibility

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-32 | As a low-literacy or low-vision user, I want every card read aloud, so that I don't have to read. | TTS for the summary and each card, with play, pause, replay and speed controls. | MVP |
| US-33 | As a non-English speaker, I want results in my language, so that I fully understand them. | UI and commentary in 7 languages at MVP and 10 at R2. Labels in any language are read. | MVP |
| US-34 | As a shopper, I want to ask follow-up questions by voice, so that I can explore naturally. | Answers are grounded in this scan's evidence and keep the evidence tiers. | R2 |
| US-35 | As a screen-reader user, I want a fully accessible app, so that I can use it independently. | WCAG 2.2 AA. Large text and high contrast. Meaning never relies on colour alone. | MVP |

### E10 · Privacy, safety and feedback

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-36 | As a privacy-minded user, I want my photos discarded and my data deletable, so that I stay in control. | Photos are never stored. One-tap delete-all wipes profiles, history and diary on the phone at once and withdraws every share. | MVP |
| US-37 | As a shopper, I want to report wrong information, so that results improve. | One-tap report with an optional note. The report enters a correction queue and carries no profile data. | MVP |
| US-39 | As a privacy-minded user, I want household profiles encrypted on my phone and unlocked with my fingerprint or face, so that no one else can read them. | Profiles are encrypted at rest with AES-256-GCM. Where the phone supports passkey PRF, biometrics unlock the key; otherwise a PIN. An encrypted backup and a recovery code restore them on a new phone. | MVP |

### E11 · Public-interest insights

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-38 | As a regulator or NGO analyst, I want anonymised trends in recall matches and label gaps, so that I can target enforcement. | Aggregated only, with k-anonymity ≥ 20 and no personal data. | R3 |

### E12 · Product-use diary and reporting

The diary is private, dated and kept only on the phone. It records facts the user states; it never diagnoses or blames a product.

| ID | User story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| US-42 | As a shopper, I want to mark that I used or ate a scanned product, so that I have a dated record. | One tap on a result saves the product, batch and expiry read from the pack, with date and time. Encrypted on the phone. | MVP |
| US-43 | As a shopper, I want to note what happened after using a product, so that I keep a record of a reaction or a problem. | Types: skin reaction, suspected food reaction, unexpected taste or smell, damaged or tampered pack, foreign object, other. Note by text or voice; optional photo kept only on the phone. Severe symptoms show emergency guidance first (1990 in Sri Lanka). | MVP |
| US-44 | As a shopper with a reaction, I want to see the products I used before it, so that I can discuss a likely cause with a clinician. | Lists products marked used in a chosen window (default 72 h) and the ingredients they share. Wording says "used before", never "caused". Exports a PDF for a clinician. | MVP |
| US-45 | As a shopper, I want a guided route to report a concern to the right authority, so that unsafe products are dealt with. | Chooses the authority from market and issue type. Sri Lanka at MVP: Consumer Affairs Authority (hotline 1977), plus food and cosmetics regulators. Drafts the report from the diary entry for the user to review and send. The app never submits on the user's behalf. | MVP |

## 5. Competitive differentiation

The five leading scanners all work the same way: barcode in, database lookup, one score out. Five Seconds reads the pack itself and returns evidence-graded findings for each household member, in the shopper's language and by voice. It is also built for Asia-Pacific, where the leader is largely absent. Yuka's 2026 press kit lists 15 countries; Australia is the only one in JAPAC.

### The five benchmark products

| Capability | [Yuka](https://yuka.io/wp-content/uploads/Presskit-Yuka.pdf) | [Open Food Facts](https://world.openfoodfacts.org/open-food-facts-mobile-app) | [Think Dirty](https://apps.apple.com/us/app/think-dirty-shop-clean/id687176839) | [EWG Healthy Living](https://apps.apple.com/us/app/703155791) | [INCI Beauty](https://apps.apple.com/app/id1276113963) | **Five Seconds** |
| --- | --- | --- | --- | --- | --- | --- |
| How it identifies a product | Barcode → own database of 6M products | Barcode → open crowd-sourced database | Barcode → database | Barcode or name search → database | Barcode or name search → database | **Photo of any side of the pack + barcode cross-check** |
| Categories | Food, cosmetics | Food (sister apps for beauty, pet food, products) | Beauty, personal care, household | Food, personal care, cleaners | Cosmetics | Food, cosmetics, personal care, sanitary |
| What the shopper gets | One 0–100 score (60% Nutri-Score, 30% additives, 10% organic) | Nutri-Score and Green-Score | Dirty Meter 0–10 | One 1–10 score | One 0–20 rating | **No single score: findings, each with a reason, tier and next step** |
| Personalisation | Premium alerts (palm oil, lactose, gluten, vegetarian) | Preferences and allergen warnings | Premium allergy / avoid profile | Premium ingredient preferences | Exclude ingredient families | **Free, per-member household profiles with a verdict chip each** |
| Planet | Green-score (France, since 2021) | Green-Score on 600k+ products | Not advertised | Not advertised | Ingredient environmental concerns | Packaging, emissions and labour evidence, with gaps shown |
| Business model | Premium from US$10/yr; no ads | Non-profit, open data | Premium tiers; curated beauty box | Non-profit; premium features | Premium; ad on launch | No ads, no sponsored ranking; price only on a declared budget |

**Not advertised by any of the five:** recall and batch checks, claims verification, a confidence tier on each finding, read-aloud commentary, and verified labour-risk evidence. These five gaps are Five Seconds' core.

### The newer wave: AI photo-label scanners

By 2026 many small apps, such as NutriEye, Eat IQ and Label AI, were reading label photos with AI. They prove the demand, but they still output one score or a list of flags. None advertises evidence tiers, household verdicts, recall checks or multilingual voice output. Five Seconds' edge is the trust model (Section 10) and the household and voice experience, not OCR alone.

### Halal verifiers, calorie trackers and Open Food Facts

Six more products overlap with parts of Five Seconds. Label-photo reading is no longer novel on its own; our edge is the combination of household verdicts on the phone, evidence tiers, local-language voice and the diary-to-report loop.

| Product | What it does | How it identifies a product | Where Five Seconds differs |
| --- | --- | --- | --- |
| [Open Food Facts](https://play.google.com/store/apps/details?id=org.openfoodfacts.scanner) (closest to our idea) | Open database of 4M+ foods with Nutri-Score, NOVA processing group, carbon and allergen alerts. Data stays on the phone. 1M+ Android installs. | Barcode → open database; users add photos when a product is missing | Reads the pack when the barcode is missing or stale. Per-member verdicts, evidence tiers, voice in Sinhala and Tamil. We use it as an open seed and contribute back. |
| [Verify Halal](https://verifyhalal.com/) (Malaysia, JAKIM-endorsed) | Checks halal certification of products, premises and abattoirs: 2M products, 94 certification bodies, 48 countries | Barcode or QR code → certification registry | A registry like this is what lets us show halal as Verified. Without a certificate we show Inferred, with the reason. A possible data partner. |
| [HalalScan](https://halalscan.app/) | Halal, doubtful or non-halal verdict, shared halal lists, Islamic tools | Barcode → 1M+ product records | A review on its own site says products from Taiwan cannot be scanned. Reading the label closes that gap. |
| [HalalCodeCheck](https://halalcodecheck.com/) | Halal, Mushbooh or Haram verdict; 370+ ingredients and E-codes with sources; 240+ brand guides | Label OCR, barcode, search and voice (web) | Its own guides show one brand's recipe differing by country, which is why we read the pack in hand. Halal is one diet lens among several for us. |
| [Nutrola](https://nutrola.app/en/blog/best-app-that-scans-food-and-tells-you-calories) | Calorie and macro tracking with meal-photo AI and voice logging; €2.50 a month | Barcode (3M+ products) and photos of plated meals | A different job: counting what was eaten. We judge a pack before it is bought. Calorie logging stays R2 (US-31). |
| [NutriLens](https://youtu.be/B6wU8XrJV80) (demo video) | Turns barcodes and label photos into simple nutrition insight | Barcode and label photo | Same label-photo idea. The demo shows no household verdicts, evidence tiers, voice or reporting. |

### Where competitors are stronger, and our answer

| Their strength | Our response |
| --- | --- |
| Yuka's database recognises 95% of scans in its markets, with 6M products | Read the pack directly, so coverage does not depend on a database. Use Open Food Facts as an open seed and contribute back. |
| Decades of brand trust (EWG) and in-house scientific teams (Yuka) | Cite an authoritative source on every Verified finding. Set up a scientific advisory panel (R2). |
| Brand-reformulation leverage (Yuka reports 78% of French food manufacturers consider its score) | Public-interest insights for regulators (US-38) give leverage through enforcement rather than ratings. |

### Positioning statement

For households across Asia-Pacific who shop for people with different needs, Five Seconds is the camera-first label companion. It explains any pack, in any language, by voice, with honest confidence. Unlike barcode-score apps, it never hides uncertainty behind a number, never pushes a brand, and keeps the household's profiles on the household's phones.

## 6. Functional requirements

The core engineering rule is **the AI reads and explains; deterministic code calculates and decides**. Gemini extracts structured fields and writes commentary. Versioned, unit-tested rules compute %RI, allergen matches, risk categories and verdicts. This keeps every number reproducible and testable.

### 6.0 Where AI earns its compute

Gemini is used at four points in a scan, plus report drafting at the finale: wherever the input is unstructured or the output is language. Everything else is plain code, which is cheaper, faster and testable. Each AI step is followed by a deterministic guard, and Section 12 measures what the AI adds over a rules-only baseline.

| Step | Why plain code is not enough | What the AI does | What plain code does next |
| --- | --- | --- | --- |
| 1. Read the pack | OCR returns text, not meaning. It cannot tell the ingredient list from marketing copy, or per-100 g from per-serving columns, across thousands of layouts, curved packs and 10+ scripts. Templates break on the next pack. | Gemini Flash reads 1–4 photos into the typed schema (FR-04), with a legibility score per field. | Validates the schema; fields below 0.6 become Unknown; parses and compares dates. |
| 2. Resolve unusual ingredient names | A dictionary covers common names, but labels use synonyms, translations, OCR noise and brackets: "whey powder (milk)", "කජු", "芝麻", "E322 (soy)". | Maps only the terms the dictionary misses to canonical allergen, additive and diet IDs, with a reason. | Matches IDs to allergens, diets and additives. New mappings are reviewed before entering the dictionary. |
| 3. Test claims | "Sugar-free" or "no added MSG" needs the claim's meaning and the ingredients that would contradict it. | Classifies each claim and names the evidence lines. | Applies regulatory thresholds in code where a rule exists; otherwise the result stays Inferred. |
| 4. Explain and speak | Templates across 7 languages, 6 cards and every finding combination read like forms, worst in Sinhala and Tamil. | Writes ≤ 12-word headlines and one-sentence reasons from the typed findings only; Gemini-TTS speaks them. | Checks allergen and medical terms against the glossary; rejects any number not present in the findings. |
| 5. Diary to report (finale) | A note such as "rash on her arm after the new soap" must become the fields an authority asks for, in a formal register. | Extracts the fields and drafts the report, only when the user asks. | Routes to the authority; the user reviews and sends. |

**Never AI:** barcode decoding, Open Food Facts lookup, %RI arithmetic, allergen and diet matching against profiles (on the phone), expiry checks, verdict words, tier assignment, recall-match thresholds, encryption, consent and hash checks, and authority routing.

**Compute per scan:**

1. A repeat scan (same barcode and label hash) is served from cache with 0 model calls.
2. A first scan makes one Gemini Flash vision call; the dictionary runs first, so only unmatched terms go back to the model.
3. One small text call writes the commentary; audio is cached per language.
4. Gemini Pro is called only when no rule can settle a claim.

**How we prove it.** Section 12 runs the golden set through two pipelines: Cloud Vision OCR with the dictionary and regex rules, and the Gemini pipeline. It reports allergen recall, field accuracy, latency and cost per scan side by side, so "why not plain logic?" is answered with numbers.

### 6.1 Capture and recognition

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-01 | The client shall run a live camera view with on-device frame-quality checks (blur, glare, text density) and auto-capture the best frame. | US-01, US-05 | Must |
| FR-02 | The client shall decode EAN-8/13, UPC-A/E and QR codes on the device and send the code with the image. | US-03 | Must |
| FR-03 | The system shall accept 1–4 images per product and merge them into one product record keyed by session. | US-02 | Must |
| FR-04 | The system shall extract, through Gemini structured output, these fields: name, brand, category, ingredients (verbatim plus normalised), nutrition table, allergen statements, claims, dates, batch/lot, manufacturer, origin, certification marks, PAO symbol and packaging codes. | US-06–15 | Must |
| FR-05 | Each extracted field shall carry a legibility confidence (0–1). Fields below 0.6 shall be returned as Unknown. | US-05 | Must |
| FR-06 | The system shall detect the label language(s) and handle mixed scripts. | US-33 | Must |

### 6.2 Analysis engine

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-07 | Nutrition: compute per-serving and per-100 g values and %RI against the selected market's reference set, recording which reference set was used. | US-06 | Must |
| FR-08 | Allergens: map ingredients to the allergen taxonomy in multiple languages (Codex 8 + regional additions such as buckwheat, sesame and mustard). Keep Contains and May-contain separate. | US-07 | Must |
| FR-09 | Diet compatibility: evaluate vegan, vegetarian, gluten-free, lactose-free, halal and kosher. Halal and kosher are Verified only with a detected certification mark or registry match. | US-08 | Must |
| FR-10 | Additives: resolve E-/INS numbers and common names to function and regulatory status, and estimate processing level. | US-09 | Must |
| FR-11 | Dates: parse date formats and flag expired or within 7 days of expiry. | US-10 | Must |
| FR-12 | Cosmetics: normalise INCI names, then classify actives, fragrance, preservatives and fragrance allergens. Flag photosensitisers and incompatible active pairs. | US-12, US-13 | Must |
| FR-13 | Market regulation: check each ingredient against the user's market lists and return Prohibited, Restricted (limit) or Allowed. | US-16 | Should |
| FR-14 | Claims: classify each claim as Supported, Unsupported, Contradicted or Unverifiable, with the evidence. | US-18 | Must |
| FR-15 | Label literacy: score the presence of mandatory disclosures as a checklist. | US-20 | Should |

### 6.3 Trust, recalls and evidence

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-16 | Query recall sources for the user's market, and match on name, brand, batch and market with a confidence level. | US-17 | Must |
| FR-17 | Every finding shall be emitted as `Finding{category, severity, tier, reason, sources[], next_step}`. A finding without a tier is a server error. | All | Must |
| FR-18 | Compute the authenticity score from listed signals with a mandatory caveat. | US-19 | Should |
| FR-19 | Environmental and labour findings shall use only registry or published sources. Otherwise they are returned as Unknown. | US-22–24 | Could |
| FR-36 | Packaging: show materials and recycling codes read from the pack as Label-stated. Carbon is Unknown ("No reliable data") unless a published source exists. | US-22 | Must |

### 6.4 Personalisation and household

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-20 | All scan features work anonymously. Scan requests carry only images, barcode and language: no account, device ID or profile data. | US-25 | Must |
| FR-21 | Opt-in household of up to 8 meta-profiles (alias, allergies, diets, skin type, life stage, goals). Profiles are stored on the device and its encrypted backup only. No real names, birth dates or free-text medical notes. | US-26 | Must |
| FR-22 | The device computes one verdict per member from the scan's findings: None found, Check or Avoid, with the reason. None found always adds "in what we could read"; an Unknown ingredient field forces Check. | US-26 | Must |
| FR-23 | Share a member's profile only with explicit consent: the owner invites, the recipient accepts, and content is end-to-end encrypted (Section 9.1). | US-27 | Should |
| FR-37 | Encrypt profiles, scan history and diary on the device with AES-256-GCM. The data key is wrapped by a passkey PRF secret (biometric unlock) where supported, otherwise by a PIN-derived key. No key leaves the device. | US-39 | Must |
| FR-38 | Offer an encrypted export to the user's own backup, with a recovery code shown once. Request persistent browser storage. | US-39 | Must |
| FR-39 | Keep a Shared-with list per profile: recipient device label, date, status. Support revoke and a removal request that the recipient's app acknowledges. | US-40 | Must |
| FR-40 | Per shared profile, the server stores only a consent list, a version number and a keyed hash: HMAC-SHA-256 under a share-group key the server never holds. On a new hash it notifies consenting recipients by web push. | US-41 | Must |
| FR-41 | The recipient's app verifies the hash after decrypting and keeps the old copy on a mismatch. On revoke or a removal request it deletes its copy and confirms. | US-40, US-41 | Must |

### 6.5 Presentation, voice and language

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-24 | The summary screen shows at most 6 cards, each with an icon, a colour, a ≤ 12-word headline and a tier badge. Tapping expands to detail. | Principles | Must |
| FR-25 | Every card has audio via Gemini-TTS in Cloud Text-to-Speech (Tamil GA; Sinhala in Preview, with on-screen text as the fallback), with play, pause, replay and speed control; audio is cached per language. | US-32 | Must |
| FR-26 | The UI and generated commentary are available in 7 languages at MVP (English, Sinhala, Tamil, Simplified Chinese, Japanese, Hindi, Bahasa Indonesia) and 10 at R2. Commentary is generated natively in the target language, then checked against a glossary. | US-33 | Must |
| FR-27 | Voice follow-up questions use speech-to-text and Gemini, restricted to this scan's findings. | US-34 | Should |

### 6.6 Compare, budget and tracking

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-28 | Compare 2–4 products on criteria chosen by the user, with visible weights. | US-28 | Should |
| FR-29 | Suggest alternatives only on request, with no sponsored ranking, ever. | US-29 | Should |
| FR-30 | Never show price unless a budget is declared, then show 3–5 options nearest the budget. | US-30 | Should |
| FR-31 | Opt-in consumption log with serving adjustment and daily totals against the reference. | US-31 | Should |

### 6.7 Privacy, feedback and operations

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-32 | Photos are processed in memory and never written to storage or logs. There is no opt-in retention in the MVP. | US-36 | Must |
| FR-33 | One-tap delete-all wipes local data at once and withdraws shares; server consent records are deleted within 24 h. | US-36 | Must |
| FR-34 | One-tap issue report, which feeds a moderated correction queue. | US-37 | Must |
| FR-35 | Anonymised aggregates with k ≥ 20 for the public-interest dashboard. | US-38 | Could |

### 6.8 Product-use diary and reporting

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-42 | Use log: "I used this" saves a product snapshot (name, brand, batch, expiry, canonical ingredient IDs) and a timestamp, encrypted on the device. | US-42 | Must |
| FR-43 | Event entry with fixed types, a text or voice note and an optional photo kept on the device. A note goes to Gemini only when the user taps Draft report, without names, and is not stored. | US-43 | Must |
| FR-44 | Before saving an event marked severe, show emergency guidance with the local number. | US-43 | Must |
| FR-45 | Look-back joins the use log with the event window in code and lists shared canonical ingredients. No causal wording. | US-44 | Must |
| FR-46 | A versioned routing table maps market and issue type to the authority and its contact routes. The user sends the draft through their own email, phone or the authority's web form. | US-45 | Must |

## 7. Non-functional requirements

These are targets for the R2 production service. The MVP must meet the ones marked ★.

| ID | Quality | Requirement | How it is verified |
| --- | --- | --- | --- |
| NFR-01 ★ | Speed | First summary card ≤ 5 s at p75 and ≤ 8 s at p95, from capture on a 4G connection. Detail cards stream in progressively. | k6 load test; real-device timing in end-to-end tests |
| NFR-02 | Scale | 200 scans/s sustained with Cloud Run autoscaling and per-user rate limits | Load test on staging |
| NFR-03 ★ | Availability | 99.5% monthly for the scan API | Cloud Monitoring SLO |
| NFR-04 ★ | Accuracy | Allergen recall ≥ 98% and precision ≥ 90% on the golden label set. Nutrition field extraction exact-match ≥ 95%. | Evaluation suite on each model or prompt change |
| NFR-05 ★ | Honesty | 0 findings shown as Verified without a retrieved authoritative source | Contract test plus a production audit sample |
| NFR-06 ★ | Privacy | Photos are never persisted. Profiles and the diary stay on the device. The server holds only consent records and keyed hashes, encrypted with CMEK in asia-southeast1. Aligned with Singapore PDPA, Sri Lanka PDPA, India DPDP Act, Japan APPI and Australia Privacy Act. | Data-flow review; DLP scan; deletion test |
| NFR-07 ★ | Security | OWASP ASVS L2. Firebase App Check. Secrets in Secret Manager. Cloud Run uses its attached service account through Application Default Credentials, so no key files exist. Least-privilege service accounts. Prompt-injection defence: label text is treated as data and never as instructions. | SAST, DAST and dependency scans in CI; injection test set |
| NFR-08 ★ | Accessibility | WCAG 2.2 AA, touch targets ≥ 44 px, colour plus icon plus text for every status, and screen-reader labels | axe-core in CI; manual screen-reader pass |
| NFR-09 ★ | Language | 7 languages at MVP, 10 at R2. Right-to-left ready. Medical and allergen terms come from a reviewed glossary, never free translation. | Native-speaker review of glossary terms; pseudo-locale tests |
| NFR-10 | Responsible AI | Model card, documented limitations, and human review of new risk rules. No age or demographic profiling. | Release checklist |
| NFR-11 ★ | Cost | ≤ US$0.01 average AI cost per scan, using Flash-tier models, caching by barcode and image hash, and batching TTS | Billing dashboard per scan |
| NFR-12 | Maintainability | Typed contracts shared by client and server, ≥ 85% line coverage on the rules engine, and every rule versioned with its source | CI coverage gate |
| NFR-13 | Observability | Structured logs, traces per scan, and evaluation metrics on dashboards. No PII in logs. | Log-based tests |
| NFR-14 ★ | On-device security | Profile data is unreadable without the device key: AES-256-GCM, non-extractable keys, biometric unlock where supported, auto-lock after 5 minutes idle. No request ever contains a profile field. | Crypto unit tests; an end-to-end test that inspects every outgoing request |
| NFR-15 ★ | AI efficiency | At most 3 model calls on a first scan when Search grounding runs (extract, grounding, commentary), otherwise 2; 0 on a repeat scan. (relaxed 18 Oct 2026 for Search grounding) The Gemini pipeline beats the rules-only baseline on allergen recall. | Call counter in traces; baseline comparison in the evaluation suite |

## 8. Use cases with illustrations

Ten use cases cover the MVP and R2. Three are illustrated below: a sequence for the core scan, a decision flow for recall matching, and wireframes for the main screens.

**Actors:** Shopper (anonymous or with a profile), Household member (passive, has a profile), Scan API, Gemini, Evidence sources, and Analyst (R3).

| ID | Use case | Primary actor | Trigger | Main success outcome | Stories | Release |
| --- | --- | --- | --- | --- | --- | --- |
| UC-01 | Scan and explain a product | Shopper | Points the camera at a pack | Summary cards in ≤ 5 s; details stream in | US-01–12, 15 | MVP |
| UC-02 | Household verdicts | Shopper | Scan with a household set up | One chip per member, computed on the phone: None found, Check or Avoid | US-26 | MVP |
| UC-03 | Listen in my language | Shopper | Taps Listen or switches language | Audio of the summary and each card | US-32, 33 | MVP |
| UC-04 | Check for recalls | System | Batch or name extracted | Verified banner with official link, or an honest "no data" | US-17 | MVP |
| UC-05 | Test a claim | System | Claim detected on the pack | Claim card: Supported, Unsupported, Contradicted or Unverifiable | US-18 | MVP |
| UC-06 | Compare and choose within a budget | Shopper | Selects 2–4 products, optionally a budget | Ranked on chosen criteria; prices shown only with a budget | US-28–30 | R2 |
| UC-07 | Manage household and privacy | Shopper | Opens Household or Privacy | Members added or edited; data deleted on request | US-26, 36 | MVP |
| UC-08 | Report wrong information | Shopper | Taps Report on a card | Issue queued for correction | US-37 | MVP |
| UC-09 | Share a profile by consent | Profile owner | Taps Share on a member | Recipient accepts; encrypted copy arrives; owner sees it in Shared with; later edits notify the recipient | US-27, 40, 41 | MVP |
| UC-10 | Record a reaction and report it | Shopper | Adds an event to the diary | Dated entry; products used before it; a report draft for the right authority, sent by the user | US-42–45 | MVP |

### UC-01 Scan and explain: sequence

&#91;embedded content: UC-01 Scan and explain · sequence, 12 messages\]

The summary arrives at step 6, before the slower evidence lookups at steps 7–8. This is how the 5-second target is met without hiding the evidence. The phone then turns the findings into per-member verdicts, so profiles never travel.

**Alternate flows**

- **Illegible label:** at step 3, fields below 0.6 legibility return Unknown, and the PWA asks for a retake of that side.
- **No barcode:** step 1 sends images only, and recognition relies on the label alone.
- **Network loss:** the PWA shows the cached result if the product was scanned before (R2).

### UC-04 Check for recalls: decision flow

&#91;embedded content: UC-04 Check for recalls · 3 decisions, 4 outcomes\]

The flow is designed to fail safe. A partial match warns the shopper without accusing the brand, and an uncovered market says so rather than implying that the product is clear.

### Wireframes: scan, summary, detail (UC-01 to UC-03)

&#91;embedded content: Wireframes for UC-01, UC-02, UC-03 · scan, summary, card detail\]

Screen B is the product's signature: household chips sit above the cards, each card is one line with a tier, and Listen is the largest button. Colour always comes with an icon and words, so the meaning survives colour blindness and screen readers. The product and numbers shown are illustrative.

### Wireframes: household, claims, compare (UC-05 to UC-07)

&#91;embedded content: Wireframes for UC-05, UC-06, UC-07 · household, claims, compare\]

Profiles live only on the phone, photos are never kept, and delete-all is one tap away (D). A claim verdict always shows its evidence and tier (E). Prices appear only after a budget is set, with no sponsored ranking (F, R2). All names, products and prices are illustrative.

## 9. Solution architecture on Google Cloud

The system is one stateless Cloud Run API. Inside it, an ADK agent sends images to Gemini for reading, calls deterministic tools for lookups and rules, and streams typed findings back to a PWA. The phone matches findings to household profiles, so profiles never reach the API. Every component is a managed Google Cloud service.

&#91;embedded content: Five Seconds on Google Cloud · client, API, AI, data, evidence\]

The accented rules engine is the reliability core: Gemini never decides a verdict on its own.

| Decision | Choice | Why |
| --- | --- | --- |
| Client | React PWA (TypeScript, Vite) on Firebase Hosting | No install for judges; camera and Web Speech APIs; one codebase |
| Barcode | BarcodeDetector API with a ZXing-wasm fallback | On-device, fast and private |
| API | Python 3.12, FastAPI, Pydantic v2 on Cloud Run (asia-southeast1) | Typed contracts, async streaming, scales to zero |
| Extraction model | Gemini Flash-tier with a structured-output JSON schema | Low latency and cost; reads multilingual labels |
| Reasoning model | Gemini Pro-tier for claims and comparisons only | Better nuance where it matters |
| Streaming | Server-sent events: summary first, details after | Meets the 5-second first-card target |
| Recall ingestion | Finale: Cloud Scheduler → Cloud Run jobs → Firestore index | Fresh, queryable and cheap |
| CI/CD | Cloud Build → Artifact Registry → Cloud Run with canary | Native Google Cloud pipeline with gates (Section 12) |
| Agent orchestration | Google ADK inside the FastAPI service. One agent with tools: extract\_label (Gemini Flash), lookup\_open\_food\_facts, resolve\_terms (dictionary first, Gemini for leftovers), run\_rules, check\_claims, write\_commentary. | Agentic design as the kick-off advised; every tool call is traced; deterministic tools stay unit-tested |
| On-device data | IndexedDB encrypted with WebCrypto AES-256-GCM; key unlocked by a passkey PRF secret; matching rules shipped to the client as a versioned rule pack | Profiles stay on the phone; verdicts work offline |
| Sharing relay | Finale: Firestore for consent records, keyed hashes and encrypted envelopes with a 7-day TTL; Firebase Cloud Messaging web push | The server relays ciphertext and never holds profile keys |
| Credentials | Cloud Run's attached service account with least-privilege roles (Vertex AI User, Cloud Datastore User), via Application Default Credentials | No service-account key files to leak or load |

### 9.1 Privacy and security architecture

Profiles never leave the phone in readable form, and the server never learns what is in them. The server sees pack photos briefly in memory and, for shared profiles, only who consented and a keyed hash.

| Data | Where it lives | Protection | Reaches our server? |
| --- | --- | --- | --- |
| Pack photos | Request memory on Cloud Run | TLS; never written to disk or logs | Yes, for the length of the request |
| Household meta-profiles | Phone, plus the user's own encrypted backup | AES-256-GCM; key unlocked by biometrics | Never readable; only as an end-to-end-encrypted share |
| Scan history, use log, diary | Phone | Same key | No. A diary note goes to Gemini only when the user drafts a report |
| Share envelope (finale) | Firestore, deleted on delivery or after 7 days | Encrypted to the recipient device's key | Yes, as ciphertext |
| Consent record (finale) | Firestore | Random IDs, device labels chosen by users; CMEK | Yes |
| Profile version hash (finale) | Firestore | HMAC under a share-group key the server never holds | Yes |
| Logs and traces | Cloud Logging | No images and no profile fields | Yes |

**Meta-profile.** Alias (for example "Amaya" or "Child 1"), life stage, allergen IDs, diet IDs, skin type and goals, all from fixed lists. No real name, birth date or free text.

**Keys.**

1. A random AES-256-GCM data key encrypts everything on the phone. It is stored only in wrapped form.
2. Where the phone supports the WebAuthn PRF extension, a passkey with fingerprint or face check yields the wrapping key through HKDF. Support is good on Android with Google Password Manager and on iOS 18.4 or later; elsewhere a 6-digit-or-longer PIN derives the key, and the app says this is weaker.
3. A 128-bit recovery code, shown once, wraps a second copy of the data key so a new phone can restore the backup. Passkeys that sync through Google or Apple restore it too.
4. The native app (after the finale) moves the key into Android Keystore or the iOS Secure Enclave with biometric binding and normal OS backups.

**Backups.** Browser storage is not part of phone backups and can be evicted. The PWA asks for persistent storage and offers an encrypted export the user saves to their own Drive, iCloud or Files.

**Sharing protocol (finale).**

1. The owner taps Share on a member. The invite (link or QR) carries a one-time token and the owner device's key fingerprint.
2. The recipient sees exactly which fields will be shared and taps Accept. Their device label and public key go into the consent record.
3. The owner's device encrypts the profile to the recipient's key (HPKE with X25519) and uploads the envelope.
4. After each edit, the owner's device raises the version, computes HMAC-SHA-256 over the canonical profile with the share-group key, and uploads new envelopes and the hash. The server pushes "changed" only to recipients whose status is active.
5. The recipient's device decrypts and recomputes the hash. On a mismatch it keeps the old copy and warns.
6. Revoke stops envelopes and pushes at once and rotates the group key for the remaining recipients.
7. Request removal pushes a delete instruction. The recipient's app deletes its copy and confirms (Removed); no confirmation in 7 days shows Not confirmed. A recipient can also leave at any time.

**Why a keyed hash.** A meta-profile has few fields from short lists, so a plain SHA-256 could be reversed by trying every combination. An HMAC under a key only the devices hold cannot.

**Honest limits.** Someone who has seen a profile can remember or screenshot it. Removal is a request the app honours, not a guarantee, and the UI says so. Adults own their own profiles; a parent or carer may hold a child's or a dependant's.

## 10. Evidence, confidence and trust model

Every finding the user sees is a typed object with a source and a tier. The UI cannot render a claim that has no tier.

| Tier | Meaning | Example | UI treatment |
| --- | --- | --- | --- |
| **Verified** | Matched to an authoritative record: a regulator, a certification registry or an official recall notice | "Recall notice from \[regulator\] matches this batch" | Solid badge + source link |
| **Label-stated** | Read from the pack; not independently checked | "SPF 50 (label claim)" | Outline badge |
| **Inferred** | Derived by the AI from ingredients or patterns | "Likely vegetarian: no animal-derived ingredients found" | Dashed badge + "why" |
| **Unknown** | Not readable or no reliable data | "Labour practices: no reliable data" | Grey badge, never hidden |

### Rules

- **Never upgrade a tier.** An Inferred finding can never be shown as Verified, and the AI never invents a source.
- **Ground before you claim.** Recall, regulatory and labour findings require a retrieved document. The model's own knowledge alone yields at most Inferred.
- **Keep risk categories distinct.** The categories are Prohibited in your market, Restricted (with limits), Allergen, Debated / controversial online, and No known concern.
- **Wording guardrails.** Suggest, never diagnose ("may", "consider"). Never say "safe for you". Medical-adjacent cards end with "Check with a professional".
- **Recall matching.** Product name + brand + batch + market gives High confidence. Name + brand only gives Medium, shown as "Verify the match before acting". Anything less is not shown as a match.
- **Authenticity score (R2).** A 0–100 score built from listed signals: GS1 prefix vs stated origin, barcode-record match, label completeness, registry match and print-quality cues. It always carries the caveat that a barcode cannot prove a product is genuine.

### Primary data sources (to validate per market)

| Domain | Sources |
| --- | --- |
| Product data | Open Food Facts, Open Beauty Facts (open licence) |
| Recalls and alerts | FSANZ (AU/NZ), Singapore Food Agency, Japan MHLW/CAA, Korea MFDS, FSSAI (IN), ASEAN post-market alerts, US FDA, EU RASFF/Safety Gate |
| Cosmetic regulation | ASEAN Cosmetic Directive annexes, EU CosIng, Japan Standards for Cosmetics, Korea MFDS restricted lists |
| Additives | Codex GSFA / INS numbers, JECFA evaluations |
| Nutrition references | Codex nutrient reference values, with national references where defined |
| Labour and ethics | US DOL List of Goods Produced by Child or Forced Labor, certification registries (Fairtrade, RSPO, Rainforest Alliance) |

Grounding with Google Search is used as a fallback discovery layer. Any result it surfaces must link to one of the authoritative domains above before it is shown as Verified.

## 11. MVP cut-line and roadmap

The MVP is the 4 Dec finale target. The 17 Oct submission cut proves the core loop in one day: read any food pack, explain it with evidence tiers, give each household member a verdict on the phone, and speak it in English, Sinhala or Tamil.

### MVP scope (4 Dec finale)

- **In:** US-01–03, 05–10, 12, 15, 17, 18, 22, 25–27, 32, 33, 35–37 and 39–45 (29 stories), for food and cosmetics.
- **Languages:** English, Sinhala, Tamil, Simplified Chinese, Japanese, Hindi and Bahasa Indonesia (7 of 10).
- **Recall sources:** only feeds proven machine-readable and reachable from Cloud Run (research item #92). openFDA is the only one confirmed so far; the Singapore Food Agency publishes web notices.
- **Out:** compare, budget, exposure log, voice Q&A, authenticity score, environment and labour evidence, and the regulator dashboard.

### Submission cut (17 Oct): one-day build order

One engineer plus Claude, about 11 hours. Build P0 in order and reuse what the prototype already has (on-phone profiles, verdict words, the multilingual allergen engine). Start P1 only when every P0 test is green. If ADK is not working by hour 5, ship the direct pipeline and keep ADK for the finale.

| Order | Item | Stories / requirements | Priority | Timebox | Done when |
| --- | --- | --- | --- | --- | --- |
| 1 | Deploy: FastAPI on Cloud Run with its attached service account (no key file), PWA on Firebase Hosting, Cloud Build pipeline | NFR-07 | P0 | 1 h | A test scan works on the live URL |
| 2 | Extraction: Gemini Flash structured output for food fields with legibility scores; Unknown below 0.6 | US-01, 02, 05; FR-03–05 | P0 | 1.5 h | Schema contract test passes on 10 fixture labels |
| 3 | Rules: allergens (Contains vs May contain), diets with halal tiering, additives, dates, %RI, packaging codes; Finding contract | US-06–10, 22; FR-07–11, 17, 36 | P0 | 2 h | Unit and property tests green; ≥ 85% coverage on rules |
| 4 | ADK agent wrapping steps 2–3 as tools, with traces | Section 9 | P0 | 1 h | One trace shows every tool call for a scan |
| 5 | Six summary cards with verdict and tier; evidence drawer | US-35; FR-24 | P0 | 1 h | axe-core reports 0 serious violations |
| 6 | Household on the phone: encrypted meta-profiles; None found, Check or Avoid computed locally | US-26, 39; FR-21, 22, 37 | P0 | 1.5 h | End-to-end test proves no request carries a profile field |
| 7 | Listen: commentary and Gemini-TTS in English, Sinhala and Tamil; text fallback | US-32, 33; FR-25, 26 | P0 | 1 h | Audio plays in all three; on a TTS error the text shows |
| 8 | Claims check for one claim type ("sugar-free") | US-18; FR-14 | P1 | 1 h | Biscuit fixture shows Contradicted with its evidence |
| 9 | Biometric unlock through passkey PRF, PIN fallback | US-39; FR-37 | P1 | 0.5 h | Works on the demo Android phone |
| 10 | AI-uplift run: 30-label mini golden set (English, Sinhala, Tamil), Gemini vs rules-only baseline | NFR-15 | P1 | 1 h | A results table for the deck and video |
| 11 | Delete-all and report wrong information | US-36, 37 | P2 | 0.5 h | Both covered by end-to-end tests |

**Left for the finale:** cosmetics (US-12, 15), recalls (US-17), sharing (US-27, 40, 41), the diary and reporting (US-42–45), and the other four MVP languages.

### 3-minute judge demo (submission cut)

1. The judge opens the live link. The household (Amaya: sesame and peanut; Dad: low sodium; Ravi) shows "Stored only on this phone" and unlocks with a fingerprint.
2. The judge scans a local snack with a Sinhala and English label that lists sesame. Within 5 s the chips read "Avoid for Amaya: sesame" and "Check for Dad: high sodium".
3. The judge taps **Listen**. The summary is read aloud in Sinhala, then in Tamil.
4. The packaging card shows the recycling code as Label-stated and carbon as "No reliable data".
5. The judge scans a "sugar-free" biscuit. The claim card shows *Contradicted*: maltitol and dextrose are listed (P1).
6. A blurred label returns Unknown with "Turn to the ingredient side", never a guess.
7. The evidence drawer shows every finding's tier and source. The network panel shows the request held images only, no profile.
8. Close on the AI-uplift table: Gemini against the rules-only baseline on the same labels.

### Questions judges are likely to ask

The linked video turned out to be a demo of NutriLens, a similar label scanner, and its transcript was not reachable. These questions come from the rubric instead.

| Question | Short answer | Where |
| --- | --- | --- |
| Why AI? Couldn't OCR plus rules do this? | Only reading, rare-name resolution, claims and multilingual explanation use Gemini; the baseline run shows the gap in numbers. | 6.0, 12 |
| How do you avoid a wrong "None found" on an allergen? | Rules decide, not the model. Unknown forces Check, and None found always says "in what we could read". Target allergen recall is ≥ 98%. | FR-05, FR-22, NFR-04 |
| How is this different from Open Food Facts or Yuka? | Reads the pack when the barcode fails, per-member verdicts, evidence tiers, voice in local languages. | 5 |
| Where does family data live, and who can see it? | Only on the phone, encrypted, unlocked by biometrics. The server never receives a profile. | 9.1 |
| What does a scan cost, and how fast is it? | At most 2 model calls, 0 on a repeat; target ≤ US$0.01 and ≤ 5 s at p75. | NFR-01, 11, 15 |
| How does it fit Sustainability & Social Impact? | Allergen safety, voice for low-literacy shoppers, packaging signal, and consumer reporting at the finale. | 1 |
| What is the business model? | Still open; it must keep the no-sponsorship rule. | 13 |

### Roadmap

| Release | Focus | Exit criteria |
| --- | --- | --- |
| **Cut (17 Oct)** | Food: scan, explain, household on the phone, listen in English, Sinhala and Tamil, packaging | Live URL; every P0 item done with its test green; AI-uplift table ready |
| **MVP** | Scan, explain, household on the phone with consent sharing, listen in 7 languages, recall, claims, packaging, product-use diary | Demo flow passes on 3 Android and 2 iOS devices; NFR ★ met; golden-set accuracy reached |
| **R2** | Compare, budget, exposure log, voice Q&A, skin suitability, pregnancy cautions, regulation per market, authenticity, label literacy, all 10 languages, offline | Pilot with 500 users in two markets; accuracy holds; advisory panel in place |
| **R3** | Planet and people evidence, legal actions, public-interest dashboard, further languages, native apps | Partnerships with at least one regulator or NGO; labour-data licences secured |

## 12. Quality and automated testing strategy

Every acceptance criterion in Section 4 becomes at least one automated test. Every model or prompt change must pass an evaluation gate before deployment, exactly like a code change.

| Layer | What it tests | Tooling | Gate in CI |
| --- | --- | --- | --- |
| Unit | Rules engine: %RI, allergen mapping, diet logic, date parsing, tier assignment, risk categories | pytest + Hypothesis (property-based) | ≥ 85% coverage; all pass |
| Contract | `Finding` schema, API shapes, Gemini structured-output schema | Pydantic, OpenAPI, schemathesis | Schema drift fails the build |
| Integration | Firestore, recall connectors and TTS against emulators or recorded fixtures | pytest + Firebase emulator + VCR cassettes | All pass |
| AI evaluation | Extraction accuracy, allergen recall/precision, claim classification and tier honesty on a golden set of ≥ 300 real labels in 7 languages (30 labels at the cut), plus adversarial cases (glare, curved packs, prompt-injection text on the label) | Vertex AI Gen AI evaluation service + custom scorers | NFR-04 and NFR-05 thresholds; no regression > 1 pt |
| End-to-end | The 3-minute demo journey on mobile viewports, with mocked camera input | Playwright (Chromium, WebKit) | All pass |
| Accessibility | WCAG 2.2 AA rules on every screen | axe-core in Playwright | 0 serious violations |
| Performance | p75/p95 latency and autoscaling | k6 against staging | NFR-01 met |
| Security | Static analysis, dependencies, container image, dynamic scan | Semgrep, OSV-Scanner, Artifact Registry scanning, OWASP ZAP | No high or critical findings |
| AI uplift | The same golden labels through a rules-only baseline (Cloud Vision OCR, dictionary, regex) and the Gemini pipeline: allergen recall, field accuracy, latency, cost per scan | pytest evaluation harness, Cloud Vision API | Gemini beats the baseline on allergen recall; results published in the README |
| Privacy and crypto | Encrypt-decrypt round trip, wrong-key failure, keys never exported, no profile field in any request, HMAC match and mismatch handling | Vitest with WebCrypto; Playwright request interception | All pass |

### Pipeline

1. Pull request: lint, type-check (mypy strict, TypeScript strict), unit, contract and accessibility tests.
2. Merge to main: integration tests and the AI evaluation suite, then deploy to staging on Cloud Run.
3. Staging: end-to-end, performance and DAST.
4. Promote (finale): canary at 10% of traffic with automatic rollback on SLO burn. The cut deploys straight from main after the PR gates pass.

### Golden label set

The team curates and photographs packs from real shelves in Singapore, Sri Lanka, India, Japan and Indonesia. Two reviewers annotate each label, with disagreements resolved by a third. The set is versioned, and no personal data is stored.

## 13. Risks and open questions

| Risk | Impact | Mitigation |
| --- | --- | --- |
| An allergen is missed (false negative) | Serious harm to a user | Rules-based allergen matching on top of AI extraction. Recall target ≥ 98%. Illegible ingredients trigger "Check the pack", never "None found". Persistent disclaimer. |
| AI states a hallucinated fact as verified | Loss of trust; legal exposure | Tier contract (FR-17); Verified requires a retrieved source; honesty evaluation gate |
| A brand disputes a finding | Legal challenge | Findings cite sources and use "may" wording. Claims are framed as evidence, not accusations. Correction channel. |
| Recall and regulatory feeds are uneven across JAPAC | Gaps in coverage | Show coverage per market, and say "No recall data for your market" rather than implying none exists |
| Latency or cost of multimodal calls | Slow UX or margin loss | Flash-tier models, streaming, caching by barcode and image hash, budget alerts |
| Medical or regulatory scope creep | Classed as a medical device | Decision support only; no diagnosis; clinical sources for cautions; legal review before R2 |
| A judge's phone lacks passkey PRF | No biometric unlock | PIN fallback; demo on a known-good Android phone |
| The browser clears site storage | Profiles lost | Persistent-storage request, encrypted export, recovery code |
| Sinhala Gemini-TTS is in Preview | Audio fails during the demo | Cache the demo audio ahead; show the text if TTS fails |
| The diary holds health-adjacent notes | Privacy and trust | Kept only on the phone, encrypted; leaves only in a report the user sends. The deck line changes from "We never ask for or store health data" to "Your family's data never leaves your phone". |
| A shared copy cannot be force-deleted | Overpromising on removal | The UI calls removal a request and shows Removed or Not confirmed |

### Open questions

- [x] Which official problem statement and judging weights apply? Answered in Section 1.
- [ ] What are the submission deliverables (video, deck, repo, live URL)? Deadline: 17 Oct cut, 4 Dec finale.
- [x] What is the team size and who takes each role? Answered: one engineer plus Claude for the cut (Section 11).
- [x] Should Sinhala and Tamil be in the MVP to strengthen the Sri Lanka story? Answered: added, not swapped.
- [ ] Which recall feeds are machine-readable and licensed for reuse in each target market?
- [ ] What is the business model after the competition (freemium, B2G licensing, NGO grants)? It must stay compatible with the no-sponsorship rule.
- [ ] Do the six summary card names match the deck's six factors?
- [ ] Is the new deck line "Your family's data never leaves your phone" approved?
- [ ] Should a native app ship before the finale, for OS-backed biometric keys and backups?
- [ ] Which Sri Lankan bodies take food and cosmetics complaints online, besides the Consumer Affairs Authority?
- [ ] Can Verify Halal or another JAKIM-recognised registry supply data for Verified halal findings?

## 14. Sources

- Requirement notes from Thanuki G, 14 Oct 2026 (provided)
- [AI Builder Cup 2026: overview, prizes and requirements](https://opportunitiescorners.com/google-cloud-ai-builder-cup-2026-in-singapore/) (secondary listing; the official [Hack2skill page](https://hack2skill.com/event/aibuildercup2026) needs to be checked)
- [Google Cloud AI Builder Cup 2026: eligibility and finale](https://opportunitiesradar.com/google-ai-builder-cup-2026/)
- [Yuka Press Kit 2026](https://yuka.io/wp-content/uploads/Presskit-Yuka.pdf)
- [Open Food Facts mobile app](https://world.openfoodfacts.org/open-food-facts-mobile-app)
- [Think Dirty on the App Store](https://apps.apple.com/us/app/think-dirty-shop-clean/id687176839)
- [EWG's Healthy Living on the App Store](https://apps.apple.com/us/app/703155791)
- [INCI Beauty on the App Store](https://apps.apple.com/app/id1276113963) and [INCI Beauty features](https://incibeauty.com/features)
- AI photo-label scanners: [NutriEye](https://mwm.ai/apps/nutrieye-label-scanner/6791068065), [Eat IQ](https://similarweb.com/app/apple/6503642838), [Label AI](https://appgoblin.info/apps/6766134939)
- Review feedback on the SRS from Thanuki, Lakmal, Lasantha and Chamil, and Chamil's security notes, 17 Oct 2026 (provided)
- [AI Builder Cup 2026: judging weights](https://scholarshipsinstitute.com/?p=4888) and [themes and deadlines](https://metropolisjapan.com/events/ai-builder-cup-2026/) (secondary listings)
- Halal apps: [Verify Halal](https://verifyhalal.com/), [HalalScan](https://halalscan.app/), [HalalCodeCheck](https://halalcodecheck.com/)
- [Open Food Facts on Google Play](https://play.google.com/store/apps/details?id=org.openfoodfacts.scanner); [Nutrola comparison article](https://nutrola.app/en/blog/best-app-that-scans-food-and-tells-you-calories); [NutriLens demo video](https://youtu.be/B6wU8XrJV80)
- [Gemini-TTS languages in Cloud Text-to-Speech](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts) (Tamil GA, Sinhala Preview)
- [Passkeys and WebAuthn PRF support](https://www.corbado.com/blog/passkeys-prf-webauthn) (updated March 2026)
- [Consumer Affairs Authority hotline 1977](https://adaderana.lk/news/121161) (Ada Derana, April 2026)
