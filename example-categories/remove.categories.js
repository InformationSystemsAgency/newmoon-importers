/**
 * Remove categories from Directus using an imported categories JSON file.
 *
 * Uses DIRECTUS_URL and DIRECTUS_IMPORTER_TOKEN from .env.
 * Reads a categories.imported.{timestamp}.json file (from from-csv/run.js and siblings) and deletes
 * all categories and their translations listed in it (subcategories first, then parents).
 *
 * Usage:
 *   node example-categories/remove.categories.js <path-to-imported-json>
 *
 * Example:
 *   node example-categories/remove.categories.js example-categories/import-logs/categories.imported.250211143052.json
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
 * Post-order walk for nested snapshot files (legacy tree shape with subcategories).
 */
function collectIdsPostOrder(node, out) {
  for (const sub of node.subcategories ?? []) {
    collectIdsPostOrder(sub, out);
  }
  if (node.id) out.push(node.id);
}

/**
 * @param {object[]} imported
 */
function getIdsToDelete(imported) {
  const first = imported[0];
  const nested =
    first &&
    Object.prototype.hasOwnProperty.call(first, 'subcategories') &&
    !Object.prototype.hasOwnProperty.call(first, 'parent_index');

  if (nested) {
    const ids = [];
    for (const root of imported) {
      collectIdsPostOrder(root, ids);
    }
    return ids;
  }

  // Flat snapshot: parent index always lower than child index → delete from end to start
  return imported.map((r) => r.id).filter(Boolean).reverse();
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('❌ Pass the path to the imported categories JSON file.');
    console.error('   Example: node remove.categories.js import-logs/categories.imported.250211143052.json');
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

function findTitleInNode(node, id) {
  if (node.id === id) return Object.values(node.title ?? {})[0] ?? id;
  for (const sub of node.subcategories ?? []) {
    const found = findTitleInNode(sub, id);
    if (found !== null) return found;
  }
  return null;
}

function findTitle(imported, id) {
  for (const row of imported) {
    if (row.id === id) return Object.values(row.title ?? {})[0] ?? id;
  }
  for (const root of imported) {
    const found = findTitleInNode(root, id);
    if (found !== null) return found;
  }
  return id;
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
