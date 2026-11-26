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
  - `articles_sites` — **required** in current NewMoon; each article must link to at least one site (see `sites` below)
  - `articles_categories` (optional; category links skipped if missing)
  - `articles_content_blocks` (optional; blocks skipped if missing)
  - `content_types` (script checks that `content_type` exists)
  - `sites` (source of site UUIDs for `sites` in your payload)
- **Advanced layout** (only if you use `layout: 'advanced'` and the payloads below):
  - `file_attachments` (+ optional `file_attachments_translations`)
  - `info_card_types` — optional overall, but required if you use `info_card_type_upsert`
  - Translations collection on `info_card_types` with relation `one_field: "translations"` — required if you use `match_translation`, `type_translations`, or rely on the default “sync from `match_translation`” behavior (one row per locale is created/updated by `languages_code`)
  - `info_cards` + `info_cards_translations` (both required for info cards to be created)
- **Block collections** must be allowed on `articles_content_blocks.item` (M2A) for each block `type` you use. NewMoon currently allows more block types than this importer implements (see [Content blocks](#content-blocks-content_blocks) below).
- **Local files** for any `*_path` you reference (e.g. under `example-articles/attachments/`).
- **Languages** configured in Directus (`languages` collection). Current instance: `en`, `hy`, `ru`.

---

## Current NewMoon schema (Directus)

The tables below reflect a live schema snapshot from a connected NewMoon Directus instance. UUIDs are **examples from that instance** — copy ids from your own CMS when importing elsewhere.

### CMS validation (article create)

NewMoon runs hooks on `articles` create. The importer must satisfy:

| Rule | How the importer handles it |
| ---- | --------------------------- |
| At least one site | `sites: [uuid, …]` → nested `relateds_site_ids` on create (`articles_sites`) |
| At least one translation with `title` | `translations` nested on create (`articles_translations`) |

Categories and content blocks are still linked **after** create.

### Reference UUIDs (example instance)


| Resource | UUID | Notes |
| -------- | ---- | ----- |
| **Site** | `482f805c-9954-420d-926a-572b3a565440` | `Default Site` (`localhost`) |
| **Content type** | `22c336b3-7f79-4d5c-829d-808ab20efb85` | `[seed_v2] Announcements` — `import-article-basic.js` |
| **Content type** | `3b5010f1-099f-48b5-9514-6ec2169b082a` | `[seed_v2] Updates` |
| **Content type** | `61f12610-0603-4da4-948a-2da92f053410` | `Blog` — `import-article-advanced.js` |
| **Content type** | `62a23e77-56f9-449b-8aa1-c18986f98925` | `[seed_v2] Guides` |
| **Category** | `f1638ebf-f612-4b02-b5e6-4e85475a18e7` | Demo basic import |
| **Category** | `540e771c-df83-42cd-8105-1208871f85bc` | Demo basic import |
| **Category** | `a65bd253-8667-4b88-913d-010ecd11fbdf` | |
| **Category** | `c01a8c1d-31ed-4f93-9a8c-9fa6a938e69a` | |

### `articles` (writable fields)


| Field | Type / choices |
| ----- | -------------- |
| `content_type` | UUID → `content_types` |
| `layout` | `basic` · `advanced` |
| `status` | `published` · `draft` · `archived` |
| `publish_date` | timestamp (payload may use `publish_date` or `published_date`; importer maps both) |
| `date_created` | set on insert; optional override via follow-up `update` |
| `unpublish_date` | timestamp |
| `show_featured_image` | boolean |
| `show_title` | boolean |

**Relations (alias, not set directly as scalar fields):** `translations`, `categories`, `content_blocks`, `file_attachments`, `info_cards`, `relateds_site_ids` (`articles_sites`).

### `articles_translations` (writable fields)


| Field | Notes |
| ----- | ----- |
| `languages_code` | e.g. `en`, `hy`, `ru` |
| `title` | required |
| `short_description` | HTML |
| `featured_image` | file UUID (importer sets from `featured_image_path`) |
| `customize_slug` | boolean |
| `slug` | **read-only** in Directus — generated; not written by the importer |

### Junction collections


| Collection | Writable fields | Payload key |
| ---------- | --------------- | ----------- |
| `articles_sites` | `articles_id`, `sites_id` | `sites[]` (on create) |
| `articles_categories` | `articles_id`, `categories_id` | `categories[]` |
| `articles_content_blocks` | `articles_id`, `collection`, `item`, `order`, `hide_on_devices` | `content_blocks[]` |

### Allowed article block types (Directus M2A)

All types allowed on `articles_content_blocks.item` in current NewMoon:

`block_title`, `block_richtext`, `block_image`, `block_gallery`, `block_video`, `block_audio`, `block_embed`, `block_button`, `block_alert`, `block_accordions`, `block_divider`, `block_social_media_links`, `block_code`, `block_group`

**Implemented in `lib/helpers.js`:** `block_title`, `block_richtext`, `block_alert`, `block_image`, `block_video`, `block_gallery`, `block_accordions`, `block_embed` only.

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
cd newmoon-importers
node example-articles/import-article-basic.js
```

**Advanced example** (attachments + info cards)

```bash
cd newmoon-importers
node example-articles/import-article-advanced.js
```

**Remove articles** using a snapshot (file must be a **JSON array** of objects with `id`):

```bash
cd newmoon-importers
node example-articles/remove.articles.js example-articles/import-logs/articles.imported.260331121414.json
```

---

## Output snapshots

Article imports write under `example-articles/import-logs/`:

- Basic demo: `articles.imported.{timestamp}.json`
- Advanced demo: `articles-advanced.imported.{timestamp}.json`

Use the matching path with `remove.articles.js` for cleanup.

---

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
| `translations`          | yes      | Non-empty array; each entry needs `languages_code` and `title`. Other writable keys: `short_description`, `customize_slug`. `slug` in examples is ignored on import (read-only in Directus). `featured_image` is set from `featured_image_path`. |
| `sites`                 | yes*     | Array of site UUIDs from the `sites` collection. Linked via `relateds_site_ids` on create. Required when `articles_sites` exists (current NewMoon).                                                                                               |
| `layout`                | no       | `basic` or `advanced` (must match Directus `articles.layout` choices). Default treated as `basic`.                                                                                                                                                  |
| `status`                | no       | Defaults to `published` if omitted. Use the stored choice **value**: `published`, `draft`, or `archived`.                                                                                                                                           |
| `publish_date`          | no       | Directus field name. You may also pass `published_date` in the payload; the importer maps either to `publish_date`. Falls back to `date_created` when set.                                                                                            |
| `date_created`          | no       | Applied in a **second** `update` after create (Directus sets it on insert).                                                                                                                                                                         |
| `featured_image_path`   | no       | Local path → uploaded to `/files`, id stored on translations as `featured_image`.                                                                                                                                                                   |
| `categories`            | no       | Array of category UUIDs → `articles_categories` after create. Create categories in Directus first; copy ids from your instance.                                                                                                                     |
| `content_blocks`        | no       | Ordered list of block descriptors (see below). Junction field `order`; optional `hide_on_devices` if you extend the importer payload.                                                                                                             |
| `attachment_paths`      | advanced | Array of local paths → `file_attachments` rows (supported extensions — see end of this doc).                                                                                                                                                        |
| `attachments`           | advanced | Alternative to `attachment_paths`: `[{ path, sort?, make_downloadable?, hide_file_icon?, hide_file_size?, translations? }]`.                                                                                                                        |
| `info_card_type_upsert` | advanced | Upsert spec for `info_card_types` + optional translation rows (see below). Supplies the default `type` id for every `info_cards[]` row unless a card sets `type` explicitly.                                                                        |
| `info_cards`            | advanced | Array of cards with `translations[]`. Each card needs a `type` (integer id from `info_card_types`) **or** rely on `info_card_type_upsert`. Optional `sort`.                                                                                         |


### Layout behavior

- **`basic`:** no `file_attachments` / `info_cards` rows are created (`attachments` and `info_cards` in the return value are `[]`). Paths in `attachment_paths` are **not** collected for upload unless layout is advanced.
- **`advanced`:** `attachment_paths` / `attachments` are uploaded and linked; `info_cards` are created if both `info_cards` and `info_cards_translations` collections exist. Optional `info_card_type_upsert` creates or updates a row in `info_card_types` and uses it as the default `info_cards.type`.

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
  type: 1,              // optional if article has info_card_type_upsert — integer id from info_card_types
  translations: [
    { languages_code: 'en', content: '<p>HTML</p>' },
    { languages_code: 'hy', content: '<p>…</p>' },
  ],
}
```

Every card must have at least one translation with `**languages_code**` and `**content**`.

### Advanced: `file_attachments` (current schema)

Writable on `file_attachments`: `article`, `file`, `sort`, `make_downloadable`, `hide_file_icon`, `hide_file_size`, `pages`, `list_file_name`.

Writable on `file_attachments_translations`: `file_attachments_id`, `languages_code`, `file_name`, and **`file`** (per-locale file id — required for the CMS UI to show a downloadable file, not only the name).

Either:

```js
attachment_paths: ['files/article_p.docx', 'files/article_e.xlsx'],
```

or:

```js
attachments: [
  { path: 'files/article_p.docx', sort: 1, file_name: 'Report.docx' },
],
```

If `file_attachments_translations` exists and you do **not** supply `spec.translations`, the importer fills one row per article locale with `file_name` (basename) and the uploaded `file` id. Existing auto-created translation rows are **updated** (so `file` is set) instead of duplicated.

---

## Content blocks (`content_blocks`)

Only these `type` values are implemented in `lib/helpers.js` (see [allowed types](#allowed-article-block-types-directus-m2a) above for the full Directus list):

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

**Non-empty `translations` required** (when that block has a translations relation in Directus) for: `block_title`, `block_richtext`, `block_alert`, `block_image`, `block_video` (with `video_url` per locale for URL type).

---

### `block_title`


| Where            | Fields (current schema)                                                                 |
| ---------------- | --------------------------------------------------------------------------------------- |
| `data`           | `font_size`: `h1` · `h2` · `h3` · `h4`; `column_size`: `1/1` · `1/2` · `1/3` · `2/3`; optional `text_color` |
| `translations[]` | `languages_code`, `title`                                                               |


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


| Where            | Fields (current schema)                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `data`           | `font_size`: `base` · `sm`; `column_size`: `1/1` · `1/2` · `1/3` · `2/3`                         |
| `translations[]` | `languages_code`, `content` (HTML)                                                               |


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


| Where            | Fields (current schema)                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `data`           | `variant`: `success` · `info` · `warning` · `error` · `standard`; `column_size`; optional `icon` (string) |
| `translations[]` | `languages_code`, `title`, `content` (HTML)                                                              |


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


| Where            | Fields (current schema)                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`           | `image_size`: `1/1` · `2/3` · `1/2` · `custom`; `alignment`: `left` · `center` · `right`; `column_size`; optional `custom_width`, `custom_height` (when `image_size` is `custom`)                          |
| `translations[]` | `languages_code`; `image_path` (local, uploaded) **or** `image` (existing file id); optional `image_alt_text`                                                                                               |


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


| Where            | Fields (current schema)                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`           | `type`: `url` · `file`. **URL mode:** put `video_url` on **`translations[]`** (NewMoon requires a URL for at least one language on create). Also `video_size`, `alignment`, `column_size`. **File:** `video_file_path` in payload → `video_file` (uuid) after upload. Sizes: `1/1` · `2/3` · `1/2` · `custom` (+ optional `custom_width` / `custom_height`). |
| `translations[]` | `languages_code`, `video_url` (required for URL type — nested on create). Legacy: a single `data.video_url` is copied to `en` + `hy` translations if `translations` is omitted.                                                                                                                                                                          |


```js
// External URL (per language)
{
  type: 'block_video',
  data: {
    type: 'url',
    video_size: '1/1',
  },
  translations: [
    { languages_code: 'en', video_url: 'https://www.youtube.com/watch?v=…' },
    { languages_code: 'hy', video_url: 'https://www.youtube.com/watch?v=…' },
  ],
},

```

---

### `block_gallery`

Requires `upload_here` (`block_gallery_files`) and/or `gallery_items` (`block_gallery_items`) relations when you use the matching payload keys. The main `block_gallery` row has no writable scalar fields in the current schema.


| Where     | Fields                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top-level | `upload_files_paths[]` — each path → `block_gallery_files` child with `directus_files_id`.                                                                                                   |
| Top-level | `gallery_items[]` — each item: `order`; `image_path` → `image`; optional `translations[]` with `languages_code`, `image_alt_text`.                                                       |


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

Requires an `accordions` relation → `block_accordion_items`.


| Where          | Fields                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`         | `column_size`: `1/1` · `1/2` · `1/3` · `2/3`                                                                                                             |
| `accordions[]` | Each panel: `sort`; optional `action_button_icon`, `action_button_link`; `translations[]` with `languages_code`, `title`, `content`, `action_button_label` |


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


| Where  | Fields (current schema)                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `data` | `mode`: `url` · `code`; at least one of `url` or `code`; optional `alignment`, `column_size` (`1/1` · `1/2` · `1/3` · `2/3`) |


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
3. For each id, deletes rows in (when possible): `articles_categories`, `articles_sites`, `articles_content_blocks`, `block_content_display_articles` filtered by `articles_id`.
4. Deletes the `articles` row.

It does **not** delete uploaded Directus files, block items, gallery children, accordion children, `file_attachments`, or `info_cards` by default—only what Directus cascades or you clean separately. Extend the script if you need deeper cleanup.

---

## Local file path resolution

For any local path string, the helper tries in order:

1. `path.resolve(process.cwd(), rawPath)`
2. `path.resolve(example-articles/, rawPath)` (parent of `lib/`)
3. `path.resolve(example-articles/lib/, rawPath)`

Uploads support:

- **Images:** `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`, `.avif`
- **Documents / archives:** `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.zip`

---

## Notes

- `import-logs/` outputs are typically ignored by git.
- `date_created` in Directus is set on create; the article importer can apply a custom value in a follow-up update.
- **Schema-driven fields:** Only writable fields present in the snapshot are sent; unknown keys in your payload are ignored by `pick` (importer-only keys like `match_translation` are handled separately and never passed to `createItem` on the wrong collection).
- **Layouts:** `articles.layout` choices are `basic` and `advanced` (case-insensitive match).
- **Status:** Use choice values `published`, `draft`, or `archived` — not admin UI labels.
- **Sites:** Required on create in current NewMoon; use at least one id from `sites`.
- **Slugs:** `articles_translations.slug` is read-only; Directus generates it from `title` unless `customize_slug` is used in the admin UI.
- **Publish date:** Directus field is `publish_date`; payload may use `publish_date` or `published_date`.
- **Warnings:** If a block type is not in `articles_content_blocks.item`'s allowed list, you'll see a console warning; creation will fail if you still use that type.
- **Unsupported blocks:** Types such as `block_audio`, `block_button`, `block_divider`, `block_social_media_links`, `block_code`, and `block_group` are allowed in Directus but not implemented in this importer yet.
