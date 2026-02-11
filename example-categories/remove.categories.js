/**
 * Remove categories from Directus using an imported categories JSON file.
 *
 * Uses DIRECTUS_URL and DIRECTUS_IMPORTER_TOKEN from .env.
 * Reads a categories.imported.{timestamp}.json file (from import.categories.js) and deletes
 * all categories and their translations listed in it (subcategories first, then parents).
 *
 * Usage:
 *   node example-categories/remove.categories.js <path-to-imported-json>
 *
 * Example:
 *   node example-categories/remove.categories.js example-categories/imports/categories.imported.250211143052.json
 */

import { createDirectus, rest, staticToken, deleteItem } from '@directus/sdk';
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
  console.error('❌ DIRECTUS_URL must be set in the environment (e.g. in .env).');
  process.exit(1);
}
if (!directusToken) {
  console.error('❌ DIRECTUS_IMPORTER_TOKEN must be set in the environment (e.g. in .env).');
  process.exit(1);
}

const client = createDirectus(directusUrl)
  .with(staticToken(directusToken))
  .with(rest());

const CATEGORIES_COLLECTION = 'categories';
const CATEGORIES_TRANSLATIONS_COLLECTION = 'categories_translations';

/**
 * Collect category IDs from imported JSON in delete order: subcategory IDs first, then parent IDs.
 */
function getIdsToDelete(imported) {
  const subIds = [];
  const parentIds = [];
  for (const parent of imported) {
    for (const sub of parent.subcategories ?? []) {
      if (sub.id) subIds.push(sub.id);
    }
    if (parent.id) parentIds.push(parent.id);
  }
  return [...subIds, ...parentIds];
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('❌ Pass the path to the imported categories JSON file.');
    console.error('   Example: node remove.categories.js imports/categories.imported.250211143052.json');
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);
  let imported;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    imported = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read "${filePath}":`, err.message);
    process.exit(1);
  }

  if (!Array.isArray(imported) || imported.length === 0) {
    console.log('Nothing to delete (empty or invalid file).');
    process.exit(0);
  }

  const idsToDelete = getIdsToDelete(imported);
  console.log(`📂 Loaded ${path.basename(filePath)}: ${idsToDelete.length} category id(s) to delete.\n`);

  let deleted = 0;
  for (const id of idsToDelete) {
    try {
      await client.request(deleteItem(CATEGORIES_COLLECTION, id));
      const label = findTitle(imported, id);
      console.log(`   🗑 Deleted: ${label} (${id})`);
      deleted++;
    } catch (err) {
      console.error(`   ❌ Failed to delete ${id}:`, err.message);
    }
  }

  console.log(`\n🎉 Done. Deleted ${deleted} category item(s).`);
}

function findTitle(imported, id) {
  for (const parent of imported) {
    if (parent.id === id) return Object.values(parent.title ?? {})[0] ?? id;
    for (const sub of parent.subcategories ?? []) {
      if (sub.id === id) return Object.values(sub.title ?? {})[0] ?? id;
    }
  }
  return id;
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
