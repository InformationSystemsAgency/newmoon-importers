# NewMoon Importers

Node.js scripts for importing structured content into Directus of NewMoon CMS.

This repository currently contains a working importer for **articles** (`example-articles/`).

## Requirements

- Node.js 18+
- Access to a Directus instance
- A static API token with required collection permissions

## Setup

1. Install dependencies:

```bash
npm install
```

1. Configure environment in project root `.env`:

```env
DIRECTUS_URL=http://localhost:8055
DIRECTUS_IMPORTER_TOKEN=your_static_token_here
```

## Project structure

- `example-articles/`
  - `import-article-basic.js` — basic layout demo
  - `import-article-advanced.js` — advanced layout (attachments, info cards) demo
  - `lib/helpers.js` — `importArticle(payload)`
  - `remove.articles.js` — delete articles from a snapshot file
  - `README.md` — payload shapes, blocks, env, usage
- `utils/` — `write-log.js` (`writeImportLog`), `timestamp.js` (log filename timestamps)

## Articles importer

Creates articles with translations, featured image upload, advanced extras when using `layout: 'advanced'`, and content blocks. Payload options and optional fields are documented in `example-articles/README.md`.

- **Docs:** `example-articles/README.md`

**Import**

```bash
node example-articles/import-article-basic.js
node example-articles/import-article-advanced.js
```

**Remove** (pass a snapshot JSON array from `import-logs/`)

```bash
node example-articles/remove.articles.js example-articles/import-logs/articles.imported.<timestamp>.json
```

## Output snapshots

Article imports write under `example-articles/import-logs/`:

- Basic demo: `articles.imported.{timestamp}.json`
- Advanced demo: `articles-advanced.imported.{timestamp}.json`

Use the matching path with `remove.articles.js` for cleanup.

## Notes

- `import-logs/` outputs are typically ignored by git.
- `date_created` in Directus is set on create; the article importer can apply a custom value in a follow-up update—see `example-articles/README.md`.

