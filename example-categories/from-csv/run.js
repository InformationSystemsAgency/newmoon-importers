/**
 * Import categories from CSV (`../data/categories.etl.csv`) in **batches**.
 *
 *   node example-categories/from-csv/run.js
 */

import { createDirectus, rest, staticToken } from '@directus/sdk';
import { fileURLToPath } from 'url';
import path from 'path';
import { etlPipe } from '../../utils/etl/pipe.js';
import { extract } from './01-extract.js';
import { transform } from './02-transform.js';
import { load } from './03-load.js';
import { getCategoriesSchema } from '../utils/category.utils.js';
import { parseEnv } from '../utils/parse.env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(__dirname, '..');

const { directusUrl, directusToken } = parseEnv(exampleRoot);

const client = createDirectus(directusUrl).with(staticToken(directusToken)).with(rest());

async function main() {
  console.log('📥 Extract: streamed CSV (batched)\n');

  console.log('📡 Reading schema from Directus...\n');
  const schema = await getCategoriesSchema(client);

  console.log(`✅ Collection: ${schema.collection}`);
  console.log(`   Fields: ${schema.categoryFields.join(', ')}`);
  console.log(`   Translations: ${schema.translationsCollection} (${schema.translationFields.join(', ')})\n`);

  const ctx = {
    client,
    schema,
    importLogsDir: path.resolve(exampleRoot, 'import-logs'),
  };

  let results;
  try {
    results = await etlPipe(
      {
        batchSize: 2,
        extract,
        transform,
        load,
      },
      ctx,
    );
  } catch (err) {
    console.error('❌ ETL failed:', err.message);
    process.exit(1);
  }

  if (results.length === 0) {
    console.log('\nNothing to import (empty or no valid rows).');
    return;
  }

  const totalCreated = results.reduce((n, r) => n + r.totalCreated, 0);
  console.log(`\n🎉 Done. ${results.length} batch(es), ${totalCreated} category item(s) created.`);
  console.log(`   Snapshots: ${results.map((r) => path.basename(r.outPath)).join(', ')}`);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
