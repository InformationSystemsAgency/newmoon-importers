# Category import example

Example scripts to **import** and **remove** **categories** (with optional **subcategories**) in NewMoon's [Directus](https://directus.io) via the REST API and a static token.

The importer follows **batched ETL** via **`etlPipe`** (`utils/etl/pipe.js`): **`stages.batchSize`** → **`context.batchSize`**; **`extract`** returns an iterable. When a yield is an **array of plain objects**, the pipe **`map`s** **`transform(item, ctx)`** per element; otherwise **`transform(payload, ctx)`** runs once (CSV and JSON yields use **`{ rows }`** / **`{ sections }`** so one transform builds load input per batch). Each pipeline’s **`load`** only performs inserts + snapshot — no column remapping beyond transform.

## Scripts

| Script | Description |
|--------|-------------|
| `from-csv/run.js` | Streamed CSV, **flat** rows batched by **`batchSize`**. `data/categories.etl.csv`. |
| `from-stream/run.js` | Same batched streaming CSV pipeline (separate folder / entry). |
| `from-json/run.js` | Aliased JSON section batches → transform → load. `data/categories.etl.aliased.json`. |
| `remove.categories.js` | Deletes categories from a snapshot file. Pass the file path as the first argument. |

All imports write `import-logs/categories.imported.{timestamp}.json`.

## ETL layout (per source)

Each source has **`01-extract.js`**, **`02-transform.js`**, **`03-load.js`**, and **`run.js`**.

| Pipeline | Extract | Transform | Load | Runner |
|----------|---------|-----------|------|--------|
| **from-csv** | `from-csv/01-extract.js` — **`extract`** yields **`{ rows }`**. | `from-csv/02-transform.js` — **`transform`**: **`{ rows }`** → **`{ title }`** per row. | `from-csv/03-load.js` — **`createItems`** for categories then translations (chunked by **`ctx.batchSize`**). | `from-csv/run.js` |
| **from-stream** | `from-stream/01-extract.js` — same pattern as CSV. | `from-stream/02-transform.js` | `from-stream/03-load.js` — same **`load`**. | `from-stream/run.js` |
| **from-json** | `from-json/01-extract.js` — **`extract`** yields **`{ sections }`**. | `from-json/02-transform.js` — **`transform`**: aliased blocks → **flat** `{ title, parent_index }[]` per batch; **`aliasedCatalogJsonToCanonical`**, **`aliasedSectionToCanonicalFlat`**. | `from-json/03-load.js` — same **`load`**. | `from-json/run.js` |

Shared:

| Item | Location |
|------|----------|
| Canonical model (JSDoc) | `etl/canonical.js` |
| Pipe | `../utils/etl/pipe.js` — **`etlPipe`** |
| Env / schema helpers | `utils/parse.env.js`, `utils/category.utils.js` |

### Sample data files

- `data/categories.etl.csv` — used by **from-csv** and **from-stream**.
- `data/categories.etl.aliased.json` — used by **from-json** (different property names than Directus).

## Prerequisites

- Directus with **categories** and **categories_translations**.
- **categories**: `parent_category` (M2O self).
- **categories_translations**: `categories_id`, `languages_code`, `title`.

## Environment variables

```env
DIRECTUS_URL=http://localhost:8055
DIRECTUS_IMPORTER_TOKEN=your_static_token_here
```

## How to run

### Import

```bash
node example-categories/from-csv/run.js
node example-categories/from-stream/run.js
node example-categories/from-json/run.js
```

### Remove

```bash
node example-categories/remove.categories.js example-categories/import-logs/categories.imported.250211143052.json
```

## CSV format (`data/categories.etl.csv`)

Two columns — **no hierarchy** in the file:

`en,hy`

**`transform`** maps each row’s **`en` / `hy`** (or **`title_en` / `title_hy`**) into the **`title: { en, hy }`** shape **`load`** expects. Each row is one category.

## Aliased JSON format (`data/categories.etl.aliased.json`)

The file is a **JSON array** (root level). Each element is one root block (not Directus shape):

- `section_title.locale_en` / `section_title.locale_hy` — titles for that node.
- `subsections[]` — each entry is either:
  - a **leaf:** `{ "locale_en", "locale_hy" }`, or
  - a **nested branch:** same shape as the root (`section_title` + `subsections`) for deeper levels.

Transform maps these to nested `{ title, subcategories? }` (any depth).

Legacy: a single object `{ "catalog_sections": [ ... ] }` is still accepted.

## Canonical shape (after Transform)

What **Load** expects:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | object | yes | `{ en, hy, ... }` per language code. |
| `subcategories` | array | no | Same node shape recursively (tree depth depends on source). |

## Customizing

1. Replace or extend files under `data/`, or change paths inside `from-csv/01-extract.js`, `from-stream/01-extract.js`, or `from-json/01-extract.js`. Tune chunking via **`stages.batchSize`** in each **`run.js`**.
2. Add a new folder under `example-categories/` with the same `01-extract.js`, `02-transform.js`, `03-load.js`, and `run.js` pattern; reuse `../utils/etl/pipe.js` and match the canonical shape if you want to copy an existing `03-load.js`.
3. Re-run import creates new rows; use `remove.categories.js` with the latest snapshot to clean up.

## Dependencies

Uses `@directus/sdk`, `dotenv`, and `csv-parse` from the project root, plus `utils/timestamp.js`.
