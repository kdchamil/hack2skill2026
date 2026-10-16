# Golden set (AI-uplift eval)

`manifest.json` lists the labels that `eval/run_eval.py` scores. Schema: `manifest.schema.json`.

## Entries

- **30 photo entries** (`kind: "photo"`, 10 each for `en`, `si`, `ta`). They are placeholders marked `"pending_photo": true`, so `run_eval.py` skips them until you photograph the packs and fill in the labels.
- **10 text entries** (`kind: "text"`, `fixture` names a file in `backend/app/fixtures/`). They run offline. The fixture JSON is read at runtime.

Entry fields: `id`, `kind`, `lang` (`en|si|ta`), `fixture` (text only), `image_paths` (photo only, relative to repo root), `pending_photo`, `expected`, `notes`.

`expected`:
- `allergens_contains`, `allergens_may_contain`: canonical IDs (`peanut, tree_nut, milk, egg, fish, crustacean, soy, wheat_gluten, sesame, mustard, buckwheat, celery, lupin, mollusc, sulphite`). An empty list means "none on the pack" and is scored. `null` means not scored. Allergen metrics count an entry only when both lists are arrays.
- `sodium_mg_per_100g`, `sugars_per_100g`: numbers, or `null` = not scored. Matched within 5%.
- `claims`: verbatim claim strings, or `null` = not scored. Compared as normalised sets.
- `best_before_iso`: `YYYY-MM-DD`, or `null` = not scored.

## Adding a photo label

1. Photograph the front and back of each pack. Save as `eval/golden/images/<id>_front.jpg` and `<id>_back.jpg` (JPEG, PNG or WebP, at most 5 MB each). If the pack has only one side, edit `image_paths` to match.
2. Fill `expected` from the pack. Two reviewers annotate each label, and a third resolves disagreements (SPEC 12).
3. Set `"pending_photo": false`.

Entries with missing images are skipped and listed in `results.md`.

## Text entries

Expected values are the label truth as printed in `backend/app/fixtures/<fixture>.json`: printed Contains and May-contain statements, nutrition rows, dates and claims (`notes` gives the basis per entry). A hand check on 2026-10-17 confirmed them. Reviewers should confirm. Entries where the pack is ambiguous have `null` allergen lists.

## Running

```
cd backend && uv run python ../eval/run_eval.py --mode offline
cd backend && uv run python ../eval/run_eval.py --mode live --api http://localhost:8080
```

Live mode needs ADC (`gcloud auth application-default login`), `google-cloud-vision` (`uv add google-cloud-vision`, not yet in backend deps), and the API running. Results go to `eval/results/results.md` and `results.json`.
