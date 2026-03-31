/**
 * Remove articles from Directus using an imported articles JSON file.
 *
 * Uses DIRECTUS_URL and DIRECTUS_IMPORTER_TOKEN from .env.
 * Reads a snapshot JSON array (from `writeImportLog` / import scripts) and deletes
 * all listed articles. Before deleting each article, it tries to remove rows from known
 * link/junction collections that reference the article.
 *
 * Usage:
 *   node example-articles/remove.articles.js <path-to-imported-json>
 *
 * Example:
 *   node example-articles/remove.articles.js example-articles/import-logs/articles.imported.260331121414.json
 */

import {
  createDirectus,
  rest,
  staticToken,
  readItems,
  deleteItem,
} from '@directus/sdk';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const directusUrl = process.env.DIRECTUS_URL;
const directusToken = process.env.DIRECTUS_IMPORTER_TOKEN;

if (!directusUrl) {
  console.error('DIRECTUS_URL must be set in environment.');
  process.exit(1);
}
if (!directusToken) {
  console.error('DIRECTUS_IMPORTER_TOKEN must be set in environment.');
  process.exit(1);
}

const client = createDirectus(directusUrl)
  .with(staticToken(directusToken))
  .with(rest());

const ARTICLES_COLLECTION = 'articles';
const OPTIONAL_LINK_COLLECTIONS = [
  'articles_categories',
  'articles_content_blocks',
  'block_content_display_articles',
];

function getIdsToDelete(imported) {
  return imported.map((item) => item?.id).filter(Boolean);
}

function findTitle(imported, id) {
  const row = imported.find((item) => item?.id === id);
  return row?.translations?.[0]?.title ?? id;
}

/**
 * Attempts to clean junction/link rows that reference a given article.
 * If a collection does not exist or permissions are missing, it is disabled after first failure.
 */
const collectionState = new Map(); // collection -> 'enabled' | 'disabled'

async function cleanupLinkedRows(collection, articleId) {
  if (collectionState.get(collection) === 'disabled') return 0;

  try {
    const rows = await client.request(
      readItems(collection, {
        filter: { articles_id: { _eq: articleId } },
        fields: ['id'],
        limit: -1,
      })
    );

    collectionState.set(collection, 'enabled');

    let deleted = 0;
    for (const row of rows) {
      if (!row?.id) continue;
      await client.request(deleteItem(collection, row.id));
      deleted++;
    }
    return deleted;
  } catch (err) {
    collectionState.set(collection, 'disabled');
    console.warn(`⚠️ Skipping "${collection}" cleanup: ${err.message}`);
    return 0;
  }
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Pass the path to the imported articles JSON file.');
    console.error('Example: node remove.articles.js import-logs/articles.imported.260211172255.json');
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);

  let imported;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    imported = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read "${filePath}": ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(imported) || imported.length === 0) {
    console.log('Nothing to delete (empty or invalid file).');
    process.exit(0);
  }

  const idsToDelete = getIdsToDelete(imported);
  if (idsToDelete.length === 0) {
    console.log('Nothing to delete (no article ids in file).');
    process.exit(0);
  }

  console.log(`Loaded ${path.basename(filePath)}: ${idsToDelete.length} article id(s) to delete.\n`);

  let deletedArticles = 0;
  let failedArticles = 0;
  let cleanedLinkedRows = 0;

  for (const articleId of idsToDelete) {
    try {
      for (const collection of OPTIONAL_LINK_COLLECTIONS) {
        cleanedLinkedRows += await cleanupLinkedRows(collection, articleId);
      }

      await client.request(deleteItem(ARTICLES_COLLECTION, articleId));
      const label = findTitle(imported, articleId);
      console.log(`🗑 Deleted article: ${label} (${articleId})`);
      deletedArticles++;
    } catch (err) {
      console.error(`❌ Failed to delete article ${articleId}: ${err.message}`);
      failedArticles++;
    }
  }

  console.log('');
  console.log(`Done. Deleted ${deletedArticles} article(s).`);
  console.log(`Cleaned ${cleanedLinkedRows} linked row(s) from known junction collections.`);
  if (failedArticles > 0) {
    console.log(`Failed: ${failedArticles} article(s).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Remove failed:', err.message);
  process.exit(1);
});
