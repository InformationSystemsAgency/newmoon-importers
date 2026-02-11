# NewMoon Importers

Node.js scripts for importing structured content into Directus.

This repository currently contains working importers for:

- categories (`example-categories/`)
- articles (`example-articles/`)

## Requirements

- Node.js 18+
- Access to a Directus instance
- A static API token with required collection permissions

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment in project root `.env`:

```env
DIRECTUS_URL=http://localhost:8055
DIRECTUS_IMPORTER_TOKEN=your_static_token_here
```

## Project structure

- `example-categories/`
  - `import.categories.js`
  - `remove.categories.js`
  - `README.md`
- `example-articles/`
  - `import.articles.js`
  - `remove.articles.js`
  - `README.md`
- `utils/`
  - shared helpers (`timestamp`, lorem text)

## Importers

### Categories importer

Use this for creating/removing categories with translations and subcategories.

- docs: `example-categories/README.md`
- import:

```bash
node example-categories/import.categories.js
```

- remove:

```bash
node example-categories/remove.categories.js example-categories/imports/categories.imported.YYMMDDHHMMSS.json
```

### Articles importer

Use this for creating/removing articles with:

- translations
- featured image upload from local files
- category links
- advanced layout extras (attachments, info cards)
- content blocks (`articles_content_blocks`) including nested/composite blocks

- docs: `example-articles/README.md`
- import:

```bash
node example-articles/import.articles.js
```

- remove:

```bash
node example-articles/remove.articles.js example-articles/imports/articles.imported.YYMMDDHHMMSS.json
```

## Output snapshots

Each import writes a snapshot into the importer's `imports/` directory:

- categories: `example-categories/imports/categories.imported.{timestamp}.json`
- articles: `example-articles/imports/articles.imported.{timestamp}.json`

Use these files with the matching `remove.*.js` script for cleanup.

## Notes

- `imports/` outputs are ignored by git.
- `date_created` fields in Directus are system-managed on create; article importer applies custom `date_created` in a follow-up update step.
- For full block-level article data format and examples, see `example-articles/README.md`.
