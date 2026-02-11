# Article import example

Example scripts to **import** and **remove** **articles** in NewMoon's [Directus](https://directus.io), including:

- article translations
- categories links
- featured image upload from local file
- advanced layout extras: file attachments, info cards
- article content blocks (`articles_content_blocks`) with nested child rows

## Scripts

| Script | Description |
|--------|-------------|
| `import.articles.js` | Creates articles from `EXAMPLE_ARTICLES`, uploads local files, creates translations/categories/advanced extras/content blocks, and writes IDs to `imports/articles.imported.{timestamp}.json`. |
| `remove.articles.js` | Deletes all articles listed in an imported JSON file and cleans known link collections first. |

## Prerequisites

- Directus with these collections configured:
  - `articles`, `articles_translations`, `articles_categories`, `articles_content_blocks`
  - (advanced) `file_attachments`, `file_attachments_translations`, `info_cards`, `info_cards_translations`
- A valid `content_type` id from `content_types`
- Local media files (for example in `example-articles/attachments/`)

## Environment variables

Create `.env` in project root (or in `example-articles/`):

```env
DIRECTUS_URL=http://localhost:8055
DIRECTUS_IMPORTER_TOKEN=your_static_token_here
```

Token needs permissions to read/create/update/delete the collections used by your import scenario.

## How to run

From project root:

```bash
node example-articles/import.articles.js
```

Remove by snapshot file:

```bash
node example-articles/remove.articles.js example-articles/imports/articles.imported.260211193352.json
```

## Data shape (`EXAMPLE_ARTICLES`)

Minimum per article:

- `content_type` (uuid)
- `translations` (array with at least one `{ languages_code, title }`)

Common optional fields:

- `layout`: `basic` or `advanced`
- `status`
- `date_created` (script updates it after create)
- `published_date`
- `featured_image_path` (local file path)
- `categories` (array of category ids)

Advanced optional fields:

- `attachment_paths`: array of local files to create `file_attachments`
- `info_cards`: array of info card objects with translations
- `content_blocks`: ordered list of article blocks

## Content blocks

Supported block types:

- `block_title`
- `block_richtext`
- `block_image`
- `block_gallery`
- `block_video`
- `block_audio`
- `block_embed`
- `block_button`
- `block_alert`
- `block_accordions`
- `block_divider`
- `block_social_media_links`
- `block_code`
- `block_group` (supports nested `content_blocks`)

Base shape for each block item in `content_blocks`:

```js
{
  type: 'block_richtext',      // required, one of supported collection names
  order: 1,                    // optional, importer defaults by array index
  hide_on_devices: ['mobile'], // optional
  data: {},                    // optional block-level fields
  translations: [],            // optional, required for some block types
  // optional child arrays for composite blocks:
  // accordions, gallery_items, social_media_links, content_blocks
}
```

## Block data reference

- `block_title`: `translations[].title` required; optional `data.column_size`, `data.font_size`, `data.text_color`.
- `block_richtext`: `translations[].content` required; optional `data.column_size`, `data.font_size`.
- `block_image`: `translations[].image` or `translations[].image_path` required; optional `translations[].image_alt_text`, `data.alignment`, `data.image_size`, `data.column_size`, `data.custom_height`, `data.custom_width`.
- `block_video`: optional `data.type` (`url`/`file`), `data.video_url`, `data.video_file` or `data.video_file_path`, and sizing/alignment fields.
- `block_audio`: optional `data.type` (`url`/`file`), `data.url`, `data.audio` or `data.audio_path`, and sizing/alignment fields.
- `block_embed`: at least one of `data.url` or `data.code` is required; optional `data.mode`, alignment/sizing fields.
- `block_button`: `data.link` required (existing link id); optional `data.variant`, `data.size`, `data.icon`, `data.icon_alignment`, `data.button_alignment`, `data.column_size`.
- `block_alert`: optional `data.variant`, `data.icon`, `data.column_size`; optional `translations[].title`, `translations[].content`.
- `block_accordions`: child array `accordions` with optional `sort`, optional `action_button_link`, `action_button_icon`; each accordion item typically uses `translations[].title` (required by schema) and optional `translations[].content`.
- `block_divider`: optional `data.icon`, `data.column_size`; optional `translations[].title`.
- `block_social_media_links`: child array `social_media_links` with required `social_media_platform` and `url`, optional `order`.
- `block_code`: required `data.code`, `data.language`, `data.theme`; optional `data.column_size`.
- `block_gallery`: optional `upload_files_paths` for direct gallery file links; optional `gallery_items[]` with required `image` or `image_path`, optional `order`, and optional `translations[].image_alt_text`.
- `block_group`: optional `data.internal_identifier`, `data.column_size`, `data.layout_option`; nested `content_blocks` works recursively with same shape.

## Example: article with blocks

```js
{
  content_type: '5ec59920-94ac-4eb0-9d12-c029f7679766',
  layout: 'advanced',
  status: 'Published',
  date_created: '2026-02-11T12:00:00.000Z',
  featured_image_path: 'attachments/1-800x600.png',
  translations: [
    { languages_code: 'en', title: 'Article EN', short_description: '<p>Short EN</p>' },
    { languages_code: 'hy', title: 'Հոդված HY', short_description: '<p>Կարճ HY</p>' }
  ],
  content_blocks: [
    {
      type: 'block_title',
      order: 1,
      data: { font_size: 'h3', column_size: '1/1' },
      translations: [
        { languages_code: 'en', title: 'Section title EN' },
        { languages_code: 'hy', title: 'Բաժնի վերնագիր HY' }
      ]
    },
    {
      type: 'block_richtext',
      order: 2,
      translations: [
        { languages_code: 'en', content: '<p>Body EN</p>' },
        { languages_code: 'hy', content: '<p>Մարմին HY</p>' }
      ]
    },
    {
      type: 'block_image',
      order: 3,
      data: { alignment: 'left', image_size: '1/1' },
      translations: [
        { languages_code: 'en', image_path: 'attachments/1-800x600.png', image_alt_text: 'Alt EN' },
        { languages_code: 'hy', image_path: 'attachments/1-800x600.png', image_alt_text: 'Alt HY' }
      ]
    }
  ]
}
```

## Example: composite and nested blocks

```js
[
  {
    type: 'block_accordions',
    order: 10,
    accordions: [
      {
        sort: 1,
        translations: [
          { languages_code: 'en', title: 'Accordion EN', content: '<p>Accordion body EN</p>' },
          { languages_code: 'hy', title: 'Ակորդեոն HY', content: '<p>Ակորդեոն HY</p>' }
        ]
      }
    ]
  },
  {
    type: 'block_gallery',
    order: 11,
    upload_files_paths: ['attachments/1-800x600.png', 'attachments/3-800x600.png'],
    gallery_items: [
      {
        order: 1,
        image_path: 'attachments/1-800x600.png',
        translations: [
          { languages_code: 'en', image_alt_text: 'Gallery alt EN' },
          { languages_code: 'hy', image_alt_text: 'Gallery alt HY' }
        ]
      }
    ]
  },
  {
    type: 'block_group',
    order: 12,
    data: { layout_option: 'stack' },
    content_blocks: [
      {
        type: 'block_code',
        order: 1,
        data: {
          code: 'console.log(\"nested block\");',
          language: 'javascript',
          theme: 'github-dark'
        }
      }
    ]
  }
]
```

## Notes

- `date_created` in Directus is auto-set on create. The importer applies your `date_created` value in a second update step.
- Local paths are resolved from project root first, then from `example-articles/`.
- Import creates new rows. Use the generated snapshot file with `remove.articles.js` for cleanup.
