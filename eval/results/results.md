# AI uplift: rules-only baseline vs Gemini pipeline (Offline (fixture text))

Generated 2026-10-16T19:57:54+00:00. Scored entries: 10. Entries with allergen labels: 9. Field checks: 32 baseline, 32 pipeline.

> **OFFLINE RUN. Both sides use fixture text, not photographs. Baseline text is rendered from the fixture (ingredients, statements, claims, dates, nutrition) so OCR errors are absent. This is NOT the final golden-set result.**
> Both sides read the same printed text offline, so allergen parity here is expected. It does not measure the uplift from Gemini on photos. The baseline's field misses are regex limits (for example, month-name dates).
> Offline latency is local compute only (regex and dictionary vs Extraction validation and analyze). It excludes OCR and model latency and is not comparable to live numbers.
> Offline model_calls=1 for the pipeline and ocr_calls=1 for the baseline are assumptions used only for cost per photo scan.
> Offline gold for text entries is the label truth printed in the fixture JSON (see golden/manifest.json notes). It is hand-checked but not reviewed by two annotators, and the fixture was written by the same team as the rules, so this is a sanity check, not an independent test.
> Skipped: 30 entries (pending photos or missing images).

| Metric | Rules-only baseline (Cloud Vision + dictionary + regex) | Gemini pipeline |
| --- | ---: | ---: |
| Allergen recall (any allergen, contains or may contain) | 100.0% | 100.0% |
| Allergen recall (contains only) | 100.0% | 100.0% |
| Allergen precision (any) | 100.0% | 100.0% |
| Contains vs may-contain separation | 100.0% | 100.0% |
| Field accuracy (sodium and sugars within 5%, claims, best-before) | 90.6% | 100.0% |
| Latency p50 | 1 ms | 2 ms |
| Latency p75 | 1 ms | 2 ms |
| Model calls per scan | 0.00 | 1.00 |
| Cloud Vision calls per scan | 1.00 | 0.00 |
| Estimated cost per scan (placeholder prices) | $0.0015 | $0.0005 |

Allergen recall and precision are micro-averaged over all labelled entries and allergen IDs. Sodium and sugars match within 5% of the labelled value. Claims are compared as normalised sets.

## Per entry

| id | lang | gold contains / may | baseline contains / may | pipeline contains / may | baseline ms | pipeline ms |
| --- | --- | --- | --- | --- | ---: | ---: |
| txt_01_kokis_sesame_si_en | si | egg,sesame / peanut | egg,sesame / peanut | egg,sesame / peanut | 322 | 4 |
| txt_02_sugarfree_biscuit | en | wheat_gluten,soy / - | soy,wheat_gluten / - | soy,wheat_gluten / - | 1 | 2 |
| txt_03_blurred_label | en | - / - | - / - | - / - | 0 | 0 |
| txt_04_halal_noodles | en | wheat_gluten / egg,soy | wheat_gluten / egg,soy | wheat_gluten / egg,soy | 1 | 2 |
| txt_05_tamil_murukku_ta_en | ta | sesame / - | sesame / - | sesame / - | 1 | 3 |
| txt_06_milk_tea_powder | en | milk / - | milk / - | milk / - | 1 | 2 |
| txt_07_peanut_butter | en | peanut / - | peanut / - | peanut / - | 1 | 1 |
| txt_08_vegan_oat_drink | en | n/a / n/a | - / - | - / - | 1 | 2 |
| txt_09_instant_soup_msg | en | wheat_gluten,soy / - | soy,wheat_gluten / - | soy,wheat_gluten / - | 1 | 2 |
| txt_10_prompt_injection_label | en | wheat_gluten,milk / - | milk,wheat_gluten / - | milk,wheat_gluten / - | 1 | 2 |

## Skipped

- en_01: pending_photo
- en_02: pending_photo
- en_03: pending_photo
- en_04: pending_photo
- en_05: pending_photo
- en_06: pending_photo
- en_07: pending_photo
- en_08: pending_photo
- en_09: pending_photo
- en_10: pending_photo
- si_01: pending_photo
- si_02: pending_photo
- si_03: pending_photo
- si_04: pending_photo
- si_05: pending_photo
- si_06: pending_photo
- si_07: pending_photo
- si_08: pending_photo
- si_09: pending_photo
- si_10: pending_photo
- ta_01: pending_photo
- ta_02: pending_photo
- ta_03: pending_photo
- ta_04: pending_photo
- ta_05: pending_photo
- ta_06: pending_photo
- ta_07: pending_photo
- ta_08: pending_photo
- ta_09: pending_photo
- ta_10: pending_photo
