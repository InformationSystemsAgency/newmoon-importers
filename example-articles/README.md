# Example articles importer (NewMoon, Directus)

Scripts that create **one article** in NewMoon's Directus (translations, featured image, optional advanced extras, content blocks), write a **JSON snapshot** under `import-logs/`, and optionally **remove** articles from that snapshot.

---

## Repository layout


| Path                         | Role                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `import-article-basic.js`    | Runnable example: `layout: 'basic'`, full block demo, log prefix `articles.imported`.                                                |
| `import-article-advanced.js` | Runnable example: `layout: 'advanced'`, same blocks plus `attachment_paths` + `info_cards`, log prefix `articles-advanced.imported`. |
| `lib/helpers.js`             | `**importArticle(payload)`** — Directus create/update, uploads, blocks, advanced rows.                                               |
| `../utils/write-log.js`      | `**writeImportLog(dir, prefix, records)`** — timestamped JSON array (import scripts import this from the repo `utils/` folder).      |
| `remove.articles.js`         | Deletes every article `id` listed in a snapshot JSON **array**; cleans some junction rows first.                                     |
| `import-logs/`               | Generated snapshots (often gitignored).                                                                                              |


Run commands from the **repository root** (`newmoon-importers/`) unless you adjust paths.

---

## Prerequisites

- **Directus** with at least:
  - `articles`, `articles_translations`
  - `articles_categories` (optional; category links skipped if missing)
  - `articles_content_blocks` (optional; blocks skipped if missing)
  - `content_types` (script checks that `content_type` exists)
- **Advanced layout** (only if you use `layout: 'advanced'` and the payloads below):
  - `file_attachments` (+ optional `file_attachments_translations`)
  - `info_card_types` — optional overall, but required if you use `**info_card_type_upsert`**
  - Translations collection on `info_card_types` with relation `**one_field: "translations"`** — required if you use `**match_translation`**, `**type_translations`**, or rely on the default “sync from `match_translation`” behavior (one row per locale is created/updated by `languages_code`)
  - `info_cards` + `info_cards_translations` (both required for info cards to be created)
- **Block collections** must be allowed on `articles_content_blocks.item` (M2A) for each block `type` you use.
- **Local files** for any `*_path` you reference (e.g. under `example-articles/attachments/`).

---

## Environment variables

Put in **project root** `.env` or `**example-articles/.env`**:

```env
DIRECTUS_URL=your.cms.url.here
DIRECTUS_IMPORTER_TOKEN=your_static_token_here

```

 Create a **static token** in Directus for an administrative account with the permissions needed for your import. See [how to generate a token](https://youtu.be/FR_cDNCzRa8?si=kNZmPx2TDjX5RdWH&t=350) (video).

> ⚠️ **Important — revoke the token after import**  
> When imports are finished, **revoke or rotate** that token in Directus (delete it or issue a new one) so the credential is not left active longer than necessary. Remove or update `DIRECTUS_IMPORTER_TOKEN` in `.env` if you no longer need it.

---

## Usage (CLI)

**Basic example**

```bash
cd newmoon-imorters
node example-articles/import-article-basic.js
```

**Advanced example** (attachments + info cards)

```bash
cd newmoon-imorters
node example-articles/import-article-advanced.js
```

**Remove articles** using a snapshot (file must be a **JSON array** of objects with `id`):

```bash
cd newmoon-imorters
node example-articles/remove.articles.js example-articles/import-logs/articles.imported.260331121414.json
```

---

## Output snapshots

Article imports write under `example-articles/import-logs/`:

- Basic demo: `articles.imported.{timestamp}.json`
- Advanced demo: `articles-advanced.imported.{timestamp}.json`

Use the matching path with `remove.articles.js` for cleanup.

## Notes

- `import-logs/` outputs are typically ignored by git.
- `date_created` in Directus is set on create; the article importer can apply a custom value in a follow-up update—see `example-articles/README.md`.

## Programmatic API

### `importArticle(ARTICLE)` — `lib/helpers.js`

- **Input:** one article object (shape below).
- **Returns:** `Promise<{ id, content_blocks, attachments, info_card_type_id, info_cards }>`
  - `content_blocks`: summaries for each block created (types, ids, order; gallery/accordion child ids where applicable).
  - `attachments`: `[]` unless `layout` is advanced **and** `file_attachments` exists; then `{ id, file, path }[]`.
  - `info_card_type_id`: `null` unless `info_card_type_upsert` ran; then the resolved `info_card_types` id used for cards without their own `type`.
  - `info_cards`: `[]` unless advanced **and** both info card collections exist; then `{ id, translations }[]`.

Loads `.env` when the module is first imported; **exits the process** if `DIRECTUS_URL` / `DIRECTUS_IMPORTER_TOKEN` are missing.

### `writeImportLog(dirPath, filePrefix, records)` — `utils/write-log.js`

- `**dirPath`** — directory (created if needed).
- `**filePrefix`** — filename prefix before the timestamp, e.g. `'articles.imported'` → `articles.imported.YYMMDDHHmmss.json` (2-digit year, local time).
- `**records`** — **array** of serializable objects (typically `[result]` from `importArticle`).

Returns `Promise<string>` — absolute path of the file written.

---

## Article payload structure

Top-level object passed to `importArticle`:


| Field                   | Required | Description                                                                                                                                                                                                                                         |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content_type`          | yes      | UUID string; must exist in `content_types`.                                                                                                                                                                                                         |
| `translations`          | yes      | Non-empty array; each entry needs `languages_code` and `title`. Other keys (`slug`, `short_description`, …) are passed through if present in schema.                                                                                                |
| `layout`                | no       | `basic` or `advanced` (must match Directus `articles.layout` choices when choices exist). Default treated as `basic`.                                                                                                                               |
| `status`                | no       | Defaults to `published` if omitted. Use the same string Directus stores for the dropdown **value** (often `published` / `draft` / `archived`), not the capitalized label shown in the UI. The importer resolves casing against your schema choices. |
| `published_date`        | no       | Falls back to `date_created` when set.                                                                                                                                                                                                              |
| `date_created`          | no       | Applied in a **second** `update` after create (Directus sets it on insert).                                                                                                                                                                         |
| `featured_image_path`   | no       | Local path → uploaded to `/files`, id stored on translations as `featured_image` when the field exists.                                                                                                                                             |
| `categories`            | no       | Array of category UUIDs → `articles_categories`. Set up categories manually inside your or by new script(not import-articles-*.js) NewMoon instance. Get id's from you NewMoon instance.                                                            |
| `content_blocks`        | no       | Ordered list of block descriptors (see below).                                                                                                                                                                                                      |
| `attachment_paths`      | advanced | Array of local paths → `file_attachments` rows (same upload rules as featured: supported extensions only — see end of this doc).                                                                                                                    |
| `attachments`           | advanced | Alternative to `attachment_paths`: `[{ path, sort?, make_downloadable?, …, translations? }]`.                                                                                                                                                       |
| `info_card_type_upsert` | advanced | Upsert spec for `**info_card_types`** + optional translation rows (see below). Supplies the default `**type`** id for every `info_cards[]` row unless a card sets `type` explicitly.                                                                |
| `info_cards`            | advanced | Array of cards with `translations[]` (see below). Each card needs a `**type`** (uuid) **or** rely on `info_card_type_upsert`. Optional `sort`.                                                                                                      |


### Layout behavior

- `**basic`:** no `file_attachments` / `info_cards` rows are created (`attachments` and `info_cards` in the return value are `[]`). Paths in `attachment_paths` are **not** collected for upload unless layout is advanced.
- `**advanced`:** `attachment_paths` / `attachments` are uploaded and linked; `info_cards` are created if both `info_cards` and `info_cards_translations` collections exist. Optional `**info_card_type_upsert`** creates or updates a row in `info_card_types` and uses it as the default `info_cards.type`.

### Advanced: `info_card_type_upsert` (upsert one type)

Importer-only keys (not sent to Directus as collection fields): `match_field`, `match_value`, `match_translation`, `type_translations`, `icon_path`. Everything else on the object is filtered to **writable** `info_card_types` fields (e.g. `icon` as file id).


| Key                           | Purpose                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match_field` + `match_value` | Optional. Find the parent row by any **non-alias** column on `info_card_types` (read-only columns are OK for the lookup).                                                                                                                                                                                                           |
| `match_translation`           | Optional. Find the parent via one row in the types **translations** collection; keys must be real columns there (e.g. `languages_code` + `title`).                                                                                                                                                                                  |
| `type_translations`           | Optional but recommended. Array of translation rows (e.g. per `languages_code` + `title`). **Create:** inserts any missing rows. **Update (type already found):** updates or creates each locale by `languages_code`. If omitted, the importer uses `**[match_translation]`** when `match_translation` is set (single locale only). |
| `icon`                        | Writable parent field: value your schema expects (often a Directus **files** id).                                                                                                                                                                                                                                                   |
| `icon_path`                   | Local file path; included in the article media upload pass and mapped to `**icon`** on **create** when `icon` is not set.                                                                                                                                                                                                           |
| *(no explicit match)*         | If you set a parent key such as `slug`, `code`, `name`, … (see list below), the first populated key among the known list is used like `match_field`.                                                                                                                                                                                |


**1) Match on `info_card_types`**

**Create/update** of the parent row uses **writable** fields only. **Lookup** can use any non-alias column via `match_field` / `match_value` or auto-detected keys.

**2) Match on translations (typical NewMoon setup)**

If the type label lives on `**info_card_types_translations`** (or similar), use `**match_translation`**: an object whose keys exist on that collection (e.g. `languages_code` + `title`). The importer resolves the parent type id from that row.

- **Found:** parent row is `**updateItem`**’d with writable `info_card_types` fields from your object (if any). Translation rows from `**type_translations`** (or `[match_translation]`) are **upserted** by `languages_code`.
- **Not found:** parent is `**createItem`**’d (needs at least one writable field — usually `**icon`**). If you omit `**icon**`, the importer copies `**icon**` from another `**info_card_types**` row that already has `icon` set (same value shape your project uses). Otherwise set `**icon**` or `**icon_path**`. Then translations are written the same way as on update.

```js
info_card_type_upsert: {
  match_translation: { languages_code: 'en', title: 'newmoon_import_article_callout' },
  type_translations: [
    { languages_code: 'en', title: 'newmoon_import_article_callout' },
    { languages_code: 'hy', title: '…' },
  ],
  // New type only (optional if another type already has icon set):
  // icon: '<directus-files-uuid>',
  // icon_path: 'attachments/callout-icon.svg',
},
```

**Auto match on parent:** without `match_field`, the first set key among `slug`, `internal_identifier`, `code`, `key`, `identifier`, `name`, `title`, `label` on `info_card_types` is used.

All `info_cards[]` entries use this type **unless** a card sets `**type: '<uuid>'`** itself.

### Advanced: `info_cards[]`

Each item:

```js
{
  sort: 1,              // optional; default index + 1
  type: '<uuid>',      // optional if article has info_card_type_upsert (or default type id)
  translations: [
    { languages_code: 'en', content: '<p>HTML</p>' },
    { languages_code: 'hy', content: '<p>…</p>' },
  ],
}
```

Every card must have at least one translation with `**languages_code**` and `**content**`.

### Advanced: attachments

Either:

```js
attachment_paths: ['attachments/a.png', 'attachments/b.png'],
```

or:

```js
attachments: [
  { path: 'attachments/a.png', sort: 1, file_name: 'custom-name.png' },
],
```

If `file_attachments_translations` exists and you do **not** supply `spec.translations`, display names are filled from article `translations` × default basename.

---

## Content blocks (`content_blocks`)

Only these `type` values are implemented in `lib/helpers.js`:

`block_title`, `block_richtext`, `block_alert`, `block_image`, `block_video`, `block_gallery`, `block_accordions`, `block_embed`

### Shared shape

Every entry in `content_blocks` is an object with:


| Key            | Description                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `type`         | Required. One of the collections above; must also be allowed on `articles_content_blocks.item` in your Directus project.                  |
| `order`        | Optional. Sort on the article–block junction; defaults to `index + 1` in the array.                                                       |
| `data`         | Optional. Plain fields on the block’s main row. Only keys that are **writable** on that collection (per schema snapshot) are sent.        |
| `translations` | Optional per block type (see below). Each row needs `languages_code`; other keys must be writable on the block’s translations collection. |


Importer-only keys (`upload_files_paths`, `gallery_items`, `accordions`, `image_path`, `video_file_path`, …) are stripped or mapped before `createItem`; they never go to the wrong collection.

**Non-empty `translations` required** (when that block has a translations relation in Directus) for: `block_title`, `block_richtext`, `block_alert`, `block_image`.

---

### `block_title`


| Where            | Typical fields                                                  |
| ---------------- | --------------------------------------------------------------- |
| `data`           | Whatever your schema exposes (e.g. `font_size`, `column_size`). |
| `translations[]` | `languages_code`, `title`                                       |


```js
{
  type: 'block_title',
  data: { font_size: 'h3', column_size: '1/1' },
  translations: [
    { languages_code: 'en', title: 'Section heading (EN)' },
    { languages_code: 'hy', title: 'Բաժնի վերնագիր (HY)' },
  ],
},
```

---

### `block_richtext`


| Where            | Typical fields                     |
| ---------------- | ---------------------------------- |
| `data`           | e.g. `font_size`, `column_size`    |
| `translations[]` | `languages_code`, `content` (HTML) |


```js
{
  type: 'block_richtext',
  data: { font_size: 'base', column_size: '1/1' },
  translations: [
    { languages_code: 'en', content: '<p>Main body <strong>rich text</strong>.</p>' },
    { languages_code: 'hy', content: '<p>Հիմնական տեքստը հայերեն։</p>' },
  ],
},
```

---

### `block_alert`


| Where            | Typical fields                                                  |
| ---------------- | --------------------------------------------------------------- |
| `data`           | e.g. `variant` (`'info'`, … — must match your Directus choices) |
| `translations[]` | `languages_code`, `title`, `content` (HTML)                     |


```js
{
  type: 'block_alert',
  data: { variant: 'info' },
  translations: [
    {
      languages_code: 'en',
      title: 'Note (EN)',
      content: '<p>Alert body in English.</p>',
    },
    {
      languages_code: 'hy',
      title: 'Նշում (HY)',
      content: '<p>Զգուշացման տեքստը հայերեն։</p>',
    },
  ],
},
```

---

### `block_image`


| Where            | Typical fields                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`           | e.g. `image_size`, `alignment`                                                                                                                                                                            |
| `translations[]` | `languages_code`; `**image_path**` (repo-relative/local, uploaded like featured image) **or** `image` (existing `directus_files` id); optional `image_alt_text` and any other writable translation fields |


```js
{
  type: 'block_image',
  data: { image_size: '1/1', alignment: 'left' },
  translations: [
    {
      languages_code: 'en',
      image_path: 'attachments/hero.png',
      image_alt_text: 'Illustration (EN)',
    },
    {
      languages_code: 'hy',
      image_path: 'attachments/hero.png',
      image_alt_text: 'Պատկեր (HY)',
    },
  ],
},
```

---

### `block_video`


| Where            | Typical fields                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`           | **URL:** e.g. `type: 'url'`, `video_url`, `video_size`. **File:** `video_file_path` (local path) is replaced with `video_file` (uuid) after upload — only extensions covered by `mimeFromExt` in `lib/helpers.js` (same image MIME map as featured images). For other formats, upload in Directus and set `video_file` to that id, or extend the MIME map. |
| `translations[]` | Only if your schema defines a translations collection for this block; otherwise omit.                                                                                                                                                                                                                                                                      |


```js
// External URL
{
  type: 'block_video',
  data: {
    type: 'url',
    video_url: 'https://www.youtube.com/watch?v=…',
    video_size: '1/1',
  },
},

```

---

### `block_gallery`

Requires `upload_here` and/or `gallery_items` relations on `block_gallery` when you use the matching payload keys.


| Where     | Fields                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top-level | `upload_files_paths[]` — each path becomes a child row linking `directus_files_id` (via `upload_here`).                                                                                    |
| Top-level | `gallery_items[]` — each item: optional `order` / `sort` (junction sort), `image_path` → `image`; optional nested `translations[]` with `languages_code` and fields like `image_alt_text`. |


```js
{
  type: 'block_gallery',
  upload_files_paths: ['attachments/a.png', 'attachments/b.png'],
  gallery_items: [
    {
      order: 1,
      image_path: 'attachments/a.png',
      translations: [
        { languages_code: 'en', image_alt_text: 'Slide 1 (EN)' },
        { languages_code: 'hy', image_alt_text: 'Պատկեր 1 (HY)' },
      ],
    },
    {
      order: 2,
      image_path: 'attachments/b.png',
      translations: [
        { languages_code: 'en', image_alt_text: 'Slide 2 (EN)' },
        { languages_code: 'hy', image_alt_text: 'Պատկեր 2 (HY)' },
      ],
    },
  ],
},
```

Child rows also accept `directus_files_path` / `file_path` instead of pre-uploaded ids where those columns exist on the child collection (see `createChildRowsForBlock` in `lib/helpers.js`).

---

### `block_accordions`

Requires an `accordions` relation on `block_accordions`.


| Where          | Fields                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `data`         | e.g. `column_size` (whatever is writable on the block row).                                                                               |
| `accordions[]` | Each panel: optional `sort` / `order`; `translations[]` with `languages_code`, `title`, `content` (HTML), plus any other writable fields. |


```js
{
  type: 'block_accordions',
  data: { column_size: '1/1' },
  accordions: [
    {
      translations: [
        { languages_code: 'en', title: 'First panel (EN)', content: '<p>Body EN.</p>' },
        { languages_code: 'hy', title: 'Առաջին (HY)', content: '<p>Տեքստ HY։</p>' },
      ],
    },
    {
      translations: [
        { languages_code: 'en', title: 'Second panel (EN)', content: '<p>More.</p>' },
        { languages_code: 'hy', title: 'Երկրորդ (HY)', content: '<p>Ավելին։</p>' },
      ],
    },
  ],
},
```

---

### `block_embed`


| Where  | Fields                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data` | At least one of `**url**` or `**code**`. Optional `mode` and other writable columns. Validation in code: `block_embed needs data.url and/or data.code`. |


```js
{
  type: 'block_embed',
  data: {
    mode: 'code',
    code: '<iframe title="Chart" width="600" height="400" src="https://example.com/embed" style="border:0"></iframe>',
  },
},

{
  type: 'block_embed',
  data: {
    url: 'https://example.com/public-chart',
    mode: 'url',
  },
},
```

---

## Snapshot file format (`import-logs`)

Importers wrap the result in an **array** so `remove.articles.js` can consume it:

```json
[
  {
    "id": "uuid-of-article",
    "content_blocks": [ /* summaries */ ],
    "attachments": [],
    "info_card_type_id": null,
    "info_cards": []
  }
]
```

Use the same array shape if you build a file by hand for `remove.articles.js`. After `**import-article-advanced.js**`, `attachments` and `info_cards` are filled and `info_card_type_id` is set when `info_card_type_upsert` ran.

---

## `remove.articles.js` behavior

1. Reads JSON; must be a **non-empty array**.
2. Collects each element’s `id`.
3. For each id, deletes rows in (when possible): `articles_categories`, `articles_content_blocks`, `block_content_display_articles` filtered by `articles_id`.
4. Deletes the `articles` row.

It does **not** delete uploaded Directus files, block items, gallery children, accordion children, `file_attachments`, or `info_cards` by default—only what Directus cascades or you clean separately. Extend the script if you need deeper cleanup.

---

## Local file path resolution

For any local path string, the helper tries in order:

1. `path.resolve(process.cwd(), rawPath)`
2. `path.resolve(example-articles/, rawPath)` (parent of `lib/`)
3. `path.resolve(example-articles/lib/, rawPath)`

Uploads support common **image** extensions (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`, `.avif`).

---

## Notes

- **Schema-driven fields:** Only writable fields present in the snapshot are sent; unknown keys in your payload are ignored by `pick` (importer-only keys like `match_translation` are handled separately and never passed to `createItem` on the wrong collection).
- **Layouts:** If `articles.layout` has fixed choices in Directus, your string must match one of them (case-insensitive).
- **Status:** Must match the choice **value** stored in Directus (often lowercase), not the admin UI label — see the `status` row in the table above.
- **Warnings:** If a block type is not in `articles_content_blocks.item`’s allowed list, you’ll see a console warning; creation will fail if you still use that type.

