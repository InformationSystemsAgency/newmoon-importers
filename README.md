# NewMoon Importers

Node.js scripts for importing structured content into Directus[^directus] of NewMoon. 

This repository currently contains a working importer for **articles** (`example-articles/`).

## ETL methodology

Importers here follow a classic **ETL** split: **Extract**, **Transform**, and **Load**.

- **Extract** — Pulling data from your sources (CMS exports, APIs, files, databases, scrapers, and so on).
- **Transform** — Cleaning, normalizing, and mapping that data into the payload shapes Directus expects (fields, relations, blocks, locales).

Those two steps are **not** provided by this repository. You implement extract and transform in your own pipelines, jobs, or scripts according to your sources and rules.

- **Load** — Creating or updating records in Directus from already-prepared payloads. The examples and helpers in this repo (for example `importArticle` and the article demo scripts) cover **this** part: they take structured input and perform the Directus writes, uploads, and relations.

In short: this project is a **Load** toolkit and reference; **Extract** and **Transform** stay with you as the user of the repo.

### Example: ETL with `importArticle`

Below, **extract** and **transform** are sketched as plain functions; **load** is `importArticle` from this repo. Adjust paths, UUIDs, and fields to match your Directus project (see `example-articles/README.md` for the full article payload).

```javascript
// Run from repo root with Node 18+ (same ESM setup as this project).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { importArticle } from './example-articles/lib/helpers.js';
import { writeImportLog } from './utils/write-log.js';

// --- Extract: replace with fetch(), DB driver, CMS SDK, etc. ---
async function extract() {
  const json = await readFile('./data/source-articles.json', 'utf8');
  return JSON.parse(json); // e.g. [{ title, slug, bodyHtml, ... }, ...]
}

// --- Transform: your mapping into the importer’s payload shape ---
function transform(row) {
  return {
    content_type: 'YOUR_ARTICLES_CONTENT_TYPE_UUID',
    status: 'published',
    layout: 'basic',
    featured_image_path: row.coverImagePath, // optional; path relative to cwd
    translations: [
      {
        languages_code: 'en',
        title: row.title,
        slug: row.slug,
        short_description: `<p>${row.teaser}</p>`,
      },
    ],
    content_blocks: [
      {
        type: 'block_richtext',
        data: { font_size: 'base', column_size: '1/1' },
        translations: [
          { languages_code: 'en', content: row.bodyHtml },
        ],
      },
    ],
  };
}

// --- Load: provided by this repository ---
const rows = await extract(); //EXTRACT
const imported = [];
const importLogsDir = path.resolve(process.cwd(), 'example-articles/import-logs');

for (const row of rows) {
  const payload = transform(row); //TRANSFORM
  const result = await importArticle(payload); //LOAD 
  imported.push(result);
  console.log('Created article', result.id);
}

const logPath = await writeImportLog(importLogsDir, 'articles.imported', imported);
console.log('Snapshot for remove.articles.js:', logPath);
```

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
DIRECTUS_URL=your.cms.url.here
DIRECTUS_IMPORTER_TOKEN=your_static_token_here
```

   Create a **static token** in Directus for an administrative account with the permissions needed for your import. See [how to generate a token](https://youtu.be/FR_cDNCzRa8?si=kNZmPx2TDjX5RdWH&t=350) (video).

> ⚠️ **Important — revoke the token after import**  
> When imports are finished, **revoke or rotate** that token in Directus (delete it or issue a new one) so the credential is not left active longer than necessary. Remove or update `DIRECTUS_IMPORTER_TOKEN` in `.env` if you no longer need it.

## Project structure

- `example-articles/`
  - `import-article-basic.js` — basic layout demo
  - `import-article-advanced.js` — advanced layout (attachments, info cards) demo
  - `lib/helpers.js` — `importArticle(payload)`
  - `remove.articles.js` — delete articles from a snapshot file
  - `README.md` — payload shapes, blocks, env, usage
- `utils/` — `write-log.js` (`writeImportLog`), `timestamp.js` (log filename timestamps)



## Importer Scripts

### Articles importer

Creates articles with translations, featured image upload, advanced extras when using `layout: 'advanced'`, and content blocks. Payload options and optional fields are documented in:

- **Docs:** [example-articles/README.md](./example-articles/README.md)

## Notes

- `import-logs/` outputs are typically ignored by git.
- `date_created` in Directus is set on create; the article importer can apply a custom value in a follow-up update—see `example-articles/README.md`.

---

[^directus]: Directus is a backend CMS of NewMoon project: [https://directus.io/docs/](https://directus.io/docs/) 

