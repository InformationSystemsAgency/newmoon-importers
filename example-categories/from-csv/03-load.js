/**
 * Load: flat CSV batch → bulk `createItems` (categories, then translations) + snapshot JSON.
 */

import { createItems } from '@directus/sdk';
import fs from 'fs/promises';
import path from 'path';
import { getShortTimestamp } from '../../utils/timestamp.js';

/**
 * @param {unknown} res
 * @returns {string[]}
 */
function idsFromResponse(res) {
  const list = Array.isArray(res) ? res : res == null ? [] : [res];
  return list.map((row, i) => {
    const id = row?.id ?? row?.data?.id;
    if (!id) throw new Error(`No id in create response at index ${i}`);
    return id;
  });
}

/**
 * @param {Array<{ translations: Array<{ languages_code: string, title: string }> }>} rows
 * @param {{ client: import('@directus/sdk').RestClient, schema: object, importLogsDir: string, batchSize?: number }} ctx
 */
export async function load(rows, ctx) {
  const { client, schema, importLogsDir } = ctx;
  if (!importLogsDir) {
    throw new Error('load: ctx.importLogsDir is required');
  }

  console.log(`📊 Categories to load (batch insert): ${rows.length} row(s)\n`);

  if (rows.length === 0) {
    await fs.mkdir(importLogsDir, { recursive: true });
    const outPath = path.join(importLogsDir, `categories.imported.${getShortTimestamp()}.json`);
    await fs.writeFile(outPath, '[]', 'utf8');
    return { imported: [], outPath, totalCreated: 0 };
  }

   

  /** @type {string[]} */
  const ids = [];
  const imported = await client.request(createItems(schema.collection, rows));
  ids.push(...idsFromResponse(imported));
  
  
  await fs.mkdir(importLogsDir, { recursive: true });
  const outPath = path.join(importLogsDir, `categories.imported.${getShortTimestamp()}.json`);
  await fs.writeFile(outPath, JSON.stringify(imported, null, 2), 'utf8');

  console.log(`   ✅ Inserted ${imported.length} categor(y/ies) + translations in bulk\n`);

  return { imported, outPath, totalCreated: imported.length };
}
